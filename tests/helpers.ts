import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { createInteractionServer } from '../src/interaction/server'
import { MockPowerPointController } from '../src/interaction/powerpoint'
import { NAMESPACE } from '../src/interaction/protocol'
import type {
  ClientEvents,
  ClientPayloads,
  ClientResults,
  Result,
  ServerEvents
} from '../src/interaction/protocol'
export type Client = Socket<ServerEvents, ClientEvents>
export async function emit<K extends keyof ClientPayloads>(
  client: Client,
  event: K,
  payload: ClientPayloads[K]
): Promise<Result<ClientResults[K]>> {
  const send = client.timeout(5000).emitWithAck.bind(client) as (
    event: K,
    payload: ClientPayloads[K]
  ) => Promise<Result<ClientResults[K]>>
  return send(event, payload)
}
export function ok<T>(result: Result<T>): T {
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.data
}
export function rejected<T>(result: Result<T>, code: string): void {
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, code)
}
export async function fixture() {
  const controller = new MockPowerPointController()
  const server = createInteractionServer({ controller, logger: () => {} })
  const port = await server.listen(0, '127.0.0.1')
  const base = `http://127.0.0.1:${port}`
  const clients: Client[] = []
  async function connect(): Promise<Client> {
    const client: Client = io(base + NAMESPACE, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      autoConnect: false
    })
    clients.push(client)
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
      client.connect()
    })
    return client
  }
  const host = await connect()
  ok(
    await emit(host, 'host:join', {
      roomId: server.activeRoom.id,
      token: server.activeRoom.hostToken
    })
  )
  return {
    server,
    controller,
    base,
    host,
    connect,
    async close() {
      clients.forEach((c) => c.disconnect())
      await server.close()
    }
  }
}
