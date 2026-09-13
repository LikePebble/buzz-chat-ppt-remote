import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import type {
  BuzzState,
  ChatMessage,
  Identity,
  JoinPayload,
  Participant,
  RoomState
} from './protocol'
import { fail, nickname, RateLimit, secretMatches } from './validation'
import { generateNickname } from './nicknames'

interface Member {
  public: Participant
  resumeToken: string
  sockets: Set<string>
  chatLimit: RateLimit
  reactionLimit: RateLimit
}
export class Room {
  controllerId: string | null = null
  readonly createdAt = Date.now()
  readonly hostToken = randomBytes(32).toString('hex')
  readonly members = new Map<string, Member>()
  readonly chatHistory: ChatMessage[] = []
  readonly settings = { autoAdvanceOnWinner: false }
  buzz: BuzzState = {
    displayRound: 1,
    mode: 'all',
    enabled: true,
    round: 1,
    winner: null,
    ranking: [],
    acceptedCount: 0
  }
  private buzzed = new Set<string>()
  constructor(
    readonly id: string,
    private clock = () => process.hrtime.bigint()
  ) {}

  join(payload: JoinPayload, socketId: string): Identity {
    let member = payload.participantId ? this.members.get(payload.participantId) : undefined
    if (member) {
      if (!secretMatches(payload.resumeToken, member.resumeToken))
        fail('UNAUTHORIZED', '참가자 재접속 키가 올바르지 않습니다.')
    } else {
      // Identity and resume credentials remain server-issued.
      if (this.members.size >= 5000)
        fail('ROOM_FULL', '참가 한도에 도달했습니다. 호스트 앱을 다시 시작하세요.')
      const id = randomUUID()
      member = {
        public: {
          id,
          nickname:
            payload.nickname === undefined
              ? generateNickname(new Set([...this.members.values()].map((m) => m.public.nickname)))
              : nickname(payload.nickname),
          joinedAt: Date.now(),
          lastSeenAt: Date.now()
        },
        resumeToken: randomBytes(32).toString('hex'),
        sockets: new Set(),
        chatLimit: new RateLimit(5, 10000),
        reactionLimit: new RateLimit(5, 1000)
      }
      this.members.set(id, member)
    }
    member.sockets.add(socketId)
    member.public.lastSeenAt = Date.now()
    return {
      participantId: member.public.id,
      nickname: member.public.nickname,
      resumeToken: member.resumeToken
    }
  }
  leave(id: string, socketId: string): void {
    const member = this.members.get(id)
    member?.sockets.delete(socketId)
    if (member) member.public.lastSeenAt = Date.now()
  }
  participants(): Participant[] {
    return [...this.members.values()].filter((m) => m.sockets.size).map((m) => ({ ...m.public }))
  }
  state(): RoomState {
    return {
      controllerId: this.controllerId,
      id: this.id,
      createdAt: this.createdAt,
      participants: this.participants(),
      buzz: this.buzz,
      chatHistory: this.chatHistory,
      settings: this.settings
    }
  }
  rename(id: string, value: unknown): string {
    const member = this.members.get(id)
    if (!member) fail('UNAUTHORIZED', '먼저 방에 참가해 주세요.')
    const name = nickname(value)
    member.public.nickname = name
    for (const entry of this.buzz.ranking) if (entry.participantId === id) entry.nickname = name
    return name
  }
  hasBuzzed(id: string): boolean {
    return this.buzzed.has(id)
  }
  press(id: string, round: number): boolean {
    if (round !== this.buzz.round) fail('STALE_ROUND', '라운드가 바뀌었습니다. 다시 눌러 주세요.')
    if (!this.buzz.enabled) fail('BUZZ_DISABLED', '버저가 잠겨 있습니다.')
    if (this.buzzed.has(id)) fail('ALREADY_BUZZED', '이 라운드에는 이미 참여했습니다.')
    if (this.buzz.mode === 'first' && this.buzz.winner)
      fail('BUZZ_DISABLED', '선착순 버징이 마감되었습니다.')
    const member = this.members.get(id)
    if (!member) fail('UNAUTHORIZED', '먼저 방에 참가해 주세요.')
    const received = this.clock()
    const isWinner = this.buzz.winner === null
    const entry = {
      participantId: id,
      nickname: member.public.nickname,
      receivedAtMonotonic: received.toString(),
      sequence: this.buzz.acceptedCount + 1,
      deltaMs: isWinner ? 0 : Number(received - BigInt(this.buzz.winner!.receivedAtMonotonic)) / 1e6
    }
    // Synchronous authoritative mutation: no await, I/O or automation in this path.
    this.buzzed.add(id)
    this.buzz.acceptedCount++
    if (isWinner) this.buzz.winner = entry
    this.buzz.ranking.push(entry)
    return isWinner
  }
  reset(complete = false): BuzzState {
    this.buzz = {
      displayRound: complete ? 1 : this.buzz.displayRound + 1,
      mode: this.buzz.mode,
      enabled: complete ? true : this.buzz.enabled,
      round: this.buzz.round + 1,
      winner: null,
      ranking: [],
      acceptedCount: 0
    }
    this.buzzed.clear()
    return this.buzz
  }
  chat(id: string, input: string): ChatMessage {
    const text = input.trim()
    if (!text || input.length > 300) fail('INVALID_PAYLOAD', '메시지는 1~300자로 입력하세요.')
    const member = this.members.get(id)
    if (!member) fail('UNAUTHORIZED', '먼저 방에 참가해 주세요.')
    member.chatLimit.accept()
    const message = {
      id: randomUUID(),
      participantId: id,
      nickname: member.public.nickname,
      text,
      sentAt: Date.now()
    }
    this.chatHistory.push(message)
    if (this.chatHistory.length > 50) this.chatHistory.shift()
    return message
  }
  reaction(id: string): void {
    const member = this.members.get(id)
    if (!member) fail('UNAUTHORIZED', '먼저 방에 참가해 주세요.')
    member.reactionLimit.accept()
  }
}
export function roomId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
}
