import { resolve } from 'node:path'

// Vite runs on loopback. Only the active renderer's modules may cross the LAN proxy.
export function allowedDevPath(url: string, root: string): boolean {
  let path: string
  try {
    path = decodeURIComponent(url.split('?')[0])
  } catch {
    return false
  }
  if (
    /[\\%]/.test(path) ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '.' || part === '..')
  )
    return false
  if (
    path === '/interaction.html' ||
    path === '/@vite/client' ||
    path === '/@id/__x00__plugin-vue:export-helper' ||
    /^\/interaction\/(main\.ts|zoom-guard\.ts|App\.vue|style\.css)$/.test(path) ||
    path === '/interaction/fonts/PretendardVariable.woff2'
  )
    return true
  const fsPath = `/@fs${resolve(root)}`
  return (
    path === `${fsPath}/src/interaction/protocol.ts` ||
    path === `${fsPath}/node_modules/vite/dist/client/env.mjs` ||
    (path.startsWith(`${fsPath}/node_modules/.vite/deps/`) &&
      /^[\w.-]+\.(js|map)$/.test(path.slice(`${fsPath}/node_modules/.vite/deps/`.length)))
  )
}
