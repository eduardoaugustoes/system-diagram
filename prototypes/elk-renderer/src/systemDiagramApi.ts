import type { Model } from "./engine/types"

export interface Diagnostic {
  level: "info" | "warn"
  code: string
  message: string
  file?: string
  line?: number
}

export type OpenResult =
  | { ok: true; model: Model; diagnostics: Diagnostic[]; source: string }
  | { ok: false; error: string }

export interface RecentEntry {
  path: string
  kind: "folder" | "file"
  label: string
}

export interface SystemDiagramApi {
  openFolder(): Promise<OpenResult>
  openFile(): Promise<OpenResult>
  listRecent(): Promise<RecentEntry[]>
  openRecent(path: string): Promise<OpenResult>
  onMenu(cb: (action: "open-folder" | "open-file") => void): void
}

declare global {
  interface Window {
    systemDiagram: SystemDiagramApi
  }
}
