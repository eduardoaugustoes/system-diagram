import { describe, it, expect } from "vitest"
import { resolveRef } from "../src/crossFile"
import type { Component } from "../src/types"

const comp = (id: string): Component => ({
  id, kind: "datastore", name: id, capabilityIds: [], tags: [], metadata: {},
})

describe("resolveRef", () => {
  const local = new Map([["handoffLambda", comp("handoffLambda")]])
  const data = new Map([["installationsTable", comp("installationsTable")]])

  it("resolves a this.data.<field> reference to the data-stack component", () => {
    const r = resolveRef("this.data.installationsTable", local, data)
    expect(r.component?.id).toBe("installationsTable")
  })
  it("resolves a bare local variable reference", () => {
    const r = resolveRef("handoffLambda", local, data)
    expect(r.component?.id).toBe("handoffLambda")
  })
  it("returns undefined component with a reason for unresolvable refs", () => {
    const r = resolveRef("this.data.mysteryThing", local, data)
    expect(r.component).toBeUndefined()
    expect(r.reason).toMatch(/unresolved/i)
  })
})
