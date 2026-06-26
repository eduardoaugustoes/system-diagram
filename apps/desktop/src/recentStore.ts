import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { RecentEntry } from "./ipc"

const MAX = 8

function file(dir: string): string {
  return join(dir, "recent.json")
}

function read(dir: string): RecentEntry[] {
  const f = file(dir)
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, "utf8"))
    return Array.isArray(parsed) ? (parsed as RecentEntry[]) : []
  } catch {
    return []
  }
}

export function addRecent(dir: string, entry: RecentEntry): void {
  const existing = read(dir).filter(e => e.path !== entry.path)
  const next = [entry, ...existing].slice(0, MAX)
  writeFileSync(file(dir), JSON.stringify(next, null, 2))
}

export function listRecent(dir: string): RecentEntry[] {
  const all = read(dir)
  const present = all.filter(e => existsSync(e.path))
  if (present.length !== all.length) {
    writeFileSync(file(dir), JSON.stringify(present, null, 2))
  }
  return present
}
