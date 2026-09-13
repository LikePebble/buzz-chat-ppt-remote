import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installZoomGuard } from '../src/renderer/interaction/zoom-guard'

test('zoom guard prevents pinch gestures but preserves single-touch and ordinary wheel scrolling', () => {
  const target = new EventTarget()
  const remove = installZoomGuard(target as unknown as Document)
  const dispatch = (type: string, fields = {}) => {
    const event = new Event(type, { cancelable: true })
    for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  assert.equal(dispatch('touchmove', { touches: [1] }), false)
  assert.equal(dispatch('touchmove', { touches: [1, 2] }), true)
  assert.equal(dispatch('wheel', { ctrlKey: false }), false)
  assert.equal(dispatch('wheel', { ctrlKey: true }), true)
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    assert.equal(dispatch(type), true)
  const tap = (timeStamp: number, x = 0) =>
    dispatch('touchend', {
      touches: [],
      changedTouches: [{ clientX: x, clientY: 0 }],
      timeStamp
    })
  assert.equal(tap(1000), false)
  assert.equal(tap(1200), true)
  assert.equal(tap(1800), false)
  assert.equal(tap(1900, 200), false)
  assert.equal(dispatch('dblclick'), true)
  remove()
  assert.equal(dispatch('touchmove', { touches: [1, 2] }), false)
  assert.equal(dispatch('gesturestart'), false)
})
