import { readdirSync, readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { CdkImporter } from "../../../packages/import/src/cdkImporter"
import { validate } from "../../../prototypes/elk-renderer/src/engine/engine"
import type { Model } from "../../../prototypes/elk-renderer/src/engine/types"
import type { OpenResult } from "./ipc"

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map(e => join(dir, e.name))
}

export function importFolder(dir: string): OpenResult {
  const files = tsFiles(dir)
  if (files.length === 0) {
    return { ok: false, error: `No .ts files found in ${dir}` }
  }
  try {
    const id = basename(dir)
    const { model, diagnostics } = CdkImporter.import(files, { systemId: id, systemName: id })
    return { ok: true, model, diagnostics, source: dir }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function openSystemJson(file: string): OpenResult {
  let model: Model
  try {
    model = JSON.parse(readFileSync(file, "utf8")) as Model
  } catch (err) {
    return { ok: false, error: `Could not read ${file}: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = validate(model)
  if (!result.ok) {
    return { ok: false, error: result.errors.map(e => `[${e.code}] ${e.path}: ${e.message}`).join("\n") }
  }
  return { ok: true, model, diagnostics: [], source: file }
}
