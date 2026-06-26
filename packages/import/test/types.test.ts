import { describe, it, expect } from "vitest"
import type { ImporterPlugin, ImportResult, Diagnostic } from "../src/types"

describe("plugin contract", () => {
  it("a minimal plugin satisfies the ImporterPlugin shape", () => {
    const plugin: ImporterPlugin = {
      id: "noop",
      detect: () => false,
      import: (): ImportResult => ({
        model: { system: { id: "s", name: "S" }, components: [], connections: [], capabilities: [], owners: [] },
        diagnostics: [] as Diagnostic[],
      }),
    }
    expect(plugin.id).toBe("noop")
    expect(plugin.detect("/anywhere")).toBe(false)
    expect(plugin.import([], {}).model.components).toEqual([])
  })
})
