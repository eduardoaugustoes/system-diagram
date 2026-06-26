import { describe, it, expect } from "vitest"
import { CHANNELS } from "../src/ipc"
import type { OpenResult, RecentEntry } from "../src/ipc"

describe("ipc contract", () => {
  it("exposes the four channel names", () => {
    expect(CHANNELS.importFolder).toBe("import:folder")
    expect(CHANNELS.openFile).toBe("open:file")
    expect(CHANNELS.listRecent).toBe("recent:list")
    expect(CHANNELS.openRecent).toBe("recent:open")
  })
  it("OpenResult and RecentEntry are usable shapes", () => {
    const ok: OpenResult = {
      ok: true,
      model: { system: { id: "s", name: "S" }, components: [], connections: [], capabilities: [], owners: [] },
      diagnostics: [],
      source: "/tmp/x",
    }
    const entry: RecentEntry = { path: "/tmp/x", kind: "folder", label: "x" }
    expect(ok.ok).toBe(true)
    expect(entry.kind).toBe("folder")
  })
})
