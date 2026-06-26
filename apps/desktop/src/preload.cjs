// Preload runs in Electron's own loader (NOT through the main-process tsx
// bootstrap), so it must be plain CommonJS JS. Channel names are inlined to keep
// this file dependency-free; they MUST match src/ipc.ts CHANNELS.
const { contextBridge, ipcRenderer } = require("electron")

const CHANNELS = {
  importFolder: "import:folder",
  openFile: "open:file",
  listRecent: "recent:list",
  openRecent: "recent:open",
}

contextBridge.exposeInMainWorld("systemDiagram", {
  openFolder: () => ipcRenderer.invoke(CHANNELS.importFolder),
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  listRecent: () => ipcRenderer.invoke(CHANNELS.listRecent),
  openRecent: (p) => ipcRenderer.invoke(CHANNELS.openRecent, p),
  onMenu: (cb) => {
    ipcRenderer.on("menu:open-folder", () => cb("open-folder"))
    ipcRenderer.on("menu:open-file", () => cb("open-file"))
  },
})
