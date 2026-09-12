import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, systemPreferences } from 'electron'
import { join } from 'node:path'
import { createInteractionServer } from './server'
import { MacOSPowerPointController, MockPowerPointController } from './powerpoint'
import type { HostBootstrap } from './protocol'

let win: BrowserWindow | null = null
let server: ReturnType<typeof createInteractionServer> | undefined
let hostUrl = ''
let bootstrap: HostBootstrap
const trusted = () =>
  process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(false)
const controller =
  process.env.BUZZ_MOCK_PPT === '1'
    ? new MockPowerPointController()
    : new MacOSPowerPointController(trusted)
const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()
else {
  app.on('second-instance', () => {
    win?.show()
    win?.focus()
  })
  app
    .whenReady()
    .then(async () => {
      console.info('[app] Buzz Chat PPT Remote', app.getVersion(), process.arch)
      server = createInteractionServer({
        controller,
        webRoot: join(__dirname, '../renderer'),
        devUrl: process.env.ELECTRON_RENDERER_URL,
        sourceArchive: app.isPackaged
          ? join(process.resourcesPath, 'source.tar.gz')
          : join(app.getAppPath(), 'out/source.tar.gz')
      })
      let port: number
      try {
        port = await server.listen(3210)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
        port = await server.listen(0)
      }
      hostUrl = `http://127.0.0.1:${port}/host/${server.activeRoom.id}`
      bootstrap = {
        roomId: server.activeRoom.id,
        token: server.activeRoom.hostToken,
        serverUrl: `http://127.0.0.1:${port}`,
        system: server.system
      }
      function checkSender(event: Electron.IpcMainInvokeEvent): void {
        if (
          !win ||
          event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame ||
          event.senderFrame.url !== hostUrl
        )
          throw new Error('UNAUTHORIZED')
      }
      ipcMain.handle('interaction:bootstrap', (event) => {
        checkSender(event)
        return bootstrap
      })
      ipcMain.handle('interaction:accessibility', (event) => {
        checkSender(event)
        return systemPreferences.isTrustedAccessibilityClient(true)
      })
      ipcMain.handle('interaction:settings', async (event) => {
        checkSender(event)
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
        )
      })
      ipcMain.handle('interaction:copy', (event, text: unknown) => {
        checkSender(event)
        if (typeof text !== 'string' || text.length > 2048) throw new Error('INVALID_PAYLOAD')
        clipboard.writeText(text)
      })
      await createWindow()
    })
    .catch((error) => {
      console.error('[app] startup failed', error)
      dialog.showErrorBox('서버 시작 실패', '앱을 다시 시작하고 네트워크 접근 권한을 확인하세요.')
      app.quit()
    })
  app.on('activate', () => {
    if (hostUrl && !win) void createWindow()
    else win?.show()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    void server?.close()
  })
}
async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    title: 'Buzz Chat PPT Remote',
    width: 1180,
    height: 900,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#f3f2eb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url === 'https://github.com/smilexizheng/mobile-pc-control-server' ||
      bootstrap.system.participantUrls.includes(url)
    )
      void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== hostUrl) {
      event.preventDefault()
      if (url === `${bootstrap.serverUrl}/source`) win?.webContents.downloadURL(url)
    }
  })
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  win.on('closed', () => {
    win = null
  })
  win.webContents.on('render-process-gone', (_event, details) =>
    console.error('[app] renderer stopped', details.reason)
  )
  await win.loadURL(hostUrl)
  console.info('[app] frontend loaded; controller initialized; accessibility', trusted())
}
