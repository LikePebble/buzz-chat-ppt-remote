import assert from 'node:assert/strict'
import { test } from 'node:test'
import words from '../src/interaction/nickname-words.json'
import { automaticNicknames, generateNickname } from '../src/interaction/nicknames'
import { Room } from '../src/interaction/room'
import { nickname } from '../src/interaction/validation'

test('workbook vocabulary produces only valid adjective-noun pairs within ten characters', () => {
  assert.equal(words.adjectives.length, 152)
  assert.equal(words.nouns.length, 313)
  assert.equal(automaticNicknames.length, 46138)
  assert.equal(new Set(automaticNicknames).size, automaticNicknames.length)
  for (const name of automaticNicknames) {
    const [adjective, noun] = name.split(' ')
    assert.ok(words.adjectives.includes(adjective))
    assert.ok(words.nouns.includes(noun))
    assert.equal(nickname(name), name)
  }
})

test('automatic names avoid all existing names and fail clearly when the pool is exhausted', () => {
  const used = new Set<string>()
  for (let i = 0; i < 5000; i++) {
    const name = generateNickname(used)
    assert.ok(!used.has(name))
    used.add(name)
  }
  const all = new Set(automaticNicknames)
  const onlyAvailable = automaticNicknames[100]
  all.delete(onlyAvailable)
  assert.equal(generateNickname(all), onlyAvailable)
  all.add(onlyAvailable)
  assert.throws(() => generateNickname(all), { code: 'ROOM_FULL' })
})

test('reconnecting keeps the generated or edited nickname and participant identity', () => {
  const room = new Room('ABC234')
  const first = room.join({ roomId: room.id }, 'first')
  assert.ok(automaticNicknames.includes(first.nickname))
  assert.deepEqual(room.join({ roomId: room.id, ...first }, 'second'), first)
  room.rename(first.participantId, '내 닉네임')
  const resumed = room.join({ roomId: room.id, ...first }, 'third')
  assert.equal(resumed.nickname, '내 닉네임')
  assert.equal(resumed.participantId, first.participantId)
})
