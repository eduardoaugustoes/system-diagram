# Electron Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing renderer + importer in a thin Electron shell so the user picks a CDK folder (or `.system.json`) via the OS and it renders — no source editing.

**Architecture:** A new `apps/desktop` Electron package. The main process (Node) shows native dialogs, runs `CdkImporter.import()` as a library on a picked folder, validates `.system.json` files, and manages a recent-files list. A preload contextBridge exposes a typed API. The existing Vite/React renderer (Electron-only) gets one store seam (`addVisionFromModel`), an empty state, and a diagnostics pill; its build-time model seed is removed.

**Runtime note (verified):** the importer and engine are ESM-syntax TypeScript files outside the desktop package's compilation root, so the main process is NOT compiled to CommonJS. Instead Electron launches a tiny CJS bootstrap (`bootstrap.cjs`) that registers `tsx` and imports the real `main.ts`; `tsx` transpiles `main.ts` and its cross-package `.ts` imports on the fly (the same mechanism the `cdk-import` CLI already uses — confirmed with a probe). The preload, however, IS a plain compiled/loadable file because Electron loads preload scripts directly; we keep preload dependency-free (only `electron` + a tiny local `ipc` import) and point Electron at the `.ts` preload via `tsx` as well through the same bootstrap registration.

**Tech Stack:** Electron, Node, TypeScript, Vitest, the existing `@system-diagram/import` + `elk-renderer` (Vite/React/ELK).

## Global Constraints

- Branch: `feat/desktop-app` (already created).
- The renderer is **Electron-only** — no plain-web fallback. `window.systemDiagram` is always present.
- The importer and engine are reused **unchanged** as libraries (`CdkImporter.import`, `validate`). No edits to `packages/import/src/*` except possibly exporting a `tsFiles` helper.
- Preload exposes ONLY a minimal typed API; NO raw `fs`/`ipcRenderer`/Node leaked to the renderer (`contextIsolation: true`, `nodeIntegration: false`).
- All main-process errors are mapped to `OpenResult` — the renderer never sees raw exceptions.
- v1 is `npm start` runnable. Packaging (.app/installer/electron-updater) is OUT of scope.
- Run package tests with `./node_modules/.bin/vitest` and typecheck with `./node_modules/.bin/tsc`; always `cd` to the package dir (cwd resets between shells).
- Commit after every task. Conventional commits. NO AI attribution.
- The renderer build must use relative asset paths (`base: "./"`) so Electron `loadFile` resolves `assets/`.

## Shared types (defined in Task 2, referenced throughout)

```ts
// apps/desktop/src/ipc.ts
import type { Model } from "../../../prototypes/elk-renderer/src/engine/types"
import type { Diagnostic } from "../../../packages/import/src/types"

export type OpenResult =
  | { ok: true; model: Model; diagnostics: Diagnostic[]; source: string }
  | { ok: false; error: string }

export interface RecentEntry { path: string; kind: "folder" | "file"; label: string }

export const CHANNELS = {
  importFolder: "import:folder",
  openFile: "open:file",
  listRecent: "recent:list",
  openRecent: "recent:open",
} as const
```

---

## File Structure

- `apps/desktop/package.json` — Electron package manifest.
- `apps/desktop/tsconfig.json` — TS config (noEmit; run via electron + tsx-compiled main, see Task 1).
- `apps/desktop/src/ipc.ts` — shared channel names + `OpenResult` / `RecentEntry` types.
- `apps/desktop/src/importerService.ts` — wraps `CdkImporter.import` + `.system.json` open + validate into `OpenResult`. Pure-ish (fs in, OpenResult out); the unit-test target.
- `apps/desktop/src/recentStore.ts` — read/write/dedupe/cap the recent list in a given dir.
- `apps/desktop/src/main.ts` — app lifecycle, BrowserWindow, native menu, dialogs, IPC handlers.
- `apps/desktop/src/preload.ts` — contextBridge typed API.
- `prototypes/elk-renderer/vite.config.ts` — MODIFY: `base: "./"`.
- `prototypes/elk-renderer/src/store/visionStore.ts` — MODIFY: add `addVisionFromModel`; remove build-time seed.
- `prototypes/elk-renderer/src/App.tsx` — MODIFY: empty state + Open actions via `window.systemDiagram`.
- `prototypes/elk-renderer/src/systemDiagramApi.ts` — CREATE: the renderer-side type for `window.systemDiagram`.

---

### Task 1: Electron package scaffold + blank window

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/preload.ts`

**Interfaces:**
- Produces: an Electron app that `npm start` launches, opening a window that loads the renderer's built `dist/index.html`.

- [ ] **Step 1: Create the manifest**

`apps/desktop/package.json`:
```json
{
  "name": "@system-diagram/desktop",
  "version": "0.0.1",
  "private": true,
  "main": "bootstrap.cjs",
  "scripts": {
    "build:renderer": "cd ../../prototypes/elk-renderer && npm run build",
    "start": "npm run build:renderer && electron .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.0"
  }
}
```

`apps/desktop/bootstrap.cjs` (Electron's real entry — registers tsx, then loads the TS main):
```js
// Electron launches this CJS file. It registers tsx so the rest of the app
// (main.ts + its cross-package .ts imports of the importer/engine) runs as TS.
require("tsx/cjs")
require("./src/main.ts")
```

- [ ] **Step 2: Create the tsconfig**

`apps/desktop/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

(Typecheck-only — no emit. The app runs through `tsx` at launch, like the importer CLI. `module: ES2022` + `bundler` resolution lets `main.ts` import the ESM-syntax importer/engine across packages, which a CommonJS config could not.)

- [ ] **Step 3: Write the preload (minimal, expands in Task 5)**

`apps/desktop/src/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from "electron"
import { CHANNELS } from "./ipc"

contextBridge.exposeInMainWorld("systemDiagram", {
  openFolder: () => ipcRenderer.invoke(CHANNELS.importFolder),
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  listRecent: () => ipcRenderer.invoke(CHANNELS.listRecent),
  openRecent: (path: string) => ipcRenderer.invoke(CHANNELS.openRecent, path),
})
```

(This imports `./ipc` — create a minimal stub now so Task 1 compiles; Task 2 fills it.)

`apps/desktop/src/ipc.ts` (minimal stub for now):
```ts
export const CHANNELS = {
  importFolder: "import:folder",
  openFile: "open:file",
  listRecent: "recent:list",
  openRecent: "recent:open",
} as const
```

- [ ] **Step 4: Write the main process (blank window)**

`apps/desktop/src/main.ts`:
```ts
import { app, BrowserWindow } from "electron"
import * as path from "node:path"

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.ts"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const rendererIndex = path.resolve(
    __dirname,
    "../../../prototypes/elk-renderer/dist/index.html",
  )
  win.loadFile(rendererIndex)
}

app.whenReady().then(() => {
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
```

- [ ] **Step 5: Install + verify it launches**

Run:
```bash
cd apps/desktop && npm install
cd ../../prototypes/elk-renderer && npm run build
cd ../../apps/desktop && npx electron . &
sleep 4 && echo "if a window opened, Task 1 works"
```
Expected: an Electron window opens (it will show the current renderer's seeded content until the seed is removed in Task 6). Electron launches `bootstrap.cjs` → registers tsx → loads `src/main.ts`. Close it with the window controls or `pkill -f electron`.

(If a headless environment can't open a window, this manual smoke is deferred to the Task-8 proof; `npx electron .` starting without a module-resolution crash is the minimum bar — check the terminal for errors.)

- [ ] **Step 6: Add base path to the renderer build**

Modify `prototypes/elk-renderer/vite.config.ts`:
```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
})
```

Rebuild the renderer (`cd ../../prototypes/elk-renderer && npm run build`) and confirm `dist/index.html` references `./assets/...` (relative).

- [ ] **Step 7: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/package.json apps/desktop/tsconfig.json apps/desktop/bootstrap.cjs apps/desktop/src/main.ts apps/desktop/src/preload.ts apps/desktop/src/ipc.ts apps/desktop/package-lock.json prototypes/elk-renderer/vite.config.ts
git commit -m "feat: scaffold Electron shell loading the renderer"
```

---

### Task 2: Shared IPC types

**Files:**
- Modify: `apps/desktop/src/ipc.ts`
- Test: `apps/desktop/test/ipc.test.ts`

**Interfaces:**
- Produces: `OpenResult`, `RecentEntry`, and the typed `CHANNELS` object (see "Shared types" above).

- [ ] **Step 1: Write the failing test**

`apps/desktop/test/ipc.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && npm install && ./node_modules/.bin/vitest run test/ipc.test.ts`
Expected: FAIL — `OpenResult`/`RecentEntry` not exported yet.

- [ ] **Step 3: Fill in ipc.ts**

Replace `apps/desktop/src/ipc.ts` with:
```ts
import type { Model } from "../../../prototypes/elk-renderer/src/engine/types"
import type { Diagnostic } from "../../../packages/import/src/types"

export type OpenResult =
  | { ok: true; model: Model; diagnostics: Diagnostic[]; source: string }
  | { ok: false; error: string }

export interface RecentEntry {
  path: string
  kind: "folder" | "file"
  label: string
}

export const CHANNELS = {
  importFolder: "import:folder",
  openFile: "open:file",
  listRecent: "recent:list",
  openRecent: "recent:open",
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/ipc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/src/ipc.ts apps/desktop/test/ipc.test.ts
git commit -m "feat: define shared IPC types and channels"
```

---

### Task 3: Importer service

**Files:**
- Create: `apps/desktop/src/importerService.ts`
- Test: `apps/desktop/test/importerService.test.ts`

**Interfaces:**
- Consumes: `CdkImporter` from `packages/import`, `validate` from the engine, `OpenResult` from `./ipc`.
- Produces:
  - `importFolder(dir: string): OpenResult` — globs `.ts`, runs `CdkImporter.import`, returns OpenResult; `{ok:false}` if no `.ts` files or the importer throws.
  - `openSystemJson(file: string): OpenResult` — reads + JSON.parses + `validate`; `{ok:false}` with validation messages if invalid.

- [ ] **Step 1: Write the failing test**

`apps/desktop/test/importerService.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { importFolder, openSystemJson } from "../src/importerService"

function tmpDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "svc-"))
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return dir
}

describe("importerService", () => {
  it("importFolder returns ok with a model for a CDK dir", () => {
    const dir = tmpDir({
      "stack.ts": `
        import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
        export class S { constructor() { const usersTable = new dynamodb.Table(this, "U", { tableName: "u" }) } }
      `,
    })
    const r = importFolder(dir)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.model.components[0].id).toBe("usersTable")
      expect(r.source).toBe(dir)
    }
  })

  it("importFolder returns an error when no .ts files exist", () => {
    const dir = tmpDir({ "readme.md": "# nope" })
    const r = importFolder(dir)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no \.ts/i)
  })

  it("openSystemJson loads and validates a saved model", () => {
    const model = { system: { id: "s", name: "S" }, components: [], connections: [], capabilities: [], owners: [] }
    const dir = tmpDir({ "m.system.json": JSON.stringify(model) })
    const r = openSystemJson(join(dir, "m.system.json"))
    expect(r.ok).toBe(true)
  })

  it("openSystemJson rejects a model that fails validation", () => {
    const bad = { system: { id: "s", name: "S" }, components: [], connections: [{ id: "e1", fromId: "ghost", toId: "ghost2", kind: "sync-call", criticality: "hard", optional: false, tags: [] }], capabilities: [], owners: [] }
    const dir = tmpDir({ "bad.system.json": JSON.stringify(bad) })
    const r = openSystemJson(join(dir, "bad.system.json"))
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && ./node_modules/.bin/vitest run test/importerService.test.ts`
Expected: FAIL — cannot find module `../src/importerService`.

- [ ] **Step 3: Write the service**

`apps/desktop/src/importerService.ts`:
```ts
import { readdirSync, readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { CdkImporter } from "../../../packages/import/src/cdkImporter"
import { validate } from "../../../prototypes/elk-renderer/src/engine/engine"
import type { Model } from "../../../prototypes/elk-renderer/src/engine/types"
import type { OpenResult } from "./ipc"

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map(e => join(dir, e.name))
}

export function importFolder(dir: string): OpenResult {
  const files = tsFiles(dir)
  if (files.length === 0) {
    return { ok: false, error: `No .ts files found in ${dir}` }
  }
  try {
    const id = basename(dir)
    const { model, diagnostics } = CdkImporter.import(files, { systemId: id, systemName: id })
    return { ok: true, model, diagnostics, source: dir }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function openSystemJson(file: string): OpenResult {
  let model: Model
  try {
    model = JSON.parse(readFileSync(file, "utf8")) as Model
  } catch (err) {
    return { ok: false, error: `Could not read ${file}: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = validate(model)
  if (!result.ok) {
    return { ok: false, error: result.errors.map(e => `[${e.code}] ${e.path}: ${e.message}`).join("\n") }
  }
  return { ok: true, model, diagnostics: [], source: file }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/importerService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/src/importerService.ts apps/desktop/test/importerService.test.ts
git commit -m "feat: importer service wrapping CdkImporter and model validation"
```

---

### Task 4: Recent-files store

**Files:**
- Create: `apps/desktop/src/recentStore.ts`
- Test: `apps/desktop/test/recentStore.test.ts`

**Interfaces:**
- Produces:
  - `addRecent(dir: string, entry: RecentEntry): void` — writes to `<dir>/recent.json`, dedupes by path, most-recent-first, caps at 8.
  - `listRecent(dir: string): RecentEntry[]` — reads the list; prunes entries whose `path` no longer exists.
  - (`dir` is the app's userData dir, injected so the test can use a temp dir.)

- [ ] **Step 1: Write the failing test**

`apps/desktop/test/recentStore.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && ./node_modules/.bin/vitest run test/recentStore.test.ts`
Expected: FAIL — cannot find module `../src/recentStore`.

- [ ] **Step 3: Write the store**

`apps/desktop/src/recentStore.ts`:
```ts
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
  const present = read(dir).filter(e => existsSync(e.path))
  if (present.length !== read(dir).length) {
    writeFileSync(file(dir), JSON.stringify(present, null, 2))
  }
  return present
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/recentStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/src/recentStore.ts apps/desktop/test/recentStore.test.ts
git commit -m "feat: recent-files store with dedupe, cap, and pruning"
```

---

### Task 5: Wire dialogs, menu, and IPC into main

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Test: `apps/desktop/test/handlers.test.ts`

**Interfaces:**
- Consumes: `importFolder`, `openSystemJson` (Task 3); `addRecent`, `listRecent` (Task 4).
- Produces: pure handler functions `handleImportFolder(dir)`, `handleOpenFile(file)`, exported from `main.ts` so they are unit-testable without launching Electron; plus the Electron menu + `ipcMain.handle` wiring (not unit-tested — covered by the Task 8 smoke).

- [ ] **Step 1: Write the failing test**

`apps/desktop/test/handlers.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { handleImportFolder } from "../src/handlers"

describe("handlers", () => {
  it("handleImportFolder imports and records the folder as recent", () => {
    const ud = mkdtempSync(join(tmpdir(), "ud-"))
    const proj = mkdtempSync(join(tmpdir(), "proj-"))
    writeFileSync(join(proj, "s.ts"), `
      import * as sqs from "aws-cdk-lib/aws-sqs"
      export class S { constructor() { const q = new sqs.Queue(this, "Q", { queueName: "q" }) } }
    `)
    const result = handleImportFolder(proj, ud)
    expect(result.ok).toBe(true)
    // recent list now contains the project folder
    const recentFile = JSON.parse(require("node:fs").readFileSync(join(ud, "recent.json"), "utf8"))
    expect(recentFile[0].path).toBe(proj)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && ./node_modules/.bin/vitest run test/handlers.test.ts`
Expected: FAIL — cannot find module `../src/handlers`.

- [ ] **Step 3: Extract testable handlers**

`apps/desktop/src/handlers.ts`:
```ts
import { basename } from "node:path"
import { importFolder, openSystemJson } from "./importerService"
import { addRecent } from "./recentStore"
import type { OpenResult } from "./ipc"

export function handleImportFolder(dir: string, userDataDir: string): OpenResult {
  const result = importFolder(dir)
  if (result.ok) addRecent(userDataDir, { path: dir, kind: "folder", label: basename(dir) })
  return result
}

export function handleOpenFile(file: string, userDataDir: string): OpenResult {
  const result = openSystemJson(file)
  if (result.ok) addRecent(userDataDir, { path: file, kind: "file", label: basename(file) })
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the menu + IPC in main.ts**

In `apps/desktop/src/main.ts`, add imports and IPC/menu wiring. Add at top:
```ts
import { app, BrowserWindow, Menu, dialog, ipcMain } from "electron"
import * as path from "node:path"
import { handleImportFolder, handleOpenFile } from "./handlers"
import { listRecent } from "./recentStore"
import { CHANNELS } from "./ipc"
```

After `createWindow` is defined and before `app.whenReady`, add the IPC handlers and a menu builder:
```ts
function userDataDir(): string {
  return app.getPath("userData")
}

function registerIpc(win: BrowserWindow) {
  ipcMain.handle(CHANNELS.importFolder, async () => {
    const picked = await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: "cancelled" }
    return handleImportFolder(picked.filePaths[0], userDataDir())
  })
  ipcMain.handle(CHANNELS.openFile, async () => {
    const picked = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "System model", extensions: ["json"] }],
    })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: "cancelled" }
    return handleOpenFile(picked.filePaths[0], userDataDir())
  })
  ipcMain.handle(CHANNELS.listRecent, () => listRecent(userDataDir()))
  ipcMain.handle(CHANNELS.openRecent, (_e, p: string) =>
    p.endsWith(".json") ? handleOpenFile(p, userDataDir()) : handleImportFolder(p, userDataDir()),
  )
}

function buildMenu(win: BrowserWindow) {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open CDK Folder…",
          accelerator: "CmdOrCtrl+O",
          click: () => win.webContents.send("menu:open-folder"),
        },
        {
          label: "Open .system.json…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => win.webContents.send("menu:open-file"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
```

Then change `createWindow` to call them after creating the window:
```ts
  registerIpc(win)
  buildMenu(win)
```

And forward menu clicks to the renderer (the renderer listens for `menu:open-folder`/`menu:open-file` and then calls the matching preload method). Extend the preload exposure in `preload.ts`:
```ts
import { contextBridge, ipcRenderer } from "electron"
import { CHANNELS } from "./ipc"

contextBridge.exposeInMainWorld("systemDiagram", {
  openFolder: () => ipcRenderer.invoke(CHANNELS.importFolder),
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  listRecent: () => ipcRenderer.invoke(CHANNELS.listRecent),
  openRecent: (p: string) => ipcRenderer.invoke(CHANNELS.openRecent, p),
  onMenu: (cb: (action: "open-folder" | "open-file") => void) => {
    ipcRenderer.on("menu:open-folder", () => cb("open-folder"))
    ipcRenderer.on("menu:open-file", () => cb("open-file"))
  },
})
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/desktop && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && echo "TSC: 0"`
Expected: TSC: 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/src/handlers.ts apps/desktop/src/main.ts apps/desktop/src/preload.ts apps/desktop/test/handlers.test.ts
git commit -m "feat: wire native dialogs, menu, and IPC handlers"
```

---

### Task 6: Renderer-side API type + store seam

**Files:**
- Create: `prototypes/elk-renderer/src/systemDiagramApi.ts`
- Modify: `prototypes/elk-renderer/src/store/visionStore.ts`
- Test: `prototypes/elk-renderer/src/store/visionStore.addModel.test.ts`

**Interfaces:**
- Produces:
  - `window.systemDiagram` typed via `SystemDiagramApi` (matches the preload shape).
  - `addVisionFromModel(state: StoreState, model: Model, label: string): StoreState` — appends a vision and makes it active.

- [ ] **Step 1: Write the failing test**

`prototypes/elk-renderer/src/store/visionStore.addModel.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototypes/elk-renderer && ./node_modules/.bin/vitest run src/store/visionStore.addModel.test.ts`
Expected: FAIL — `addVisionFromModel` not exported.

- [ ] **Step 3: Add the API type**

`prototypes/elk-renderer/src/systemDiagramApi.ts`:
```ts
import type { Model } from "./engine/types"

export interface Diagnostic {
  level: "info" | "warn"
  code: string
  message: string
  file?: string
  line?: number
}

export type OpenResult =
  | { ok: true; model: Model; diagnostics: Diagnostic[]; source: string }
  | { ok: false; error: string }

export interface RecentEntry {
  path: string
  kind: "folder" | "file"
  label: string
}

export interface SystemDiagramApi {
  openFolder(): Promise<OpenResult>
  openFile(): Promise<OpenResult>
  listRecent(): Promise<RecentEntry[]>
  openRecent(path: string): Promise<OpenResult>
  onMenu(cb: (action: "open-folder" | "open-file") => void): void
}

declare global {
  interface Window {
    systemDiagram: SystemDiagramApi
  }
}
```

- [ ] **Step 4: Add `addVisionFromModel` and remove the build-time seed**

In `prototypes/elk-renderer/src/store/visionStore.ts`:

Remove these lines at the top:
```ts
import { checkout } from "../fixtures/checkout"
import gatewayJson from "../../../../examples/github-app-gateway.system.json"

const gateway = gatewayJson as Model
```

Replace the `seed()` function body so it starts empty:
```ts
function seed(): { visions: VisionEntry[]; activeId: string } {
  return { visions: [], activeId: "" }
}
```

Add the new function (after `createVision`):
```ts
export function addVisionFromModel(state: StoreState, model: Model, label: string): StoreState {
  const id = `m-${state.visions.length}-${label.toLowerCase().replace(/\s+/g, "-")}`
  const order = state.visions.length === 0 ? 0 : Math.max(...state.visions.map(v => v.order)) + 1
  const color = PAPER_COLORS[state.visions.length % PAPER_COLORS.length]
  const vision: VisionEntry = { id, name: label, color, order, model, revision: 1 }
  return { visions: [...state.visions, vision], activeId: id }
}
```

(Note: `loadStore` calls `seed()` when storage is empty, so the app now starts with no vision until the user opens one. The `checkout` fixture file stays on disk for tests.)

- [ ] **Step 5: Run test + typecheck**

Run: `./node_modules/.bin/vitest run src/store/visionStore.addModel.test.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && echo "TSC: 0"`
Expected: PASS; TSC: 0. (If tsc errors on the removed `checkout`/`gateway` import being referenced elsewhere, grep for remaining uses and remove them — `seed` was the only consumer.)

- [ ] **Step 6: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add prototypes/elk-renderer/src/systemDiagramApi.ts prototypes/elk-renderer/src/store/visionStore.ts prototypes/elk-renderer/src/store/visionStore.addModel.test.ts
git commit -m "feat: add systemDiagram API type and addVisionFromModel store seam"
```

---

### Task 7: Empty state + Open wiring in App.tsx

**Files:**
- Modify: `prototypes/elk-renderer/src/App.tsx`
- Create: `prototypes/elk-renderer/src/ui/EmptyState.tsx`

**Interfaces:**
- Consumes: `window.systemDiagram` (Task 6 type), `addVisionFromModel` (Task 6).
- Produces: the wired UI — empty state with Open buttons; menu actions; diagnostics pill.

- [ ] **Step 1: Create the empty state component**

`prototypes/elk-renderer/src/ui/EmptyState.tsx`:
```tsx
interface EmptyStateProps {
  onOpenFolder: () => void
  onOpenFile: () => void
}

export function EmptyState({ onOpenFolder, onOpenFile }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", gap: 16, fontFamily: "Inter, sans-serif", color: "#57534E",
    }}>
      <div style={{ fontSize: 18, fontWeight: 600 }}>No system loaded</div>
      <div style={{ fontSize: 13 }}>Open a CDK folder to import and render its architecture.</div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button onClick={onOpenFolder} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Open CDK Folder…
        </button>
        <button onClick={onOpenFile} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Open .system.json…
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire App.tsx**

In `prototypes/elk-renderer/src/App.tsx`:

Add imports:
```ts
import { addVisionFromModel } from "./store/visionStore"
import { EmptyState } from "./ui/EmptyState"
import type { OpenResult } from "./systemDiagramApi"
```

Inside `App`, after the existing `useState`/`useMemo` for `store`, add an open handler and menu wiring:
```ts
  const handleOpenResult = useCallback((result: OpenResult, fallbackLabel: string) => {
    if (!result.ok) {
      setError(result.error)
      return
    }
    const label = result.model.system.name || fallbackLabel
    setStore(s => addVisionFromModel(s, result.model, label))
    if (result.diagnostics.length > 0) {
      setError(`${result.diagnostics.length} note(s) from import — see console`)
      // eslint-disable-next-line no-console
      console.table(result.diagnostics)
    }
  }, [])

  const openFolder = useCallback(async () => {
    const r = await window.systemDiagram.openFolder()
    handleOpenResult(r, "Imported system")
  }, [handleOpenResult])

  const openFile = useCallback(async () => {
    const r = await window.systemDiagram.openFile()
    handleOpenResult(r, "Loaded system")
  }, [handleOpenResult])

  useEffect(() => {
    window.systemDiagram.onMenu(action => {
      if (action === "open-folder") void openFolder()
      else void openFile()
    })
  }, [openFolder, openFile])
```

Then, in the render, when there is no `activeVision` (no model loaded), render the empty state instead of the graph area. Locate where the main graph/canvas is returned and wrap it:
```tsx
  if (!activeVision) {
    return <EmptyState onOpenFolder={openFolder} onOpenFile={openFile} />
  }
```
(Place this guard before the graph render, after the hooks. Keep all hooks above the early return so hook order is stable.)

- [ ] **Step 3: Build + typecheck the renderer**

Run: `cd prototypes/elk-renderer && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && npm run build && echo "OK"`
Expected: no type errors; build succeeds. (Fix any unused-import errors from the removed seed.)

- [ ] **Step 4: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add prototypes/elk-renderer/src/App.tsx prototypes/elk-renderer/src/ui/EmptyState.tsx
git commit -m "feat: empty state and Open wiring in the renderer"
```

---

### Task 8: End-to-end smoke + proof

**Files:**
- Create: `apps/desktop/screenshots/01-open-gateway.png`

**Interfaces:**
- Consumes: the whole app.

- [ ] **Step 1: Build everything**

Run:
```bash
cd /Users/eaugusto/system-diagram/prototypes/elk-renderer && npm run build
cd ../../apps/desktop && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
echo "renderer built + desktop typechecks OK"
```
Expected: renderer builds; desktop typechecks with no errors. (The desktop app is not compiled — it runs through tsx at launch.)

- [ ] **Step 2: Launch and drive the app**

Run: `cd apps/desktop && npx electron . &`
Expected: a window opens showing the empty state ("No system loaded").

Then exercise the Open flow. Because the native folder dialog is OS-driven and can't be scripted headlessly, drive it one of two ways:
- If the chrome-devtools / electron automation is available, trigger `window.systemDiagram.openRecent("/Users/eaugusto/codurance/github/github-app-gateway/infra/lib")` from the devtools console to bypass the native dialog and load the gateway directly.
- Otherwise, manually: File → Open CDK Folder… → pick `…/github-app-gateway/infra/lib`.

Confirm the gateway renders with AWS badges and LogGroup nesting (same as the web prototype's `15-` screenshot).

- [ ] **Step 3: Capture proof**

Screenshot the running app showing the rendered gateway; save to `apps/desktop/screenshots/01-open-gateway.png`. If the environment cannot open a desktop window, leave the app build verified and ask the user to capture it (per the precedent in earlier work).

- [ ] **Step 4: Commit + final verify**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/screenshots/01-open-gateway.png
git commit -m "test: end-to-end smoke of the desktop app opening the gateway"
# full suites
cd apps/desktop && ./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
cd ../../prototypes/elk-renderer && ./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: all tests pass, both typechecks clean.

---

## Self-Review

**Spec coverage:**
- Electron shell (main/preload/renderer) → Tasks 1, 5. ✓
- Native Open CDK Folder / Open .system.json dialogs → Task 5. ✓
- Main runs `CdkImporter.import` as a library → Task 3 (service), Task 5 (handler). ✓
- `OpenResult`/`RecentEntry`/`CHANNELS` shared types, no Node leaked → Task 2, preload in Tasks 1/5. ✓
- Recent files (dedupe, cap 8, prune) → Task 4. ✓
- Diagnostics surface → Task 7 (pill/console). ✓
- Renderer Electron-only, build-time seed removed, `addVisionFromModel` → Task 6. ✓
- Empty state → Task 7. ✓
- Error handling mapped to OpenResult, never raw exceptions → Tasks 3, 5. ✓
- `base: "./"` for Electron loadFile → Task 1 Step 6. ✓
- `npm start` runnable, packaging deferred → Task 1 manifest; no packaging tasks. ✓
- Engine/lens/layout/Graph unchanged → no task touches them. ✓
- Proof screenshot → Task 8. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows full code. Task 8 Step 2/3 depends on desktop-window availability and falls back to asking the user — the same honest pattern used in prior cycles.

**Type consistency:** `OpenResult` (Task 2) is the return type of `importFolder`/`openSystemJson` (Task 3), `handleImportFolder`/`handleOpenFile` (Task 5), and the renderer-side mirror in `systemDiagramApi.ts` (Task 6) — same `{ ok; model; diagnostics; source } | { ok; error }` shape. `RecentEntry` (Task 2) used in Task 4 and Task 6. `CHANNELS` keys (Task 2) match the preload `ipcRenderer.invoke` calls (Tasks 1, 5) and the `ipcMain.handle` registrations (Task 5). `addVisionFromModel(state, model, label): StoreState` (Task 6) called with that signature in Task 7. The preload `onMenu` callback signature (`"open-folder" | "open-file"`) matches `SystemDiagramApi.onMenu` (Task 6) and the App effect (Task 7).

**Note on a duplicated Diagnostic type:** `systemDiagramApi.ts` (Task 6, renderer side) redeclares `Diagnostic`/`OpenResult` rather than importing from `apps/desktop` or `packages/import`, because the renderer is a separate Vite build and shouldn't reach into the desktop package. This is intentional duplication across a process boundary (the IPC contract), not a DRY violation — the shapes are the wire format. Kept minimal and identical.
