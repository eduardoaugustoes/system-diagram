export type {
  Model,
  Component,
  Connection,
  ComponentKind,
  ConnectionKind,
  Criticality,
} from "../../../prototypes/elk-renderer/src/engine/types"

import type { Model } from "../../../prototypes/elk-renderer/src/engine/types"

export interface Diagnostic {
  level: "info" | "warn"
  code: string
  message: string
  file?: string
  line?: number
}

export interface ImportOptions {
  systemId?: string
  systemName?: string
}

export interface ImportResult {
  model: Model
  diagnostics: Diagnostic[]
}

export interface ImporterPlugin {
  id: string
  detect(workspace: string): boolean
  import(files: string[], opts: ImportOptions): ImportResult
}
