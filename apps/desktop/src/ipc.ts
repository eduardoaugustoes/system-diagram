import type { Model } from "../../../prototypes/elk-renderer/src/engine/types"
import type { Diagnostic } from "../../../packages/import/src/types"

export type OpenResult =
  | { ok: true; model: Model; diagnostics: Diagnostic[]; source: string }
  | { ok: false; error: string }

export interface RecentEntry {
  path: string
  kind: "folder" | "file"
  label: string
}

export const CHANNELS = {
  importFolder: "import:folder",
  openFile: "open:file",
  listRecent: "recent:list",
  openRecent: "recent:open",
} as const
