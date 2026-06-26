import { describe, it, expect } from "vitest"
import { layoutModel } from "./layout"
import type { Model, Component } from "../engine/types"

const comp = (id: string, extra: Partial<Component> = {}): Component => ({
  id, kind: "service", name: id, capabilityIds: [], tags: [], metadata: {}, ...extra,
})

describe("layoutModel — nesting", () => {
  it("lays out a child inside its parent and reports both with parentId", async () => {
    const model: Model = {
      system: { id: "s", name: "S" },
      components: [comp("lambda"), comp("log", { parentId: "lambda", kind: "job" })],
      connections: [],
      capabilities: [],
      owners: [],
    }
    const result = await layoutModel(model)
    const lambda = result.nodes.find(n => n.id === "lambda")
    const log = result.nodes.find(n => n.id === "log")
    expect(lambda).toBeDefined()
    expect(log).toBeDefined()
    expect(log!.parentId).toBe("lambda")
    // child is positioned within the parent's bounds (absolute coords)
    expect(log!.x).toBeGreaterThanOrEqual(lambda!.x)
    expect(log!.y).toBeGreaterThanOrEqual(lambda!.y)
  })
})
