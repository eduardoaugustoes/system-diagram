import { describe, it, expect } from "vitest"
import { iconForSubtype } from "./icons"

describe("iconForSubtype", () => {
  it("returns a labeled icon for a known aws subtype", () => {
    expect(iconForSubtype("aws:lambda")).toEqual({ id: "lambda", label: "Lambda" })
  })
  it("returns undefined for no subtype (non-AWS models render as before)", () => {
    expect(iconForSubtype(undefined)).toBeUndefined()
  })
  it("returns undefined for an unknown subtype", () => {
    expect(iconForSubtype("gcp:run")).toBeUndefined()
  })
})
