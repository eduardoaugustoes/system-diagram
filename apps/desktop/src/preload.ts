import { contextBridge, ipcRenderer } from "electron"
import { CHANNELS } from "./ipc"

contextBridge.exposeInMainWorld("systemDiagram", {
  openFolder: () => ipcRenderer.invoke(CHANNELS.importFolder),
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  listRecent: () => ipcRenderer.invoke(CHANNELS.listRecent),
  openRecent: (p: string) => ipcRenderer.invoke(CHANNELS.openRecent, p),
  onMenu: (cb: (action: "open-folder" | "open-file") => void) => {
    ipcRenderer.on("menu:open-folder", () => cb("open-folder"))
    ipcRenderer.on("menu:open-file", () => cb("open-file"))
  },
})
