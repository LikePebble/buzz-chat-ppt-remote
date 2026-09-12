import { randomInt } from 'node:crypto'
import words from './nickname-words.json'
import { fail } from './validation'

// 회원이름_조합단어_2차.xlsx, Sheet1 B2:B154 / C2:C314.
// Deduplicated words; retain original spelling. A space counts toward the 10-character limit.
export const automaticNicknames = words.adjectives.flatMap((adjective) =>
  words.nouns.map((noun) => `${adjective} ${noun}`).filter((name) => Array.from(name).length <= 10)
)

export function generateNickname(used: ReadonlySet<string>): string {
  const start = randomInt(automaticNicknames.length)
  for (let offset = 0; offset < automaticNicknames.length; offset++) {
    const name = automaticNicknames[(start + offset) % automaticNicknames.length]
    if (!used.has(name)) return name
  }
  return fail('ROOM_FULL', '사용 가능한 자동 닉네임이 없습니다.')
}
