import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from './protocol'
const api: DesktopApi = {
  bootstrap: () => ipcRenderer.invoke('interaction:bootstrap'),
  requestAccessibility: () => ipcRenderer.invoke('interaction:accessibility'),
  openAccessibilitySettings: () => ipcRenderer.invoke('interaction:settings'),
  copy: (text) => ipcRenderer.invoke('interaction:copy', text)
}
contextBridge.exposeInMainWorld('buzzHost', api)
