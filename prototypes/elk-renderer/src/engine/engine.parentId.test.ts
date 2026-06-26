import { describe, it, expect } from "vitest"
import { validate } from "./engine"
import type { Model, Component } from "./types"

const comp = (id: string, extra: Partial<Component> = {}): Component => ({
  id, kind: "service", name: id, capabilityIds: [], tags: [], metadata: {}, ...extra,
})

function model(components: Component[]): Model {
  return { system: { id: "s", name: "S" }, components, connections: [], capabilities: [], owners: [] }
}

describe("validate — parentId", () => {
  it("accepts a parentId that references an existing component", () => {
    const m = model([comp("lambda"), comp("log", { parentId: "lambda" })])
    expect(validate(m).ok).toBe(true)
  })
  it("rejects a parentId that references a missing component", () => {
    const m = model([comp("log", { parentId: "ghost" })])
    const r = validate(m)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === "REF")).toBe(true)
  })
  it("rejects a parented component that is itself a parent (single-level only)", () => {
    const m = model([
      comp("a"),
      comp("b", { parentId: "a" }),
      comp("c", { parentId: "b" }),
    ])
    const r = validate(m)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === "CYCLE")).toBe(true)
  })
})
