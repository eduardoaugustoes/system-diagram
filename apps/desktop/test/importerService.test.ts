import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { importFolder, openSystemJson } from "../src/importerService"

function tmpDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "svc-"))
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return dir
}

describe("importerService", () => {
  it("importFolder returns ok with a model for a CDK dir", () => {
    const dir = tmpDir({
      "stack.ts": `
        import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
        export class S { constructor() { const usersTable = new dynamodb.Table(this, "U", { tableName: "u" }) } }
      `,
    })
    const r = importFolder(dir)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.model.components[0].id).toBe("usersTable")
      expect(r.source).toBe(dir)
    }
  })

  it("importFolder returns an error when no .ts files exist", () => {
    const dir = tmpDir({ "readme.md": "# nope" })
    const r = importFolder(dir)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no \.ts/i)
  })

  it("openSystemJson loads and validates a saved model", () => {
    const model = { system: { id: "s", name: "S" }, components: [], connections: [], capabilities: [], owners: [] }
    const dir = tmpDir({ "m.system.json": JSON.stringify(model) })
    const r = openSystemJson(join(dir, "m.system.json"))
    expect(r.ok).toBe(true)
  })

  it("openSystemJson rejects a model that fails validation", () => {
    const bad = { system: { id: "s", name: "S" }, components: [], connections: [{ id: "e1", fromId: "ghost", toId: "ghost2", kind: "sync-call", criticality: "hard", optional: false, tags: [] }], capabilities: [], owners: [] }
    const dir = tmpDir({ "bad.system.json": JSON.stringify(bad) })
    const r = openSystemJson(join(dir, "bad.system.json"))
    expect(r.ok).toBe(false)
  })
})
