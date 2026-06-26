import { app, BrowserWindow } from "electron"
import * as path from "node:path"

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.ts"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const rendererIndex = path.resolve(
    __dirname,
    "../../../prototypes/elk-renderer/dist/index.html",
  )
  win.loadFile(rendererIndex)
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
