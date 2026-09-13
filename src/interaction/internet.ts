import { spawn, type ChildProcess } from 'node:child_process'
import { PUBLIC_TUNNEL_HOST, type InternetStatus } from './protocol'

type Launch = (binary: string, args: string[]) => ChildProcess
export class InternetAccess {
  private child?: ChildProcess
  private pending?: Promise<InternetStatus>
  private complete?: (status: InternetStatus) => void
  private timer?: ReturnType<typeof setTimeout>
  private status: InternetStatus = { state: 'off' }
  constructor(
    private binary: string,
    private origin: string,
    private config: string,
    private notify: (status: InternetStatus) => void,
    private launch: Launch = (binary, args) =>
      spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  ) {}
  private publish(status: InternetStatus): void {
    this.status = status
    this.notify(status)
    if (status.state !== 'connecting') {
      clearTimeout(this.timer)
      this.complete?.(status)
      this.complete = undefined
      this.pending = undefined
    }
  }
  start(): Promise<InternetStatus> {
    if (this.pending) return this.pending
    if (this.child) return Promise.resolve(this.status)
    this.pending = new Promise((resolve) => {
      this.complete = resolve
    })
    const result = this.pending
    this.publish({ state: 'connecting' })
    let child: ChildProcess
    try {
      child = this.launch(this.binary, [
        'tunnel',
        '--config',
        this.config,
        '--no-autoupdate',
        '--protocol',
        'http2',
        '--url',
        this.origin,
        '--http-host-header',
        PUBLIC_TUNNEL_HOST
      ])
    } catch {
      this.publish({
        state: 'error',
        message: '인터넷 연결 도구를 실행할 수 없습니다. 앱을 다시 설치하세요.'
      })
      return result
    }
    this.child = child
    let output = ''
    let url: string | undefined
    let registered = false
    const failed = (message: string) => {
      if (this.child !== child) return
      this.terminate(child)
      this.publish({ state: 'error', message })
    }
    const read = (chunk: Buffer) => {
      if (this.child !== child) return
      output = (output + chunk.toString()).slice(-8192)
      url ??= output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0]
      registered ||= output.includes('Registered tunnel connection')
      if (url && registered && this.status.state !== 'ready') this.publish({ state: 'ready', url })
    }
    child.stdout?.on('data', read)
    child.stderr?.on('data', read)
    child.once('error', () =>
      failed('인터넷 연결 도구를 실행할 수 없습니다. 앱을 다시 설치하세요.')
    )
    child.once('exit', () => failed('인터넷 참여 연결이 종료됐습니다. 다시 켜 주세요.'))
    this.timer = setTimeout(
      () => failed('인터넷 연결 시간이 초과됐습니다. 네트워크를 확인하고 다시 시도하세요.'),
      45000
    )
    this.timer.unref()
    return result
  }
  private terminate(child: ChildProcess): void {
    this.child = undefined
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    const killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 2000)
    killTimer.unref()
    child.once('exit', () => clearTimeout(killTimer))
  }
  stop(): InternetStatus {
    if (this.child) this.terminate(this.child)
    this.publish({ state: 'off' })
    return this.status
  }
}
