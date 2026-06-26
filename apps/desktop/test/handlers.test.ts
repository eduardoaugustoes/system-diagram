import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { handleImportFolder } from "../src/handlers"

describe("handlers", () => {
  it("handleImportFolder imports and records the folder as recent", () => {
    const ud = mkdtempSync(join(tmpdir(), "ud-"))
    const proj = mkdtempSync(join(tmpdir(), "proj-"))
    writeFileSync(join(proj, "s.ts"), `
      import * as sqs from "aws-cdk-lib/aws-sqs"
      export class S { constructor() { const q = new sqs.Queue(this, "Q", { queueName: "q" }) } }
    `)
    const result = handleImportFolder(proj, ud)
    expect(result.ok).toBe(true)
    const recentFile = JSON.parse(readFileSync(join(ud, "recent.json"), "utf8"))
    expect(recentFile[0].path).toBe(proj)
  })
})
