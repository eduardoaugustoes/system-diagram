import { app, BrowserWindow, Menu, dialog, ipcMain } from "electron"
import * as path from "node:path"
import { handleImportFolder, handleOpenFile } from "./handlers"
import { listRecent } from "./recentStore"
import { CHANNELS } from "./ipc"

function userDataDir(): string {
  return app.getPath("userData")
}

function registerIpc(win: BrowserWindow) {
  ipcMain.handle(CHANNELS.importFolder, async () => {
    const picked = await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: "cancelled" }
    return handleImportFolder(picked.filePaths[0], userDataDir())
  })
  ipcMain.handle(CHANNELS.openFile, async () => {
    const picked = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "System model", extensions: ["json"] }],
    })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: "cancelled" }
    return handleOpenFile(picked.filePaths[0], userDataDir())
  })
  ipcMain.handle(CHANNELS.listRecent, () => listRecent(userDataDir()))
  ipcMain.handle(CHANNELS.openRecent, (_e, p: string) =>
    p.endsWith(".json") ? handleOpenFile(p, userDataDir()) : handleImportFolder(p, userDataDir()),
  )
}

function buildMenu(win: BrowserWindow) {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open CDK Folder…",
          accelerator: "CmdOrCtrl+O",
          click: () => win.webContents.send("menu:open-folder"),
        },
        {
          label: "Open .system.json…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => win.webContents.send("menu:open-file"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const rendererIndex = app.isPackaged
    ? path.join(process.resourcesPath, "renderer", "index.html")
    : path.resolve(__dirname, "../../../prototypes/elk-renderer/dist/index.html")
  win.loadFile(rendererIndex)
  registerIpc(win)
  buildMenu(win)
}

app.whenReady().then(() => {
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
