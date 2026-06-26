import { Project, type SourceFile } from "ts-morph"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { extractComponents } from "./components"
import { extractConnections } from "./connections"
import { linkParents } from "./parentLink"
import { validate } from "../../../prototypes/elk-renderer/src/engine/engine"
import type { Component, Connection, Diagnostic, ImporterPlugin, ImportOptions, ImportResult, Model } from "./types"

function stackTagOf(source: SourceFile): string {
  const cls = source.getClasses()[0]
  return cls?.getName() ?? "UnknownStack"
}

export const CdkImporter: ImporterPlugin = {
  id: "cdk",

  detect(workspace: string): boolean {
    let found = false
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory() && entry.name !== "node_modules") walk(full)
        else if (entry.name.endsWith(".ts") && readFileSync(full, "utf8").includes("aws-cdk-lib")) found = true
      }
    }
    walk(workspace)
    return found
  },

  import(files: string[], opts: ImportOptions): ImportResult {
    const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true })
    const sources = files.map(f => project.addSourceFileAtPath(f))

    const components: Component[] = []
    const diagnostics: Diagnostic[] = []
    const dataFields = new Map<string, Component>()
    const perFileLocal = new Map<SourceFile, Map<string, Component>>()

    for (const source of sources) {
      const tag = stackTagOf(source)
      const { components: comps, byVarName, diagnostics: diags } = extractComponents(source, tag)
      components.push(...comps)
      diagnostics.push(...diags)
      perFileLocal.set(source, byVarName)
      for (const [name, comp] of byVarName) dataFields.set(name, comp) // producers visible cross-file
      diagnostics.push(...linkParents(source, byVarName)) // LogGroup → Lambda nesting (same file)
    }

    const connections: Connection[] = []
    for (const source of sources) {
      const local = perFileLocal.get(source)!
      const { connections: conns, diagnostics: diags } = extractConnections(source, { local, dataFields })
      connections.push(...conns)
      diagnostics.push(...diags)
    }
    // reassign globally-unique connection ids in collection order
    connections.forEach((c, i) => (c.id = `e${i + 1}`))

    const model: Model = {
      system: { id: opts.systemId ?? "system", name: opts.systemName ?? "System" },
      components,
      connections,
      capabilities: [],
      owners: [],
    }

    const validation = validate(model)
    if (!validation.ok) {
      throw new Error(
        `Imported model failed validation:\n` +
          validation.errors.map(e => `  [${e.code}] ${e.path}: ${e.message}`).join("\n"),
      )
    }

    return { model, diagnostics }
  },
}
