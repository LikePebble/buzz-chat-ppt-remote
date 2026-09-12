import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import * as vue from 'vue'
import { Room } from '../src/interaction/room'
import * as protocol from '../src/interaction/protocol'
import type { RoomState } from '../src/interaction/protocol'

async function renderer() {
  const room = new Room('ABCDEF')
  const identity = room.join({ roomId: room.id }, 'test')
  const handlers = new Map<string, (data?: unknown) => void>()
  const mounted: (() => Promise<void>)[] = []
  const cleanup: (() => void)[] = []
  const scope = vue.effectScope()
  const socket = {
    connected: true,
    on(event: string, fn: (data?: unknown) => void) {
      handlers.set(event, fn)
      return this
    },
    timeout() {
      return this
    },
    async emitWithAck(event: string, payload: { roundId: number }) {
      if (event === 'buzz:press') {
        room.press(identity.participantId, payload.roundId)
        return { ok: true, data: room.buzz }
      }
      return { ok: true, data: { identity, state: room.state(), hasBuzzed: false } }
    },
    connect() {
      handlers.get('connect')!()
    },
    disconnect() {
      this.connected = false
    }
  }
  const script = readFileSync('src/renderer/interaction/App.vue', 'utf8').match(
    /<script setup lang="ts">([\s\S]*?)<\/script>/
  )![1]
  const compiled = ts.transpileModule(
    script +
      '\nexports.review = { state, chatElement, notice, error, command, hasBuzzed, pressing, canBuzz, isWinner, buzzLabel, identity, pressBuzz, canControlPpt };',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }
  ).outputText
  const output = {} as {
    review: {
      state: vue.Ref<RoomState>
      chatElement: vue.Ref<unknown>
      notice: vue.Ref<string>
      error: vue.Ref<string>
      command: (event: string, data: unknown) => Promise<unknown>
      hasBuzzed: vue.Ref<boolean>
      pressing: vue.Ref<boolean>
      canBuzz: vue.ComputedRef<boolean>
      isWinner: vue.ComputedRef<boolean>
      buzzLabel: vue.ComputedRef<string>
      pressBuzz: (event: PointerEvent) => void
      canControlPpt: vue.ComputedRef<boolean>
      identity: vue.Ref<protocol.Identity>
    }
  }
  const require = (id: string): unknown => {
    if (id === 'vue')
      return {
        ...vue,
        onMounted: (fn: () => Promise<void>) => mounted.push(fn),
        onUnmounted: (fn: () => void) => cleanup.push(fn)
      }
    if (id === 'socket.io-client') return { io: () => socket }
    if (id === 'qr-code-styling') return class {}
    if (id === '../../interaction/protocol') return protocol
    if (id === './style.css') return {}
    throw new Error(`Unexpected renderer import: ${id}`)
  }
  const storage = { getItem: () => null, setItem: () => undefined }
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'window',
      'location',
      'localStorage',
      'sessionStorage',
      compiled
    )(
      require,
      output,
      {},
      { pathname: '/r/ABCDEF', origin: 'http://test.invalid' },
      storage,
      storage
    )
  )
  await mounted[0]()
  await vue.nextTick()
  await vue.nextTick()
  return {
    ...output.review,
    handlers,
    close() {
      cleanup.forEach((fn) => fn())
      scope.stop()
    }
  }
}

test('new round restores winner and non-winner button state', async () => {
  const ui = await renderer()
  try {
    for (const winner of [true, false]) {
      const entry = {
        participantId: winner ? ui.identity.value.participantId : 'other',
        nickname: 'test',
        receivedAtMonotonic: '1',
        sequence: 1,
        deltaMs: 0
      }
      const round = ui.state.value.buzz.round
      ui.handlers.get('buzz:state')!({
        enabled: true,
        round,
        winner: entry,
        ranking: [entry],
        acceptedCount: 1
      })
      ui.hasBuzzed.value = true
      assert.equal(ui.canBuzz.value, false)
      ui.handlers.get('buzz:state')!({
        enabled: true,
        round: round + 1,
        winner: null,
        ranking: [],
        acceptedCount: 0
      })
      assert.equal(ui.hasBuzzed.value, false)
      assert.equal(ui.pressing.value, false)
      assert.equal(ui.isWinner.value, false)
      assert.equal(ui.canBuzz.value, true)
      assert.equal(ui.buzzLabel.value, 'BUZZ')
    }
  } finally {
    ui.close()
  }
})

test('chat scroll follows new messages after the 50-message limit', async () => {
  const ui = await renderer()
  try {
    let scrolls = 0
    ui.chatElement.value = {
      scrollHeight: 1000,
      scrollTo() {
        scrolls++
      }
    }
    const message = (n: number) => ({
      id: String(n),
      participantId: 'test',
      nickname: 'test',
      text: String(n),
      sentAt: n
    })
    ui.state.value.chatHistory = Array.from({ length: 49 }, (_, i) => message(i))
    await vue.nextTick()
    await vue.nextTick()
    scrolls = 0
    for (const n of [49, 50, 51]) {
      ui.handlers.get('chat:message')!(message(n))
      await vue.nextTick()
      await vue.nextTick()
    }
    assert.equal(scrolls, 3)
    assert.equal(ui.state.value.chatHistory.length, 50)
    assert.equal(ui.state.value.chatHistory.at(-1)?.id, '51')
  } finally {
    ui.close()
  }
})

test('success notices expire and do not survive a subsequent command or error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const ui = await renderer()
  try {
    ui.notice.value = 'command sent'
    await vue.nextTick()
    t.mock.timers.tick(4000)
    assert.equal(ui.notice.value, '')
    ui.notice.value = 'copied'
    await vue.nextTick()
    ui.error.value = 'command failed'
    await vue.nextTick()
    assert.equal(ui.notice.value, '')
    ui.notice.value = 'old success'
    await ui.command('ppt:refresh', {})
    assert.equal(ui.notice.value, '')
  } finally {
    ui.close()
  }
})

test('first mode closes other buttons and all mode reopens them; full reset clears pressed state', async () => {
  const ui = await renderer()
  try {
    const entry = {
      participantId: 'other',
      nickname: 'other',
      receivedAtMonotonic: '1',
      sequence: 1,
      deltaMs: 0
    }
    ui.handlers.get('buzz:state')!({
      ...ui.state.value.buzz,
      mode: 'first',
      winner: entry,
      ranking: [entry],
      acceptedCount: 1
    })
    assert.equal(ui.canBuzz.value, false)
    assert.equal(ui.buzzLabel.value, '선착순 마감')
    ui.handlers.get('buzz:state')!({ ...ui.state.value.buzz, mode: 'all' })
    assert.equal(ui.canBuzz.value, true)
    ui.hasBuzzed.value = true
    ui.handlers.get('buzz:state')!({
      ...ui.state.value.buzz,
      round: ui.state.value.buzz.round + 1,
      displayRound: 1,
      winner: null,
      ranking: [],
      acceptedCount: 0
    })
    assert.equal(ui.canBuzz.value, true)
    assert.equal(ui.hasBuzzed.value, false)
  } finally {
    ui.close()
  }
})

test('pointer down sends before release and delegated controller UI follows grant/revoke', async () => {
  const ui = await renderer()
  try {
    ui.pressBuzz({ isPrimary: false, button: 0 } as PointerEvent)
    assert.equal(ui.pressing.value, false)
    ui.pressBuzz({ isPrimary: true, button: 0 } as PointerEvent)
    assert.equal(ui.pressing.value, true)
    await vue.nextTick()
    await vue.nextTick()
    assert.equal(ui.state.value.buzz.acceptedCount, 1)
    ui.pressBuzz({ isPrimary: true, button: 0 } as PointerEvent)
    await vue.nextTick()
    assert.equal(ui.state.value.buzz.acceptedCount, 1)
    ui.handlers.get('ppt:controller')!(ui.identity.value.participantId)
    assert.equal(ui.canControlPpt.value, true)
    ui.handlers.get('ppt:controller')!('other')
    assert.equal(ui.canControlPpt.value, false)
  } finally {
    ui.close()
  }
})
