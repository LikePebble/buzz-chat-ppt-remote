import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KEY_SCRIPTS,
  MacOSPowerPointController,
  MockPowerPointController
} from '../src/interaction/powerpoint'
import { PPT_COMMANDS } from '../src/interaction/protocol'

test('mock implements every command', async () => {
  const mock = new MockPowerPointController()
  for (const command of PPT_COMMANDS) await mock[command]()
  assert.deepEqual(mock.commands, [...PPT_COMMANDS])
  assert.equal((await mock.getStatus()).mock, true)
})
test('macOS controller checks running/permission before fixed keys and verifies PowerPoint focus', async () => {
  const scripts: string[] = []
  const controller = new MacOSPowerPointController(
    () => true,
    async (script) => {
      scripts.push(script)
      return 'true'
    }
  )
  for (const command of PPT_COMMANDS) await controller[command]()
  assert.equal(scripts.length, 12)
  assert.ok(scripts[1].includes(KEY_SCRIPTS.advance))
  assert.ok(scripts[5].includes('key code 11'))
  assert.ok(scripts[1].includes('frontmost of process "Microsoft PowerPoint"'))
  assert.ok(scripts[1].indexOf('frontmost') < scripts[1].indexOf('key code 49'))
  assert.equal((await controller.getStatus()).ready, true)
})
test('status recovery clears probe errors without hiding command failures', async () => {
  let probeFails = true
  let commandFails = false
  const controller = new MacOSPowerPointController(
    () => true,
    async (script) => {
      if (!script.includes('key code') && probeFails) throw new Error('mock probe timeout')
      if (script.includes('key code') && commandFails)
        throw new Error('Not authorized to send Apple events. (-1743)')
      return 'true'
    }
  )
  assert.equal((await controller.getStatus()).probeFailed, true)
  probeFails = false
  assert.deepEqual(await controller.getStatus(), {
    running: true,
    accessibilityGranted: true,
    ready: true,
    lastError: null,
    probeFailed: false,
    mock: false
  })
  commandFails = true
  await assert.rejects(controller.advance(), { code: 'ACCESSIBILITY_PERMISSION_REQUIRED' })
  probeFails = true
  assert.equal((await controller.getStatus()).probeFailed, true)
  probeFails = false
  assert.equal((await controller.getStatus()).lastError?.code, 'ACCESSIBILITY_PERMISSION_REQUIRED')
  commandFails = false
  await controller.advance()
  assert.equal((await controller.getStatus()).lastError, null)
})
test('missing PowerPoint, Accessibility and Automation errors are structured and send no accidental keys', async () => {
  const scripts: string[] = []
  const stopped = new MacOSPowerPointController(
    () => true,
    async (script) => {
      scripts.push(script)
      return 'false'
    }
  )
  await assert.rejects(stopped.advance(), { code: 'POWERPOINT_NOT_RUNNING' })
  assert.equal(scripts.length, 1)
  const denied = new MacOSPowerPointController(
    () => false,
    async () => 'true'
  )
  await assert.rejects(denied.advance(), { code: 'ACCESSIBILITY_PERMISSION_REQUIRED' })
  const automation = new MacOSPowerPointController(
    () => true,
    async (script) => {
      if (script.includes('key code'))
        throw new Error('Not authorized to send Apple events. (-1743)')
      return 'true'
    }
  )
  await assert.rejects(automation.advance(), { code: 'ACCESSIBILITY_PERMISSION_REQUIRED' })
  assert.equal((await automation.getStatus()).lastError?.code, 'ACCESSIBILITY_PERMISSION_REQUIRED')
})
test('overlapping commands are rejected instead of queued for surprising later input', async () => {
  let release!: () => void
  const controller = new MacOSPowerPointController(
    () => true,
    async (script) => {
      if (script.includes('key code'))
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return 'true'
    }
  )
  const first = controller.advance()
  await new Promise((resolve) => setImmediate(resolve))
  await assert.rejects(controller.advance(), { code: 'RATE_LIMITED' })
  release()
  await first
})
