import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { InternetAccess } from '../src/interaction/internet'
import { PUBLIC_TUNNEL_HOST, type InternetStatus } from '../src/interaction/protocol'

function setup() {
  const changes: InternetStatus[] = []
  const children: ReturnType<typeof child>[] = []
  const args: string[][] = []
  function child() {
    const result = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null as number | null,
      signalCode: null as string | null,
      kills: [] as string[],
      kill(signal: string) {
        this.kills.push(signal)
        this.signalCode = signal
        queueMicrotask(() => result.emit('exit', null, signal))
        return true
      }
    })
    return result
  }
  const access = new InternetAccess(
    '/test/cloudflared',
    'http://127.0.0.1:3210',
    '/test/config.yml',
    (s) => changes.push(s),
    (_binary, options) => {
      args.push(options)
      const process = child()
      children.push(process)
      return process as unknown as ChildProcess
    }
  )
  return { access, changes, children, args }
}

test('internet startup requires URL and connection, deduplicates starts and stops its child', async () => {
  const f = setup()
  const started = f.access.start()
  assert.equal(f.access.start(), started)
  const child = f.children[0]
  child.stderr.write('https://example.trycloud')
  child.stderr.write('flare.com\n')
  assert.equal(f.changes.at(-1)?.state, 'connecting')
  child.stderr.write('Registered tunnel connection\n')
  assert.deepEqual(await started, { state: 'ready', url: 'https://example.trycloudflare.com' })
  assert.ok(f.args[0].includes(PUBLIC_TUNNEL_HOST))
  assert.equal(f.access.stop().state, 'off')
  assert.deepEqual(child.kills, ['SIGTERM'])
  await Promise.resolve()
  assert.equal(f.changes.at(-1)?.state, 'off')
})

test('startup cancellation ignores stale process output and a new start can succeed', async () => {
  const f = setup()
  const first = f.access.start()
  f.access.stop()
  assert.equal((await first).state, 'off')
  const second = f.access.start()
  f.children[0].stderr.write('https://old.trycloudflare.com Registered tunnel connection')
  assert.equal(f.changes.at(-1)?.state, 'connecting')
  f.children[1].stderr.write('Registered tunnel connection https://new.trycloudflare.com')
  assert.equal((await second).url, 'https://new.trycloudflare.com')
  f.access.stop()
})

test('process error and startup timeout are surfaced and do not leave public URLs active', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = setup()
  const first = f.access.start()
  f.children[0].emit('error', new Error('test missing executable'))
  assert.equal((await first).state, 'error')
  const second = f.access.start()
  t.mock.timers.tick(45000)
  assert.equal((await second).state, 'error')
  assert.equal(f.changes.at(-1)?.url, undefined)
  assert.deepEqual(f.children[1].kills, ['SIGTERM'])
  f.access.stop()
})
