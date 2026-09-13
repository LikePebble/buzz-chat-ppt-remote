import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('Internet sharing requires the macOS arm64 build.')
const version = '2026.9.1'
const checksum = 'c27ab8fd0aa489449e3d201eb02f957ef460a13b613662928b1b23394bf1bcfe'
const directory = resolve('build/vendor')
const archive = resolve(directory, `cloudflared-${version}.tgz`)
mkdirSync(directory, { recursive: true })
if (!existsSync(archive)) {
  execFileSync(
    '/usr/bin/curl',
    [
      '--fail',
      '--location',
      '--retry',
      '2',
      '--output',
      archive,
      `https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-darwin-arm64.tgz`
    ],
    { stdio: 'inherit' }
  )
}
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== checksum)
  throw new Error('cloudflared archive checksum mismatch; remove the cached archive and retry.')
execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', directory, 'cloudflared'])
chmodSync(resolve(directory, 'cloudflared'), 0o755)
console.log(`Verified cloudflared ${version} (darwin-arm64).`)
