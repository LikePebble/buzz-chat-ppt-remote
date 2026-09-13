import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
export async function createSourceArchive(root: string, destination: string): Promise<void> {
  const output = resolve(destination)
  const temporary = `${output}.${randomUUID()}.tmp`
  await mkdir(dirname(output), { recursive: true })
  try {
    await exec(
      '/usr/bin/tar',
      [
        '-czf',
        temporary,
        '--exclude=.DS_Store',
        '--exclude=docs/reviews',
        '--exclude=build/vendor',
        'src',
        'scripts',
        'tests',
        'docs',
        'build',
        'package.json',
        'package-lock.json',
        'electron.vite.config.ts',
        'electron-builder.yml',
        'tsconfig.json',
        'tsconfig.node.json',
        'tsconfig.web.json',
        'eslint.config.mjs',
        '.npmrc',
        '.prettierrc.yaml',
        'LICENSE.txt',
        'LICENSE_NOTES.md',
        'THIRD_PARTY_NOTICES.txt',
        'README.md',
        'PLAN.md',
        'MACOS_PORTING.md'
      ],
      { cwd: root, timeout: 30000 }
    )
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
}
