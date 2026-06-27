import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const bundle = join(__dirname, "..", "build", "main.cjs")

describe("main bundle", () => {
  it("exists after build:main", () => {
    expect(existsSync(bundle)).toBe(true)
  })
  it("inlined the importer + ts-morph (not lost to a dynamic require)", () => {
    const src = readFileSync(bundle, "utf8")
    // the importer service's own error string proves importFolder was bundled
    expect(src.includes("No .ts files found")).toBe(true)
    // ts-morph's AST kinds prove the parser is inlined, not externalized
    expect(src.includes("NewExpression")).toBe(true)
  })
})
