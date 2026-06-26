import { basename } from "node:path"
import { importFolder, openSystemJson } from "./importerService"
import { addRecent } from "./recentStore"
import type { OpenResult } from "./ipc"

export function handleImportFolder(dir: string, userDataDir: string): OpenResult {
  const result = importFolder(dir)
  if (result.ok) addRecent(userDataDir, { path: dir, kind: "folder", label: basename(dir) })
  return result
}

export function handleOpenFile(file: string, userDataDir: string): OpenResult {
  const result = openSystemJson(file)
  if (result.ok) addRecent(userDataDir, { path: file, kind: "file", label: basename(file) })
  return result
}
