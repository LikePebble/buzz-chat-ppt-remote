/// <reference types="vite/client" />
import type { DesktopApi } from '../../interaction/protocol'
declare global {
  interface Window {
    buzzHost?: DesktopApi
  }
}
