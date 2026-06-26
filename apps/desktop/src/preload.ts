import { contextBridge, ipcRenderer } from "electron"
import { CHANNELS } from "./ipc"

contextBridge.exposeInMainWorld("systemDiagram", {
  openFolder: () => ipcRenderer.invoke(CHANNELS.importFolder),
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  listRecent: () => ipcRenderer.invoke(CHANNELS.listRecent),
  openRecent: (path: string) => ipcRenderer.invoke(CHANNELS.openRecent, path),
})
