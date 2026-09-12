import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInteractionServer } from '../src/interaction/server'
import { MockPowerPointController } from '../src/interaction/powerpoint'

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
