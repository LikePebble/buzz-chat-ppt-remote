import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInteractionServer } from '../src/interaction/server'
import { MockPowerPointController } from '../src/interaction/powerpoint'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('nested participant/host routes use same-origin root base and offer corresponding source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buzz-web-'))
  const html = await readFile('src/renderer/interaction.html', 'utf8')
  await writeFile(join(root, 'interaction.html'), html)
  await writeFile(join(root, 'source.tar.gz'), 'test corresponding source')
  const server = createInteractionServer({
    controller: new MockPowerPointController(),
    webRoot: root,
    sourceArchive: join(root, 'source.tar.gz'),
    logger: () => {}
  })
  try {
    const port = await server.listen(0, '127.0.0.1')
    for (const role of ['r', 'host']) {
      const response = await fetch(`http://127.0.0.1:${port}/${role}/${server.activeRoom.id}`)
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<base href="\/"/)
      assert.match(response.headers.get('content-security-policy') ?? '', /base-uri 'self'/)
    }
    const source = await fetch(`http://127.0.0.1:${port}/source`)
    assert.equal(source.status, 200)
    assert.match(source.headers.get('content-disposition') ?? '', /attachment/)
    assert.equal(await source.text(), 'test corresponding source')
  } finally {
    await server.close()
    await rm(root, { recursive: true })
  }
})

test('development source download rebuilds current source and excludes private review artifacts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'buzz-source-'))
  const archive = join(temp, 'source.tar.gz')
  const server = createInteractionServer({
    controller: new MockPowerPointController(),
    devRoot: process.cwd(),
    devUrl: 'http://127.0.0.1:1',
    sourceArchive: archive,
    logger: () => {}
  })
  try {
    await writeFile(archive, 'stale archive')
    const base = `http://127.0.0.1:${await server.listen(0, '127.0.0.1')}`
    const response = await fetch(base + '/source')
    assert.equal(response.status, 200)
    const downloaded = Buffer.from(await response.arrayBuffer())
    assert.deepEqual(downloaded, await readFile(archive))
    const exec = promisify(execFile)
    const { stdout: files } = await exec('/usr/bin/tar', ['-tzf', archive])
    assert.ok(!files.includes('docs/reviews/'))
    assert.ok(files.includes('scripts/source-archive.ts'))
    const { stdout: source } = await exec('/usr/bin/tar', [
      '-xOzf',
      archive,
      'src/interaction/server.ts'
    ])
    assert.equal(source, await readFile('src/interaction/server.ts', 'utf8'))
  } finally {
    await server.close()
    await rm(temp, { recursive: true })
  }
})

test('dev proxy admits active modules but blocks unrelated files and traversal before upstream', async () => {
  const seen: string[] = []
  const upstream = createServer((req, res) => {
    seen.push(req.url!)
    res.end('module')
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  assert.ok(address && typeof address !== 'string')
  const root = process.cwd()
  const server = createInteractionServer({
    controller: new MockPowerPointController(),
    devRoot: root,
    devUrl: `http://127.0.0.1:${address.port}`,
    logger: () => {}
  })
  try {
    const base = `http://127.0.0.1:${await server.listen(0, '127.0.0.1')}`
    for (const path of [
      `/r/${server.activeRoom.id}`,
      '/interaction/App.vue?vue&type=style',
      '/interaction/fonts/PretendardVariable.woff2',
      '/@vite/client',
      `/@fs${root}/src/interaction/protocol.ts`,
      `/@fs${root}/node_modules/.vite/deps/vue.js?v=123`
    ])
      assert.equal((await fetch(base + path)).status, 200, path)
    const allowedCount = seen.length
    for (const path of [
      '/package.json',
      '/.env.development',
      '/mobile/main.js',
      `/@fs${resolve('package.json')}`,
      `/@fs${root}/src/interaction/main.ts`,
      '/interaction/%2e%2e%2fpackage.json',
      '/interaction/%252e%252e%252fpackage.json',
      `/@fs${root}/node_modules/.vite/deps/%2e%2e%2f_metadata.json`,
      '/@id/anything',
      '/interaction/%ZZ',
      '/interaction/fonts/other.woff2'
    ])
      assert.equal((await fetch(base + path)).status, 404, path)
    assert.equal(seen.length, allowedCount)
    assert.equal((await fetch(base + '/source')).status, 503)
  } finally {
    await server.close()
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve()))
    )
  }
})
