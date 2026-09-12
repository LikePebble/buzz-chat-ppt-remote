import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 820, webPreferences: { sandbox: true, contextIsolation: true } })
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/interaction.html`)
  else await win.loadFile(join(__dirname, '../renderer/interaction.html'))
  console.info('[app] Apple Silicon first boot', process.arch)
})
app.on('window-all-closed', () => app.quit())
