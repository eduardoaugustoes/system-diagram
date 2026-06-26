import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { CdkImporter } from "./cdkImporter"

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i !== -1 ? argv[i + 1] : undefined
}

function parseArgs(argv: string[]): { dir: string; out: string; id?: string; name?: string } {
  const dir = argv[0]
  const out = flag(argv, "-o")
  if (!dir || !out) {
    console.error("usage: cdk-import <dir> -o <out>.system.json [--id <id>] [--name <name>]")
    process.exit(2)
  }
  return { dir, out, id: flag(argv, "--id"), name: flag(argv, "--name") }
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map(e => join(dir, e.name))
}

function main() {
  const { dir, out, id, name } = parseArgs(process.argv.slice(2))
  const files = tsFiles(dir)
  if (files.length === 0) {
    console.error(`no .ts files found in ${dir}`)
    process.exit(2)
  }
  try {
    const segments = dir.split("/").filter(Boolean)
    const result = CdkImporter.import(files, {
      systemId: id ?? segments.slice(-2).join("-"),
      systemName: name ?? segments[segments.length - 1],
    })
    writeFileSync(out, JSON.stringify(result.model, null, 2) + "\n")
    const counts = `${result.model.components.length} components, ${result.model.connections.length} connections`
    console.error(`wrote ${out} — ${counts}`)
    for (const d of result.diagnostics) console.error(`  [${d.level}] ${d.code}: ${d.message}`)
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  }
}

main()
