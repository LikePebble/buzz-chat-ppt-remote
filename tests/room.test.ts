import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Room } from '../src/interaction/room'
import { InteractionError, RateLimit, secretMatches } from '../src/interaction/validation'

function setup() {
  let time = 1000000000n
  const room = new Room('ABC234', () => {
    time += 82000000n
    return time
  })
  const a = room.join({ roomId: room.id }, 'a')
  const b = room.join({ roomId: room.id }, 'b')
  return { room, a, b }
}
function code(expected: string) {
  return (err: unknown) => err instanceof InteractionError && err.code === expected
}
test('authoritative first winner is immutable and ranking uses monotonic server time', () => {
  const { room, a, b } = setup()
  assert.equal(room.press(a.participantId, 1), true)
  assert.equal(room.press(b.participantId, 1), false)
  assert.equal(room.buzz.winner?.participantId, a.participantId)
  assert.deepEqual(
    room.buzz.ranking.map((e) => [e.sequence, e.deltaMs]),
    [
      [1, 0],
      [2, 82]
    ]
  )
  assert.throws(() => room.press(a.participantId, 1), code('ALREADY_BUZZED'))
})
test('reset clears duplicate status, rejects stale rounds and preserves enabled setting', () => {
  const { room, a } = setup()
  room.press(a.participantId, 1)
  room.buzz.enabled = false
  room.reset()
  assert.equal(room.buzz.round, 2)
  assert.equal(room.buzz.winner, null)
  assert.throws(() => room.press(a.participantId, 1), code('STALE_ROUND'))
  assert.throws(() => room.press(a.participantId, 2), code('BUZZ_DISABLED'))
  room.buzz.enabled = true
  assert.equal(room.press(a.participantId, 2), true)
})
test('rooms isolate ranking and text-only chat; empty and oversized chat rejected', () => {
  const { room, a } = setup()
  const other = new Room('DEF234')
  room.press(a.participantId, 1)
  assert.equal(other.buzz.winner, null)
  assert.throws(() => room.chat(a.participantId, '  '), code('INVALID_PAYLOAD'))
  assert.throws(() => room.chat(a.participantId, 'x'.repeat(301)), code('INVALID_PAYLOAD'))
  assert.equal(room.chat(a.participantId, ' <b>hello</b> ').text, '<b>hello</b>')
  assert.equal(other.chatHistory.length, 0)
  for (let i = 0; i < 4; i++) room.chat(a.participantId, 'test')
  assert.throws(() => room.chat(a.participantId, 'sixth'), code('RATE_LIMITED'))
})
test('presence, reconnect credentials and round duplicates survive reconnect and multiple tabs', () => {
  const { room, a } = setup()
  room.press(a.participantId, 1)
  assert.throws(
    () => room.join({ roomId: room.id, participantId: a.participantId }, 'impostor'),
    code('UNAUTHORIZED')
  )
  const resumed = room.join({ roomId: room.id, ...a }, 'new')
  assert.deepEqual(resumed, a)
  room.leave(a.participantId, 'a')
  assert.equal(room.participants().length, 2)
  assert.throws(() => room.press(a.participantId, 1), code('ALREADY_BUZZED'))
  room.leave(a.participantId, 'new')
  assert.equal(room.participants().length, 1)
  assert.ok(!JSON.stringify(room.state()).includes(a.resumeToken))
  assert.ok(!JSON.stringify(room.state()).includes(room.hostToken))
})
test('reaction and time-window rate limits recover after the interval', () => {
  const { room, a } = setup()
  for (let i = 0; i < 5; i++) room.reaction(a.participantId)
  assert.throws(() => room.reaction(a.participantId), code('RATE_LIMITED'))
  let now = 0
  const limit = new RateLimit(1, 1000, () => now)
  limit.accept()
  assert.throws(() => limit.accept(), code('RATE_LIMITED'))
  now = 1000
  limit.accept()
  assert.equal(secretMatches('é'.repeat(64), 'a'.repeat(64)), false)
})
test('chat history bounded at 50 and ranking at 10 while recording all accepted participants', () => {
  const room = new Room('ABC234')
  for (let i = 0; i < 60; i++) {
    const user = room.join({ roomId: room.id }, String(i))
    room.chat(user.participantId, String(i))
    room.press(user.participantId, 1)
  }
  assert.equal(room.chatHistory.length, 50)
  assert.equal(room.chatHistory[0].text, '10')
  assert.equal(room.buzz.ranking.length, 10)
  assert.equal(room.buzz.acceptedCount, 60)
})
