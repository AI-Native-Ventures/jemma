import { contextBridge, ipcRenderer } from 'electron'

/** What the plain settings and status pages may ask the main process. */
contextBridge.exposeInMainWorld('jemma', {
  getState: () => ipcRenderer.invoke('state:get'),
  chooseAgent: (agent: 'claude' | 'codex') => ipcRenderer.invoke('agent:choose', agent),
  setPaused: (paused: boolean) => ipcRenderer.invoke('paused:set', paused),
  pairWithCode: (code: string) => ipcRenderer.invoke('pair:code', code),
  pairThisMac: () => ipcRenderer.invoke('pair:self'),
  unpair: () => ipcRenderer.invoke('pair:clear'),
  openWeb: () => ipcRenderer.invoke('web:open'),
  onState: (cb: () => void) => ipcRenderer.on('state:changed', () => cb()),
})
