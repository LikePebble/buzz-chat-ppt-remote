export const NAMESPACE = '/interaction'
export const REACTIONS = ['👏', '❤️', '😂', '🔥', '👍'] as const
export const PPT_COMMANDS = [
  'advance',
  'previous',
  'blackout',
  'stop',
  'startFromBeginning',
  'startFromCurrent'
] as const
export type Reaction = (typeof REACTIONS)[number]
export type PowerPointCommand = (typeof PPT_COMMANDS)[number]
export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'INVALID_PAYLOAD'
  | 'UNAUTHORIZED'
  | 'BUZZ_DISABLED'
  | 'ALREADY_BUZZED'
  | 'STALE_ROUND'
  | 'RATE_LIMITED'
  | 'ROOM_FULL'
  | 'POWERPOINT_NOT_RUNNING'
  | 'ACCESSIBILITY_PERMISSION_REQUIRED'
  | 'POWERPOINT_COMMAND_FAILED'
  | 'INTERNAL_ERROR'
export interface AppError {
  code: ErrorCode
  message: string
}
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: AppError }
export type Ack<T = undefined> = (result: Result<T>) => void
export interface Identity {
  participantId: string
  nickname: string
  resumeToken: string
}
export interface Participant {
  id: string
  nickname: string
  joinedAt: number
  lastSeenAt: number
}
export interface BuzzEntry {
  participantId: string
  nickname: string
  receivedAtMonotonic: string
  sequence: number
  deltaMs: number
}
export interface BuzzState {
  enabled: boolean
  round: number
  winner: BuzzEntry | null
  ranking: BuzzEntry[]
  acceptedCount: number
}
export interface ChatMessage {
  id: string
  participantId: string
  nickname: string
  text: string
  sentAt: number
}
export interface RoomSettings {
  autoAdvanceOnWinner: boolean
}
export interface RoomState {
  id: string
  createdAt: number
  participants: Participant[]
  buzz: BuzzState
  chatHistory: ChatMessage[]
  settings: RoomSettings
}
export interface PowerPointStatus {
  running: boolean
  accessibilityGranted: boolean
  ready: boolean
  lastError: AppError | null
  mock: boolean
}
export interface SystemStatus {
  port: number
  addresses: string[]
  participantUrls: string[]
  platform: string
}
export interface JoinPayload {
  roomId: string
  participantId?: string
  nickname?: string
  resumeToken?: string
}
export interface ClientPayloads {
  'room:join': JoinPayload
  'host:join': { roomId: string; token: string }
  'buzz:press': { roundId: number }
  'buzz:reset': Record<string, never>
  'buzz:set-enabled': { enabled: boolean }
  'room:set-settings': RoomSettings
  'chat:send': { text: string }
  'reaction:send': { emoji: Reaction }
  'ppt:command': { command: PowerPointCommand }
  'ppt:refresh': Record<string, never>
}
export interface ClientResults {
  'room:join': { identity: Identity; state: RoomState; hasBuzzed: boolean }
  'host:join': { state: RoomState }
  'buzz:press': BuzzState
  'buzz:reset': BuzzState
  'buzz:set-enabled': BuzzState
  'room:set-settings': RoomSettings
  'chat:send': ChatMessage
  'reaction:send': undefined
  'ppt:command': PowerPointStatus
  'ppt:refresh': PowerPointStatus
}
export type ClientEvents = {
  [K in keyof ClientPayloads]: (payload: ClientPayloads[K], ack: Ack<ClientResults[K]>) => void
}
export interface ServerEvents {
  'room:state': (state: RoomState) => void
  'presence:update': (participants: Participant[]) => void
  'buzz:state': (state: BuzzState) => void
  'chat:message': (message: ChatMessage) => void
  'reaction:event': (event: { emoji: Reaction; participantId: string }) => void
  'ppt:status': (status: PowerPointStatus) => void
  'system:status': (status: SystemStatus) => void
  'app:error': (error: AppError) => void
}
export interface HostBootstrap {
  roomId: string
  token: string
  serverUrl: string
  system: SystemStatus
}
export interface DesktopApi {
  bootstrap(): Promise<HostBootstrap>
  requestAccessibility(): Promise<boolean>
  openAccessibilitySettings(): Promise<void>
  copy(text: string): Promise<void>
}
