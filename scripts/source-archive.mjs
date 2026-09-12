import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
mkdirSync('out', { recursive: true })
execFileSync('/usr/bin/tar', ['-czf', 'out/source.tar.gz', '--exclude=.DS_Store', 'src', 'scripts', 'tests', 'docs', 'build', 'package.json', 'package-lock.json', 'electron.vite.config.ts', 'electron-builder.yml', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json', 'eslint.config.mjs', '.npmrc', '.prettierrc.yaml', 'LICENSE.txt', 'LICENSE_NOTES.md', 'README.md', 'PLAN.md', 'MACOS_PORTING.md'])
