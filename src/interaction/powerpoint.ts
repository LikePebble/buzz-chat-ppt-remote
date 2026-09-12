import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PowerPointCommand, PowerPointStatus } from './protocol'
import { fail, publicError } from './validation'

const execFileAsync = promisify(execFile)
export const KEY_SCRIPTS: Record<PowerPointCommand, string> = {
  advance: 'key code 49',
  previous: 'key code 123',
  blackout: 'keystroke "b"',
  stop: 'key code 53',
  startFromBeginning: 'key code 36 using {command down, shift down}',
  startFromCurrent: 'key code 36 using {command down}'
}
export interface PowerPointController {
  getStatus(): Promise<PowerPointStatus>
  advance(): Promise<void>
  previous(): Promise<void>
  blackout(): Promise<void>
  stop(): Promise<void>
  startFromBeginning(): Promise<void>
  startFromCurrent(): Promise<void>
}
export type ScriptRunner = (script: string) => Promise<string>
export const runAppleScript: ScriptRunner = async (script) => {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], {
    timeout: 5000,
    maxBuffer: 16384
  })
  return stdout.trim()
}
export class MacOSPowerPointController implements PowerPointController {
  private lastError: PowerPointStatus['lastError'] = null
  private busy = false
  constructor(
    private accessibility: () => boolean,
    private run: ScriptRunner = runAppleScript
  ) {}
  async getStatus(): Promise<PowerPointStatus> {
    let running = false
    try {
      running = (await this.run('application "Microsoft PowerPoint" is running')) === 'true'
    } catch {
      this.lastError = {
        code: 'POWERPOINT_COMMAND_FAILED',
        message: 'PowerPoint 상태를 확인할 수 없습니다.'
      }
    }
    const accessibilityGranted = this.accessibility()
    return {
      running,
      accessibilityGranted,
      ready: running && accessibilityGranted,
      lastError: this.lastError,
      mock: false
    }
  }
  private async execute(command: PowerPointCommand): Promise<void> {
    if (this.busy) fail('RATE_LIMITED', 'PowerPoint 명령 실행 중입니다.')
    this.busy = true
    try {
      const status = await this.getStatus()
      if (!status.running) fail('POWERPOINT_NOT_RUNNING', 'PowerPoint가 실행되지 않았습니다.')
      if (!status.accessibilityGranted)
        fail('ACCESSIBILITY_PERMISSION_REQUIRED', '손쉬운 사용 권한이 필요합니다.')
      await this
        .run(`if application "Microsoft PowerPoint" is not running then error "POWERPOINT_NOT_RUNNING"
tell application "Microsoft PowerPoint" to activate
tell application "System Events"
  repeat 10 times
    if frontmost of process "Microsoft PowerPoint" then exit repeat
    delay 0.05
  end repeat
  if not (frontmost of process "Microsoft PowerPoint") then error "POWERPOINT_NOT_FRONTMOST"
  tell process "Microsoft PowerPoint"
    ${KEY_SCRIPTS[command]}
  end tell
end tell`)
      this.lastError = null
    } catch (error) {
      if (
        error instanceof Error &&
        /not allowed|not authorized|assistive|1002|1743/i.test(error.message)
      ) {
        this.lastError = {
          code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
          message: '손쉬운 사용 및 자동화 권한을 확인하세요.'
        }
      } else if (
        error instanceof Error &&
        'code' in error &&
        ['POWERPOINT_NOT_RUNNING', 'ACCESSIBILITY_PERMISSION_REQUIRED'].includes(String(error.code))
      ) {
        this.lastError = publicError(error)
      } else {
        console.error('[ppt] fixed command failed', command, error)
        this.lastError = {
          code: 'POWERPOINT_COMMAND_FAILED',
          message: 'PowerPoint 명령 실행 실패. 슬라이드 쇼와 권한을 확인하세요.'
        }
      }
      fail(this.lastError.code, this.lastError.message)
    } finally {
      this.busy = false
    }
  }
  advance() {
    return this.execute('advance')
  }
  previous() {
    return this.execute('previous')
  }
  blackout() {
    return this.execute('blackout')
  }
  stop() {
    return this.execute('stop')
  }
  startFromBeginning() {
    return this.execute('startFromBeginning')
  }
  startFromCurrent() {
    return this.execute('startFromCurrent')
  }
}
export class MockPowerPointController implements PowerPointController {
  readonly commands: PowerPointCommand[] = []
  failure: Error | null = null
  async getStatus(): Promise<PowerPointStatus> {
    return {
      running: true,
      accessibilityGranted: true,
      ready: true,
      lastError: this.failure
        ? { code: 'POWERPOINT_COMMAND_FAILED', message: 'Mock failure' }
        : null,
      mock: true
    }
  }
  private async execute(command: PowerPointCommand): Promise<void> {
    this.commands.push(command)
    if (this.failure) throw this.failure
  }
  advance() {
    return this.execute('advance')
  }
  previous() {
    return this.execute('previous')
  }
  blackout() {
    return this.execute('blackout')
  }
  stop() {
    return this.execute('stop')
  }
  startFromBeginning() {
    return this.execute('startFromBeginning')
  }
  startFromCurrent() {
    return this.execute('startFromCurrent')
  }
}
