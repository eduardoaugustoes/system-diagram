import { describe, it, expect } from "vitest"
import { addVisionFromModel, type StoreState } from "./visionStore"
import type { Model } from "../engine/types"

const model: Model = { system: { id: "gw", name: "GW" }, components: [], connections: [], capabilities: [], owners: [] }

describe("addVisionFromModel", () => {
  it("appends a vision and makes it active", () => {
    const empty: StoreState = { visions: [], activeId: "" }
    const next = addVisionFromModel(empty, model, "GitHub App Gateway")
    expect(next.visions).toHaveLength(1)
    expect(next.visions[0].name).toBe("GitHub App Gateway")
    expect(next.activeId).toBe(next.visions[0].id)
  })
})
