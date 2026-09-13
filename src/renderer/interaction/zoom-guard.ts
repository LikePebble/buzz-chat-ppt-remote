// Match the internal ai-companion zoom policy while preserving ordinary scrolling.
export function installZoomGuard(target: Document = document): () => void {
  const prevent = (event: Event) => event.preventDefault()
  const touch = (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault()
  }
  let lastTap = -Infinity
  let lastX = 0
  let lastY = 0
  const touchEnd = (event: TouchEvent) => {
    if (event.touches.length || event.changedTouches.length !== 1) return
    const now = event.timeStamp
    const point = event.changedTouches[0]
    if (now - lastTap < 350 && Math.hypot(point.clientX - lastX, point.clientY - lastY) < 30) {
      event.preventDefault()
      // Keep repeated control-button taps usable when suppressing the native click/zoom.
      const button = (event.target as Element | null)?.closest?.('button')
      if (button && !button.classList.contains('buzz-button')) button.click()
    }
    lastTap = now
    lastX = point.clientX
    lastY = point.clientY
  }
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey) event.preventDefault()
  }
  const gestures = ['gesturestart', 'gesturechange', 'gestureend']
  for (const name of gestures) target.addEventListener(name, prevent, { passive: false })
  target.addEventListener('touchmove', touch, { passive: false })
  target.addEventListener('wheel', wheel, { passive: false })
  target.addEventListener('touchend', touchEnd, { passive: false })
  target.addEventListener('dblclick', prevent, { passive: false })
  return () => {
    for (const name of gestures) target.removeEventListener(name, prevent)
    target.removeEventListener('touchmove', touch)
    target.removeEventListener('wheel', wheel)
    target.removeEventListener('touchend', touchEnd)
    target.removeEventListener('dblclick', prevent)
  }
}
