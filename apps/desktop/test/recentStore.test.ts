import { describe, it, expect } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { addRecent, listRecent } from "../src/recentStore"

function userData(): string {
  return mkdtempSync(join(tmpdir(), "recent-"))
}

describe("recentStore", () => {
  it("adds and lists most-recent-first, deduped by path", () => {
    const ud = userData()
    const real = mkdtempSync(join(tmpdir(), "proj-"))
    addRecent(ud, { path: real, kind: "folder", label: "a" })
    addRecent(ud, { path: real, kind: "folder", label: "a-again" })
    const list = listRecent(ud)
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe("a-again")
  })

  it("caps at 8 entries", () => {
    const ud = userData()
    for (let i = 0; i < 12; i++) {
      const d = mkdtempSync(join(tmpdir(), `p${i}-`))
      addRecent(ud, { path: d, kind: "folder", label: `p${i}` })
    }
    expect(listRecent(ud).length).toBeLessThanOrEqual(8)
  })

  it("prunes entries whose path no longer exists", () => {
    const ud = userData()
    const gone = mkdtempSync(join(tmpdir(), "gone-"))
    addRecent(ud, { path: gone, kind: "folder", label: "gone" })
    rmSync(gone, { recursive: true, force: true })
    expect(listRecent(ud)).toHaveLength(0)
  })
})
