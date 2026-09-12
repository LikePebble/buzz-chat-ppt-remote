import { timingSafeEqual } from 'node:crypto'
import type { AppError, ErrorCode } from './protocol'

export class InteractionError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
  }
}
export function fail(code: ErrorCode, message: string): never {
  throw new InteractionError(code, message)
}
export function publicError(error: unknown): AppError {
  if (error instanceof InteractionError) return { code: error.code, message: error.message }
  console.error('[interaction] internal failure', error)
  return { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' }
}
export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    fail('INVALID_PAYLOAD', '요청 형식이 올바르지 않습니다.')
  return value as Record<string, unknown>
}
export function string(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || value.length < min || value.length > max)
    fail('INVALID_PAYLOAD', '문자열 길이가 올바르지 않습니다.')
  return value
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('INVALID_PAYLOAD', '설정 값이 올바르지 않습니다.')
  return value
}
export function secretMatches(a: unknown, b: string): boolean {
  return (
    typeof a === 'string' &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  )
}
export class RateLimit {
  private timestamps: number[] = []
  constructor(
    private count: number,
    private interval: number,
    private clock = () => performance.now()
  ) {}
  accept(): void {
    const now = this.clock()
    this.timestamps = this.timestamps.filter((t) => now - t < this.interval)
    if (this.timestamps.length >= this.count)
      fail('RATE_LIMITED', '너무 빠릅니다. 잠시 후 다시 시도하세요.')
    this.timestamps.push(now)
  }
}
