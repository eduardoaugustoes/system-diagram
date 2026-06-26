# Design — Electron desktop app for system-diagram

**Status:** Approved · 2026-06-26
**Author:** Eduardo
**Relates to:** 2026-06-26-cdk-importer-design.md, 2026-06-26-nested-containment-design.md
**Reference:** `/Users/eaugusto/dayone.ai/navlens` (the Electron app this emulates)

## Problem

Today the project is two halves that don't talk:

- **`prototypes/elk-renderer`** — a Vite/React web SPA that can only render models
  **baked in at build time** (imported in `visionStore.ts`).
- **`packages/import`** — a Node/ts-morph CLI that produces those models.

So "load a CDK stack" means: run the CLI by hand, then edit `visionStore.ts` to
import the generated JSON. The user wants an **application** (like navlens — an
Electron desktop app) where you **pick a CDK folder via the OS and it loads**,
no source editing.

The browser can't bridge this gap itself: ts-morph needs Node + filesystem, which
a browser SPA lacks. An Electron main process has both — and a native folder
dialog. That is why the app shape is Electron.

## Approach

A new package **`apps/desktop`**: a thin Electron shell around the **existing,
unchanged** renderer and importer. The importer becomes a **library** the main
process calls (it already exports `CdkImporter.import()`); the renderer gains one
seam to **receive** a model from the shell instead of only build-time imports.

v1 scope: **open a CDK folder → import → render**, plus open a `.system.json`
directly, plus recent files. Runnable via `npm start`. **Packaging (.app /
installer) is deferred** — out of v1.

### Rejected alternatives

- **Stay a web app, drag-drop `.system.json` only** — doesn't achieve "pick a CDK
  folder and it loads"; importer stays a manual CLI step.
- **Web app + ts-morph in-browser via File System Access API** — avoids desktop
  packaging but ts-morph in the browser is heavy and fragile; browser-only.
- **Copy all of navlens (Postgres, capture, watcher, auto-update)** — irrelevant
  to a diagram viewer; massive scope. v1 takes only the Electron shell shape.

## Architecture

```
apps/desktop
  main process (Node)            src/main.ts
    - app lifecycle, BrowserWindow creation
    - native menu: File → Open CDK Folder… / Open .system.json… / Recent
    - native dialogs (dialog.showOpenDialog)
    - runs @system-diagram/import (CdkImporter.import) on a picked folder
    - reads .system.json files; manages a small recent-files list
    - IPC handlers: "import:folder", "open:file", "recent:list"
  preload                        src/preload.ts
    - contextBridge exposes a typed, minimal API to the renderer:
        window.systemDiagram = {
          openFolder(): Promise<OpenResult>
          openFile(): Promise<OpenResult>
          listRecent(): Promise<RecentEntry[]>
          openRecent(path): Promise<OpenResult>
        }
    - NO raw Node / fs / ipcRenderer leaked to the renderer
  renderer  (existing prototypes/elk-renderer, ~unchanged)
    - draws the Model (ELK + SVG, AWS badges, LogGroup nesting — all current)
    - empty state + "Open" entry point that calls window.systemDiagram.*
    - the build is loaded by the main process (loadFile on the Vite build, or
      loadURL on the dev server in development)

OpenResult =
  | { ok: true; model: Model; diagnostics: Diagnostic[]; source: string }
  | { ok: false; error: string }
RecentEntry = { path: string; kind: "folder" | "file"; label: string }
```

The engine, lens, ELK layout, `Graph.tsx`, nesting, styleTable/icons are all
**unchanged**. The importer is unchanged except being consumed as a library
(its `CdkImporter` export already supports this).

## Data flow (the Open loop)

```
File → Open CDK Folder…
  → main: dialog.showOpenDialog({ properties: ["openDirectory"] })
  → main: tsFiles(dir) → CdkImporter.import(files, { systemId, systemName })
  → main: { ok:true, model, diagnostics, source } back over IPC
  → preload resolves window.systemDiagram.openFolder()
  → renderer: hand the model to the store (a new addVisionFromModel),
    set it active → existing layoutModel + Graph render it
  → renderer: show a "N notes" affordance from diagnostics

File → Open .system.json…
  → main: dialog (openFile, filter *.system.json) → read + JSON.parse
  → main: engine.validate(model); ok → return; invalid → { ok:false, error }
  → renderer: same render path

Recent
  → main keeps last ~8 opened folders/files in userData/recent.json
  → openRecent(path) re-runs the matching folder-import or file-open
```

## Components / responsibilities

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/main.ts` | window + menu + dialogs + IPC wiring | electron, importer, engine, fs |
| `src/importerService.ts` | wrap `CdkImporter.import` + file-open + validate into `OpenResult` | importer, engine |
| `src/recentStore.ts` | read/write the recent-files list in userData | fs |
| `src/preload.ts` | typed contextBridge API | electron |
| `src/ipc.ts` | shared channel names + payload types (imported by main + preload) | — |
| renderer: empty state + Open trigger | call the preload API, feed model to store | (renderer) |
| renderer: `addVisionFromModel` in `visionStore.ts` | accept a Model from the shell, add as active vision | engine types |

## Renderer changes (small, additive)

1. `visionStore.ts`: add `addVisionFromModel(state, model, label): StoreState` that
   appends a vision and makes it active. The build-time gateway/checkout seed
   stays as a fallback for `npm run dev` outside Electron.
2. `App.tsx`: detect `window.systemDiagram` (present only under Electron); when
   present, render an "Open a CDK folder to begin" affordance and wire the Open
   actions to the preload API + `addVisionFromModel`. When absent (plain web dev),
   behave exactly as today.
3. A small diagnostics surface (a "N notes" pill that lists the `Diagnostic[]`).

No changes to engine, lens, layout, Graph, styleTable, icons.

## Error handling

- No `.ts` files in the picked folder → `{ ok:false, error: "No .ts files found…" }`
  → renderer toast/dialog. (Distinct from importer diagnostics, which are notes.)
- Importer throws (invalid model fails `validate`) → caught in `importerService`,
  returned as `{ ok:false, error }`.
- `.system.json` that fails `engine.validate` → `{ ok:false, error }` with the
  validation messages.
- A recent path that no longer exists → drop it from the list, report once.
- The renderer never sees raw exceptions; the main process maps everything to
  `OpenResult`.

## Testing

- **`importerService` unit test** — given a temp CDK dir, returns
  `{ ok:true, model, diagnostics }` with the expected component count; given an
  empty dir, returns `{ ok:false, error }`; given a `.system.json` that fails
  validation, returns `{ ok:false }`.
- **`recentStore` unit test** — add/list/dedupe/cap-at-8, and a missing-path is
  pruned on read.
- **IPC contract test** — the channel names + payload types in `ipc.ts` match
  what preload exposes (typed; a compile check + a small unit test that the
  handler names line up).
- **Manual smoke (the proof)** — `npm start`, File → Open CDK Folder…, pick the
  gateway `infra/lib`, confirm it renders with AWS badges + LogGroup nesting; a
  screenshot saved as proof.

## Deliverable

- `cd apps/desktop && npm start` launches the Electron app (dev: main loads the
  Vite dev server; or loads the renderer's built `dist/`).
- A native File menu with Open CDK Folder…, Open .system.json…, and Recent.
- Picking the gateway folder renders it — no source editing.

## Out of scope (future)

- Packaging: `.app` / installer / notarization / `electron-updater` (navlens has
  these; defer until the app is worth distributing).
- Watching a folder for changes / live reload on CDK edits.
- The other navlens subsystems (Postgres, screen capture, watcher).
- In-app editing of the model (renderer stays read-only, per POC 0020).
- Multi-window / tabs for several systems at once (the vision strip already lets
  you switch among loaded models in one window).
