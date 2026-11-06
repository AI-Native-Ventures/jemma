import { contextBridge, ipcRenderer } from 'electron'

/** What the plain screens may ask the main process. */
contextBridge.exposeInMainWorld('jemma', {
  getState: (opts?: { fresh?: boolean }) => ipcRenderer.invoke('state:get', opts),
  getShell: () => ipcRenderer.invoke('shell:get'),
  getStopped: () => ipcRenderer.invoke('stopped:get'),
  pairWithCode: (code: string) => ipcRenderer.invoke('pair:code', code),
  signInWithEmail: () => ipcRenderer.invoke('signin:email'),
  runOn: (agent: 'claude' | 'codex') => ipcRenderer.invoke('agent:run', agent),
  keepCloud: () => ipcRenderer.invoke('agent:cloud'),
  setPaused: (paused: boolean) => ipcRenderer.invoke('paused:set', paused),
  showStopped: () => ipcRenderer.invoke('stopped:show'),
  runStoppedInCloud: () => ipcRenderer.invoke('stopped:cloud'),
  retryStoppedLater: () => ipcRenderer.invoke('stopped:retry'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  onState: (cb: () => void) => ipcRenderer.on('state:changed', () => cb()),
})
