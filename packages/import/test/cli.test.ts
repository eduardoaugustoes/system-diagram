import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("cli", () => {
  it("writes a system.json from a CDK dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-"))
    writeFileSync(join(dir, "stack.ts"), `
      import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
      export class MyStack {
        constructor() {
          const usersTable = new dynamodb.Table(this, "U", { tableName: "u" })
        }
      }
    `)
    const out = join(dir, "out.system.json")
    execFileSync("npx", ["tsx", "src/cli.ts", dir, "-o", out], { cwd: process.cwd() })
    const model = JSON.parse(readFileSync(out, "utf8"))
    expect(model.components[0].id).toBe("usersTable")
    expect(model.components[0].metadata.subtype).toBe("aws:dynamodb")
  })
})
