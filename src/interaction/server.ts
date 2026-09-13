import express from 'express'
import { createServer, request } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { Server } from 'socket.io'
import { NAMESPACE, PPT_COMMANDS, REACTIONS } from './protocol'
import type {
  ClientEvents,
  ClientPayloads,
  ClientResults,
  ServerEvents,
  SystemStatus,
  PowerPointCommand,
  PowerPointStatus,
  JoinPayload,
  InternetStatus
} from './protocol'
import type { PowerPointController } from './powerpoint'
import { Room, roomId } from './room'
import { allowedDevPath } from './dev-paths'
import { createSourceArchive } from './source'
import {
  boolean,
  fail,
  InteractionError,
  object,
  nickname,
  publicError,
  RateLimit,
  secretMatches,
  string
} from './validation'

interface SocketData {
  room?: Room
  participantId?: string
  host?: boolean
}
export function lanAddresses(): string[] {
  const addresses = [
    ...new Set(
      Object.values(networkInterfaces()).flatMap((list) =>
        (list ?? []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address)
      )
    )
  ]
  const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  return addresses.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)))
}
export interface ServerOptions {
  controller: PowerPointController
  webRoot?: string
  devUrl?: string
  devRoot?: string
  sourceArchive?: string
  logger?: (event: string, detail?: string) => void
}
export function createInteractionServer(options: ServerOptions) {
  const log =
    options.logger ??
    ((event: string, detail?: string) => console.info(`[interaction] ${event}`, detail ?? ''))
  const rooms = new Map<string, Room>()
  const createRoom = () => {
    let id = roomId()
    while (rooms.has(id)) id = roomId()
    const room = new Room(id)
    rooms.set(id, room)
    log('room created', id)
    return room
  }
  const activeRoom = createRoom()
  const web = express()
  web.disable('x-powered-by')
  web.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
    )
    next()
  })
  web.get('/health', (_req, res) => res.json({ ready: true, roomId: activeRoom.id }))
  let sourceBuild: Promise<void> | undefined
  web.get('/source', async (_req, res) => {
    if (options.devUrl && options.devRoot && options.sourceArchive) {
      try {
        sourceBuild ??= createSourceArchive(options.devRoot, options.sourceArchive)
        await sourceBuild
      } catch {
        res.status(503).send('현재 소스 아카이브 생성 실패. 호스트에서 빌드를 확인하세요.')
        return
      } finally {
        sourceBuild = undefined
      }
    }
    if (options.sourceArchive && existsSync(options.sourceArchive))
      res.download(options.sourceArchive, 'buzz-chat-ppt-remote-source.tar.gz')
    else
      res.status(503).send('현재 버전 소스 아카이브가 없습니다. 호스트에서 앱을 다시 빌드하세요.')
  })
  // Legacy endpoints are absent even during dev proxying.
  web.use(['/win-control.io', '/downloadFile', '/getInfo', '/mobile.html'], (_req, res) => {
    res.status(404).end()
  })
  if (options.devUrl) {
    web.use((req, res) => {
      const path =
        /^\/(r|host)\/[A-Z2-9]{6}$/.test(req.path) || req.path === '/'
          ? '/interaction.html'
          : req.url
      if (
        !['GET', 'HEAD'].includes(req.method) ||
        !options.devRoot ||
        !allowedDevPath(path, options.devRoot)
      ) {
        res.status(404).end()
        return
      }
      const target = new URL(options.devUrl!)
      target.pathname = path.split('?')[0]
      target.search = path.includes('?') ? path.slice(path.indexOf('?')) : ''
      const upstream = request(target, { method: 'GET' }, (incoming) => {
        res.status(incoming.statusCode ?? 502)
        if (incoming.headers['content-type']) res.type(incoming.headers['content-type'])
        incoming.pipe(res)
      })
      upstream.on('error', () => {
        if (!res.headersSent) res.status(502).send('개발 서버 연결 실패')
        else res.destroy()
      })
      upstream.setTimeout(10000, () => upstream.destroy(new Error('Dev proxy timeout')))
      res.on('close', () => upstream.destroy())
      upstream.end()
    })
  } else if (options.webRoot) {
    web.use(express.static(options.webRoot, { index: false }))
    web.get(/^\/(r|host)\/[A-Z2-9]{6}$|^\/$/, (_req, res) =>
      res.sendFile(join(options.webRoot!, 'interaction.html'))
    )
  }
  const http = createServer(web)
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(http, {
    maxHttpBufferSize: 8192,
    serveClient: false,
    connectTimeout: 10000
  })
  io.of('/').use((_socket, next) => next(new Error('UNAUTHORIZED')))
  const nsp = io.of(NAMESPACE)
  let system: SystemStatus = {
    port: 0,
    addresses: [],
    participantUrls: [],
    platform: process.platform
  }
  const hostChannel = (room: Room) => `host:${room.id}`
  const participantChannel = (id: string) => `participant:${id}`
  const emitPpt = (room: Room, status: PowerPointStatus) => {
    const recipients = room.controllerId
      ? nsp.to(hostChannel(room)).to(participantChannel(room.controllerId))
      : nsp.to(hostChannel(room))
    recipients.emit('ppt:status', status)
  }
  let pptBusy = false
  async function runPpt(room: Room, command: PowerPointCommand): Promise<PowerPointStatus> {
    if (pptBusy) {
      const message = 'PowerPoint 명령 실행 중입니다. 요청한 명령은 실행되지 않았습니다.'
      nsp.to(hostChannel(room)).emit('app:error', { code: 'RATE_LIMITED', message })
      fail('RATE_LIMITED', message)
    }
    pptBusy = true
    log('ppt command', command)
    try {
      await options.controller[command]()
      const status = await options.controller.getStatus()
      emitPpt(room, status)
      return status
    } catch (error) {
      const appError =
        error instanceof InteractionError
          ? publicError(error)
          : {
              code: 'POWERPOINT_COMMAND_FAILED' as const,
              message: 'PowerPoint 명령 실행 실패. 슬라이드 쇼와 권한을 확인하세요.'
            }
      log('ppt failure', appError.code)
      nsp.to(hostChannel(room)).emit('app:error', appError)
      const status = await options.controller.getStatus().catch(() => ({
        running: false,
        accessibilityGranted: false,
        ready: false,
        lastError: appError,
        mock: false
      }))
      emitPpt(room, { ...status, lastError: appError })
      fail(appError.code, appError.message)
    } finally {
      pptBusy = false
    }
  }
  nsp.on('connection', (socket) => {
    const packetLimit = new RateLimit(80, 1000)
    const hostLimit = new RateLimit(12, 1000)
    const joinedTimer = setTimeout(() => {
      if (!socket.data.room) socket.disconnect(true)
    }, 10000)
    socket.use((_packet, next) => {
      try {
        packetLimit.accept()
        next()
      } catch {
        socket.emit('app:error', { code: 'RATE_LIMITED', message: '요청이 너무 많습니다.' })
        socket.disconnect(true)
      }
    })
    const roomFor = (host = false): Room => {
      if (!socket.data.room || (host && !socket.data.host)) {
        log('authorization failure')
        fail('UNAUTHORIZED', '호스트 권한이 필요합니다.')
      }
      if (host) hostLimit.accept()
      return socket.data.room
    }
    const pptRoom = (): Room => {
      const room = roomFor()
      if (
        !socket.data.host &&
        (!socket.data.participantId || room.controllerId !== socket.data.participantId)
      )
        fail('UNAUTHORIZED', 'PowerPoint 제어권이 필요합니다.')
      hostLimit.accept()
      return room
    }
    const participantFor = (): { room: Room; id: string } => {
      const room = roomFor()
      if (!socket.data.participantId) fail('UNAUTHORIZED', '참가자만 사용할 수 있습니다.')
      return { room, id: socket.data.participantId }
    }
    const findRoom = (value: unknown): Room => {
      const id = string(value, 6, 6)
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(id)) fail('INVALID_PAYLOAD', '방 코드가 올바르지 않습니다.')
      const room = rooms.get(id)
      if (!room) fail('ROOM_NOT_FOUND', '방을 찾을 수 없습니다. QR 코드를 다시 스캔하세요.')
      return room
    }
    // Runtime input is untrusted despite shared compile-time event types.
    function handle<K extends keyof ClientPayloads>(
      event: K,
      fn: (payload: unknown) => ClientResults[K] | Promise<ClientResults[K]>
    ): void {
      const listener = async (payload: ClientPayloads[K], ack: (result: unknown) => void) => {
        try {
          const data = await fn(payload)
          if (typeof ack === 'function') ack({ ok: true, data })
        } catch (error) {
          const result = { ok: false, error: publicError(error) }
          if (typeof ack === 'function') ack(result)
          else socket.emit('app:error', result.error)
        }
      }
      // Socket.IO's conditional generic listener loses the K-to-payload mapping here.
      socket.on(event, listener as Parameters<typeof socket.on<K>>[1])
    }
    handle('room:join', (payload) => {
      const p = object(payload, ['roomId', 'participantId', 'nickname', 'resumeToken'])
      if (socket.data.room) fail('INVALID_PAYLOAD', '이미 방에 연결되어 있습니다.')
      const room = findRoom(p.roomId)
      if (p.participantId !== undefined && !/^[a-f0-9-]{36}$/.test(string(p.participantId, 36, 36)))
        fail('INVALID_PAYLOAD', '참가자 ID가 올바르지 않습니다.')
      if (p.nickname !== undefined) nickname(p.nickname)
      if (p.resumeToken !== undefined && !/^[a-f0-9]{64}$/.test(string(p.resumeToken, 64, 64)))
        fail('INVALID_PAYLOAD', '재접속 키가 올바르지 않습니다.')
      const identity = room.join(p as unknown as JoinPayload, socket.id)
      socket.data = { room, participantId: identity.participantId, host: false }
      socket.join(room.id)
      socket.join(participantChannel(identity.participantId))
      clearTimeout(joinedTimer)
      nsp.to(room.id).emit('presence:update', room.participants())
      log(
        p.participantId === identity.participantId ? 'participant reconnect' : 'participant join',
        room.id
      )
      return { identity, state: room.state(), hasBuzzed: room.hasBuzzed(identity.participantId) }
    })
    handle('host:join', async (payload) => {
      const p = object(payload, ['roomId', 'token'])
      if (socket.data.room) fail('INVALID_PAYLOAD', '이미 방에 연결되어 있습니다.')
      const room = findRoom(p.roomId)
      if (!secretMatches(p.token, room.hostToken)) {
        log('authorization failure')
        fail('UNAUTHORIZED', '호스트 키가 올바르지 않습니다.')
      }
      socket.data = { room, host: true }
      socket.join(room.id)
      socket.join(hostChannel(room))
      clearTimeout(joinedTimer)
      socket.emit('system:status', system)
      // A status probe is independent from host authentication/readiness.
      void options.controller
        .getStatus()
        .then((status) => socket.emit('ppt:status', status))
        .catch((error) => socket.emit('app:error', publicError(error)))
      return { state: room.state() }
    })
    handle('participant:rename', (payload) => {
      const { room, id } = participantFor()
      const name = room.rename(id, object(payload, ['nickname']).nickname)
      nsp.to(room.id).emit('presence:update', room.participants())
      nsp.to(room.id).emit('buzz:state', room.buzz)
      return { nickname: name }
    })
    handle('ppt:assign', (payload) => {
      const room = roomFor(true)
      const id = object(payload, ['participantId']).participantId
      if (id !== null && (typeof id !== 'string' || !room.participants().some((p) => p.id === id)))
        fail('INVALID_PAYLOAD', '연결된 참가자를 선택하세요.')
      room.controllerId = id as string | null
      nsp.to(room.id).emit('ppt:controller', room.controllerId)
      void options.controller
        .getStatus()
        .then((status) => emitPpt(room, status))
        .catch(() => {})
      return { participantId: room.controllerId }
    })
    handle('buzz:press', (payload) => {
      const p = object(payload, ['roundId'])
      if (!Number.isSafeInteger(p.roundId) || Number(p.roundId) < 1)
        fail('INVALID_PAYLOAD', '라운드가 올바르지 않습니다.')
      const { room, id } = participantFor()
      const winner = room.press(id, p.roundId as number)
      nsp.to(room.id).emit('buzz:state', room.buzz)
      if (winner) {
        log('buzz winner', `${room.id} round ${room.buzz.round}`)
        if (room.settings.autoAdvanceOnWinner) {
          // State is committed and broadcast before automation enters the event loop.
          setImmediate(() => {
            void runPpt(room, 'advance').catch(() => {
              /* Host already received the failure. */
            })
          })
        }
      }
      return room.buzz
    })
    handle('buzz:reset', (payload) => {
      const room = roomFor(true)
      object(payload, [])
      room.reset()
      nsp.to(room.id).emit('buzz:state', room.buzz)
      log('buzz reset', room.id)
      return room.buzz
    })
    handle('buzz:restart', (payload) => {
      const room = roomFor(true)
      object(payload, [])
      room.reset(true)
      nsp.to(room.id).emit('buzz:state', room.buzz)
      return room.buzz
    })
    handle('buzz:set-mode', (payload) => {
      const room = roomFor(true)
      const mode = object(payload, ['mode']).mode
      if (mode !== 'first' && mode !== 'all')
        fail('INVALID_PAYLOAD', '버저 모드가 올바르지 않습니다.')
      room.buzz.mode = mode
      nsp.to(room.id).emit('buzz:state', room.buzz)
      return room.buzz
    })
    handle('buzz:set-enabled', (payload) => {
      const room = roomFor(true)
      room.buzz.enabled = boolean(object(payload, ['enabled']).enabled)
      nsp.to(room.id).emit('buzz:state', room.buzz)
      return room.buzz
    })
    handle('room:set-settings', (payload) => {
      const room = roomFor(true)
      room.settings.autoAdvanceOnWinner = boolean(
        object(payload, ['autoAdvanceOnWinner']).autoAdvanceOnWinner
      )
      nsp.to(hostChannel(room)).emit('room:settings', { ...room.settings })
      return room.settings
    })
    handle('chat:send', (payload) => {
      const { room, id } = participantFor()
      const message = room.chat(id, string(object(payload, ['text']).text, 1, 300))
      nsp.to(room.id).emit('chat:message', message)
      return message
    })
    handle('reaction:send', (payload) => {
      const { room, id } = participantFor()
      const emoji = object(payload, ['emoji']).emoji
      if (!REACTIONS.includes(emoji as (typeof REACTIONS)[number]))
        fail('INVALID_PAYLOAD', '지원하지 않는 반응입니다.')
      room.reaction(id)
      nsp
        .to(room.id)
        .emit('reaction:event', { emoji: emoji as (typeof REACTIONS)[number], participantId: id })
      return undefined
    })
    handle('ppt:command', async (payload) => {
      const room = pptRoom()
      const command = object(payload, ['command']).command
      if (!PPT_COMMANDS.includes(command as PowerPointCommand))
        fail('INVALID_PAYLOAD', '지원하지 않는 PowerPoint 명령입니다.')
      return runPpt(room, command as PowerPointCommand)
    })
    handle('ppt:refresh', async (payload) => {
      const room = pptRoom()
      object(payload, [])
      const status = await options.controller.getStatus()
      emitPpt(room, status)
      return status
    })
    socket.on('disconnect', () => {
      clearTimeout(joinedTimer)
      const { room, participantId } = socket.data
      if (room && participantId) {
        room.leave(participantId, socket.id)
        if (
          room.controllerId === participantId &&
          !room.participants().some((p) => p.id === participantId)
        ) {
          room.controllerId = null
          nsp.to(room.id).emit('ppt:controller', null)
        }
        nsp.to(room.id).emit('presence:update', room.participants())
        log('participant leave', room.id)
      }
    })
  })
  let statusTimer: ReturnType<typeof setInterval> | undefined
  let refreshing = false
  return {
    rooms,
    createRoom,
    activeRoom,
    io,
    http,
    get system() {
      return system
    },
    setInternetStatus(status: InternetStatus): void {
      const participantUrls = system.addresses
        .slice(0, 1)
        .map((ip) => `http://${ip}:${system.port}/r/${activeRoom.id}`)
      if (status.state === 'ready' && status.url)
        participantUrls.splice(0, participantUrls.length, `${status.url}/r/${activeRoom.id}`)
      system = { ...system, internet: status, participantUrls }
      for (const room of rooms.values()) nsp.to(hostChannel(room)).emit('system:status', system)
    },
    async listen(port = 3210, host = '0.0.0.0'): Promise<number> {
      await new Promise<void>((resolve, reject) => {
        const error = (err: Error) => reject(err)
        http.once('error', error)
        http.listen(port, host, () => {
          http.off('error', error)
          resolve()
        })
      })
      const address = http.address()
      if (!address || typeof address === 'string') throw new Error('Missing server address')
      const addresses = lanAddresses()
      system = {
        port: address.port,
        addresses,
        participantUrls: addresses
          .slice(0, 1)
          .map((ip) => `http://${ip}:${address.port}/r/${activeRoom.id}`),
        platform: process.platform
      }
      log('server ready', `0.0.0.0:${address.port}; LAN ${addresses.join(', ') || 'unavailable'}`)
      statusTimer = setInterval(async () => {
        if (refreshing || ![...nsp.sockets.values()].some((s) => s.data.host)) return
        refreshing = true
        try {
          const status = await options.controller.getStatus()
          for (const room of rooms.values()) emitPpt(room, status)
        } catch (error) {
          log('status failure', publicError(error).code)
        } finally {
          refreshing = false
        }
      }, 5000)
      statusTimer.unref()
      return address.port
    },
    async close(): Promise<void> {
      clearInterval(statusTimer)
      await new Promise<void>((resolve) => io.close(() => resolve()))
    }
  }
}
