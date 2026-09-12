import assert from 'node:assert/strict'
import { test } from 'node:test'
import { io } from 'socket.io-client'
import { emit, fixture, ok, rejected } from './helpers'
import type { ClientPayloads } from '../src/interaction/protocol'
import { PUBLIC_TUNNEL_HOST } from '../src/interaction/protocol'

test('public tunnel host requires token and can control PPT; only one participant URL is advertised', async () => {
  const f = await fixture()
  const external = io(f.base + '/interaction', {
    transports: ['websocket'],
    extraHeaders: { Host: PUBLIC_TUNNEL_HOST },
    reconnection: false,
    forceNew: true,
    autoConnect: false
  })
  try {
    await new Promise<void>((resolve, reject) => {
      external.once('connect', resolve)
      external.once('connect_error', reject)
      external.connect()
    })
    const room = f.server.activeRoom
    rejected(
      await emit(external, 'host:join', { roomId: room.id, token: 'invalid' }),
      'UNAUTHORIZED'
    )
    rejected(await emit(external, 'ppt:command', { command: 'advance' }), 'UNAUTHORIZED')
    ok(await emit(external, 'host:join', { roomId: room.id, token: room.hostToken }))
    ok(await emit(external, 'ppt:command', { command: 'advance' }))
    ok(await emit(external, 'buzz:set-mode', { mode: 'first' }))
    assert.equal(room.buzz.mode, 'first')
    ok(await emit(external, 'buzz:restart', {}))
    assert.equal(room.buzz.displayRound, 1)
    f.server.setInternetStatus({ state: 'ready', url: 'https://example.trycloudflare.com' })
    assert.equal(
      f.server.system.participantUrls[0],
      `https://example.trycloudflare.com/r/${room.id}`
    )
    assert.equal(f.server.system.participantUrls.length, 1)
    f.server.setInternetStatus({ state: 'off' })
    assert.ok(f.server.system.participantUrls.length <= 1)
    assert.ok(f.server.system.participantUrls.every((url) => url.startsWith('http://')))
  } finally {
    external.disconnect()
    await f.close()
  }
})

test('busy auto advance reports rejection, preserves the winner and leaves the active command locked', async () => {
  const f = await fixture()
  let release: (() => void) | undefined
  try {
    const participant = await f.connect()
    const room = f.server.activeRoom
    ok(await emit(participant, 'room:join', { roomId: room.id }))
    ok(await emit(f.host, 'room:set-settings', { autoAdvanceOnWinner: true }))
    let started!: () => void
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    f.controller.previous = async () => {
      f.controller.commands.push('previous')
      await new Promise<void>((resolve) => {
        release = resolve
        started()
      })
    }
    const pending = emit(f.host, 'ppt:command', { command: 'previous' })
    await running
    const failure = new Promise<string>((resolve) =>
      f.host.once('app:error', (error) => resolve(error.code))
    )
    ok(await emit(participant, 'buzz:press', { roundId: 1 }))
    assert.equal(await failure, 'RATE_LIMITED')
    assert.ok(room.buzz.winner)
    assert.equal(room.buzz.acceptedCount, 1)
    rejected(await emit(f.host, 'ppt:command', { command: 'advance' }), 'RATE_LIMITED')
    assert.deepEqual(f.controller.commands, ['previous'])
    release!()
    ok(await pending)
    ok(await emit(f.host, 'ppt:command', { command: 'advance' }))
    assert.deepEqual(f.controller.commands, ['previous', 'advance'])
  } finally {
    release?.()
    await f.close()
  }
})

test('settings updates synchronize hosts without resending participant room history', async () => {
  const f = await fixture()
  try {
    const participant = await f.connect()
    const secondHost = await f.connect()
    const room = f.server.activeRoom
    ok(await emit(participant, 'room:join', { roomId: room.id }))
    ok(await emit(secondHost, 'host:join', { roomId: room.id, token: room.hostToken }))
    let participantUpdates = 0
    participant.on('room:state', () => participantUpdates++)
    participant.on('room:settings', () => participantUpdates++)
    const received = new Promise<boolean>((resolve) =>
      secondHost.once('room:settings', (settings) => resolve(settings.autoAdvanceOnWinner))
    )
    ok(await emit(f.host, 'room:set-settings', { autoAdvanceOnWinner: true }))
    assert.equal(await received, true)
    ok(await emit(participant, 'chat:send', { text: 'flush participant transport' }))
    assert.equal(participantUpdates, 0)
  } finally {
    await f.close()
  }
})

test('real Socket.IO: join, winner broadcast, authorization, reset, chat, reaction, reconnect', async () => {
  const f = await fixture()
  try {
    const roomId = f.server.activeRoom.id
    const a = await f.connect(),
      b = await f.connect(),
      c = await f.connect()
    const identityA = ok(await emit(a, 'room:join', { roomId })).identity
    ok(await emit(b, 'room:join', { roomId }))
    ok(await emit(c, 'room:join', { roomId }))
    assert.equal(f.server.activeRoom.participants().length, 3)
    let winnerEvents = 0
    f.host.on('buzz:state', (state) => {
      if (state.winner) winnerEvents++
    })
    const [first, second] = await Promise.all([
      emit(a, 'buzz:press', { roundId: 1 }),
      emit(b, 'buzz:press', { roundId: 1 })
    ])
    ok(first)
    ok(second)
    assert.equal(f.server.activeRoom.buzz.winner?.participantId, identityA.participantId)
    rejected(await emit(a, 'buzz:press', { roundId: 1 }), 'ALREADY_BUZZED')
    rejected(await emit(a, 'buzz:reset', {}), 'UNAUTHORIZED')
    rejected(await emit(a, 'buzz:set-enabled', { enabled: false }), 'UNAUTHORIZED')
    rejected(await emit(a, 'room:set-settings', { autoAdvanceOnWinner: true }), 'UNAUTHORIZED')
    rejected(await emit(a, 'ppt:command', { command: 'advance' }), 'UNAUTHORIZED')
    const invalidHost = await f.connect()
    rejected(await emit(invalidHost, 'host:join', { roomId, token: 'invalid' }), 'UNAUTHORIZED')
    assert.equal(f.controller.commands.length, 0)
    ok(await emit(f.host, 'buzz:reset', {}))
    rejected(await emit(c, 'buzz:press', { roundId: 1 }), 'STALE_ROUND')
    ok(await emit(f.host, 'buzz:set-enabled', { enabled: false }))
    rejected(await emit(a, 'buzz:press', { roundId: 2 }), 'BUZZ_DISABLED')
    ok(await emit(f.host, 'buzz:set-enabled', { enabled: true }))
    ok(await emit(a, 'buzz:press', { roundId: 2 }))
    rejected(await emit(a, 'chat:send', { text: '   ' }), 'INVALID_PAYLOAD')
    rejected(await emit(a, 'chat:send', { text: 'x'.repeat(301) }), 'INVALID_PAYLOAD')
    const message = new Promise<string>((resolve) =>
      b.once('chat:message', (value) => resolve(value.text))
    )
    ok(await emit(a, 'chat:send', { text: ' <img src=x onerror=alert(1)> ' }))
    assert.equal(await message, '<img src=x onerror=alert(1)>')
    for (let i = 0; i < 4; i++) ok(await emit(a, 'chat:send', { text: 'test' }))
    rejected(await emit(a, 'chat:send', { text: 'sixth' }), 'RATE_LIMITED')
    rejected(
      await emit(a, 'reaction:send', { emoji: '💀' } as unknown as ClientPayloads['reaction:send']),
      'INVALID_PAYLOAD'
    )
    const reaction = new Promise<string>((resolve) =>
      b.once('reaction:event', (e) => resolve(e.emoji))
    )
    ok(await emit(a, 'reaction:send', { emoji: '👏' }))
    assert.equal(await reaction, '👏')
    for (let i = 0; i < 4; i++) ok(await emit(a, 'reaction:send', { emoji: '🔥' }))
    rejected(await emit(a, 'reaction:send', { emoji: '👍' }), 'RATE_LIMITED')
    const left = new Promise<void>((resolve) => f.host.once('presence:update', () => resolve()))
    a.disconnect()
    await left
    assert.equal(f.server.activeRoom.participants().length, 2)
    const reconnected = await f.connect()
    const joined = ok(await emit(reconnected, 'room:join', { roomId, ...identityA }))
    assert.equal(joined.identity.participantId, identityA.participantId)
    assert.equal(joined.hasBuzzed, true)
    assert.equal(joined.state.participants.length, 3)
    rejected(await emit(reconnected, 'buzz:press', { roundId: 2 }), 'ALREADY_BUZZED')
    rejected(
      await emit(reconnected, 'chat:send', { text: 'reconnect cannot bypass limit' }),
      'RATE_LIMITED'
    )
    assert.ok(winnerEvents >= 2)
  } finally {
    await f.close()
  }
})
test('room scope, invalid payloads, default namespace and legacy HTTP/Socket surface are isolated', async () => {
  const f = await fixture()
  try {
    const other = f.server.createRoom()
    const a = await f.connect(),
      b = await f.connect()
    const identity = ok(await emit(a, 'room:join', { roomId: f.server.activeRoom.id })).identity
    ok(await emit(b, 'room:join', { roomId: other.id }))
    let crossRoomEvents = 0
    b.on('chat:message', () => crossRoomEvents++)
    b.on('buzz:state', () => crossRoomEvents++)
    ok(await emit(a, 'chat:send', { text: 'private room' }))
    ok(await emit(a, 'buzz:press', { roundId: 1 }))
    ok(await emit(b, 'chat:send', { text: 'flush' }))
    assert.equal(crossRoomEvents, 1)
    assert.equal(other.buzz.winner, null)
    assert.deepEqual(
      other.chatHistory.map((m) => m.text),
      ['flush']
    )
    const thief = await f.connect()
    rejected(
      await emit(thief, 'room:join', {
        roomId: f.server.activeRoom.id,
        participantId: identity.participantId,
        resumeToken: 'a'.repeat(64)
      }),
      'UNAUTHORIZED'
    )
    rejected(
      await emit(f.host, 'ppt:command', {
        command: 'shutdown'
      } as unknown as ClientPayloads['ppt:command']),
      'INVALID_PAYLOAD'
    )
    rejected(
      await emit(a, 'buzz:press', { roundId: 1, timestamp: 0 } as ClientPayloads['buzz:press']),
      'INVALID_PAYLOAD'
    )
    rejected(
      await emit(a, 'chat:send', null as unknown as ClientPayloads['chat:send']),
      'INVALID_PAYLOAD'
    )
    for (const path of ['/downloadFile?fileId=x', '/getInfo', '/win-control.io', '/mobile.html'])
      assert.equal((await fetch(f.base + path)).status, 404)
    const legacy = io(f.base, { reconnection: false, forceNew: true, auth: { token: 'ssss' } })
    const refused = await new Promise<string>((resolve) =>
      legacy.once('connect_error', (e) => resolve(e.message))
    )
    assert.equal(refused, 'UNAUTHORIZED')
    legacy.disconnect()
    const unsupported = a as unknown as {
      timeout(ms: number): { emitWithAck(event: string, payload: unknown): Promise<unknown> }
    }
    await assert.rejects(unsupported.timeout(100).emitWithAck('sys-shutdown', {}))
    assert.equal(f.controller.commands.length, 0)
  } finally {
    await f.close()
  }
})
test('PPT routes commands; auto advance observes committed broadcast; failures preserve winner', async () => {
  const f = await fixture()
  try {
    const a = await f.connect()
    const room = f.server.activeRoom
    ok(await emit(a, 'room:join', { roomId: room.id }))
    ok(await emit(f.host, 'ppt:command', { command: 'previous' }))
    assert.deepEqual(f.controller.commands, ['previous'])
    let broadcast = false
    // Observe server-side broadcast scheduling, independently of network delivery.
    const nsp = f.server.io.of('/interaction')
    const originalTo = nsp.to.bind(nsp)
    nsp.to = (...args) => {
      const target = originalTo(...args)
      const originalEmit = target.emit.bind(target)
      target.emit = (...event) => {
        if (event[0] === 'buzz:state') broadcast = true
        return originalEmit(...event)
      }
      return target
    }
    f.controller.advance = async () => {
      assert.ok(room.buzz.winner)
      assert.equal(room.buzz.acceptedCount, 1)
      assert.equal(broadcast, true)
      throw new Error('controlled mock automation failure')
    }
    ok(await emit(f.host, 'room:set-settings', { autoAdvanceOnWinner: true }))
    const failure = new Promise<void>((resolve) => f.host.once('app:error', () => resolve()))
    ok(await emit(a, 'buzz:press', { roundId: 1 }))
    const winner = room.buzz.winner
    await failure
    assert.deepEqual(room.buzz.winner, winner)
    assert.equal(room.buzz.acceptedCount, 1)
  } finally {
    await f.close()
  }
})

test('host grants one participant PPT-only authority, transfer/revoke/disconnect take effect on server', async () => {
  const f = await fixture()
  try {
    const a = await f.connect()
    const b = await f.connect()
    const room = f.server.activeRoom
    const ai = ok(await emit(a, 'room:join', { roomId: room.id, nickname: '첫번째' })).identity
    const bi = ok(await emit(b, 'room:join', { roomId: room.id })).identity
    rejected(await emit(a, 'ppt:assign', { participantId: ai.participantId }), 'UNAUTHORIZED')
    rejected(await emit(a, 'ppt:command', { command: 'advance' }), 'UNAUTHORIZED')
    rejected(await emit(f.host, 'ppt:assign', { participantId: 'missing' }), 'INVALID_PAYLOAD')
    ok(await emit(f.host, 'ppt:assign', { participantId: ai.participantId }))
    ok(await emit(a, 'ppt:command', { command: 'advance' }))
    ok(await emit(a, 'ppt:refresh', {}))
    rejected(await emit(a, 'buzz:reset', {}), 'UNAUTHORIZED')
    ok(await emit(f.host, 'ppt:assign', { participantId: bi.participantId }))
    rejected(await emit(a, 'ppt:command', { command: 'advance' }), 'UNAUTHORIZED')
    ok(await emit(b, 'ppt:command', { command: 'previous' }))
    ok(await emit(f.host, 'ppt:assign', { participantId: null }))
    rejected(await emit(b, 'ppt:command', { command: 'previous' }), 'UNAUTHORIZED')
    const renamed = ok(await emit(b, 'participant:rename', { nickname: '발표자' }))
    assert.equal(renamed.nickname, '발표자')
    assert.equal(room.members.get(ai.participantId)?.public.nickname, '첫번째')
    ok(await emit(f.host, 'ppt:assign', { participantId: bi.participantId }))
    const revoked = new Promise<void>((resolve) =>
      f.host.once('ppt:controller', (id) => {
        assert.equal(id, null)
        resolve()
      })
    )
    b.disconnect()
    await revoked
    assert.equal(room.controllerId, null)
  } finally {
    await f.close()
  }
})
test('winner follows arrival order rather than participant or connection order', async () => {
  const f = await fixture()
  try {
    const a = await f.connect()
    const b = await f.connect()
    const room = f.server.activeRoom
    const ai = ok(await emit(a, 'room:join', { roomId: room.id })).identity
    const bi = ok(await emit(b, 'room:join', { roomId: room.id })).identity
    for (let i = 0; i < 6; i++) {
      const first = i % 2 ? a : b
      const second = i % 2 ? b : a
      ok(await emit(first, 'buzz:press', { roundId: room.buzz.round }))
      ok(await emit(second, 'buzz:press', { roundId: room.buzz.round }))
      assert.equal(room.buzz.winner?.participantId, i % 2 ? ai.participantId : bi.participantId)
      ok(await emit(f.host, 'buzz:reset', {}))
    }
  } finally {
    await f.close()
  }
})
