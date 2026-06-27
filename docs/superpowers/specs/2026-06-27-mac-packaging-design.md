# Design — Package system-diagram as a macOS .app

**Status:** Approved · 2026-06-27
**Author:** Eduardo
**Relates to:** 2026-06-26-desktop-app-design.md (the Electron app this packages)

## Problem

The desktop app runs via `npm start` (`bootstrap.cjs → tsx → main.ts`, importing
the importer + engine from sibling source dirs). The user wants a real,
double-clickable macOS **`.app`** they can install — no terminal.

Packaging the tsx-at-runtime app as-is is fragile: a packaged `.app` cannot rely
on relative sibling-package paths or live TypeScript transpilation. So the app
must first be made self-contained.

## Approach

Two layers: **bundle** the main process into one self-contained JS file (esbuild),
then **box** it with electron-builder into an unsigned `.app` (+ `.dmg`).

Decisions (from brainstorming): **unsigned, local use** (you have a Developer ID
cert, but distribution/notarization is out of scope for v1 — run locally via
right-click→Open once). **Bundle the main process** ("actual application style")
rather than shipping tsx + sources.

## Architecture

### 1. Bundle the main process (esbuild)

```
esbuild apps/desktop/src/main.ts \
  --bundle --platform=node --format=cjs --external:electron \
  --outfile=apps/desktop/build/main.cjs
```

Inlines `CdkImporter`, the engine `validate`, and their deps (incl. ts-morph) into
one CJS file. The Electron entry becomes `build/main.cjs` directly — **no tsx, no
bootstrap, no sibling-path reliance at runtime.** `preload.cjs` is already plain
CJS and ships unchanged.

The packaged `main.cjs` loads the renderer from the app's bundled resources, so
the renderer-index path must resolve relative to the packaged location (see
"Renderer path" below), not the dev-time `../../../prototypes/...` path.

### 2. Box it (electron-builder)

`apps/desktop/package.json` gains a `build` block:
- `appId`, `productName: "System Diagram"`
- `directories.output: dist-app`
- `files`: `build/**`, `preload.cjs`, plus the renderer `dist/` copied in via
  `extraResources` (or a `files` glob pointing at the built renderer)
- `mac.target`: `["dir", "dmg"]`, `mac.icon`: the generated `.icns`
- unsigned: `mac.identity: null`

## Renderer path (dev vs packaged)

`main.ts` currently resolves the renderer at
`../../../prototypes/elk-renderer/dist/index.html`. For the packaged app, the
renderer build is copied into the app resources. `main.ts` chooses the path:
- `app.isPackaged === false` → dev path (`../../../prototypes/elk-renderer/dist`).
- `app.isPackaged === true` → `process.resourcesPath` + the bundled renderer dir.

The renderer `dist/` is placed under `extraResources` so it lands at a known path
inside the `.app` (`Contents/Resources/renderer/`).

## Icon

No icon exists. v1 generates a simple `.icns` — a dark rounded-square mark
matching the in-app logo — via `iconutil` from a generated PNG set, committed at
`apps/desktop/build-assets/icon.icns`. Avoids the default Electron icon.

## Build flow & deliverable

```
npm run dist
  → build:renderer   (vite build, base:./)
  → build:main       (esbuild → build/main.cjs)
  → electron-builder --mac dir,dmg
  → dist-app/mac/System Diagram.app   (+ System Diagram-<version>.dmg)
```

Run: double-click `System Diagram.app`; first launch right-click → Open (unsigned,
clears Gatekeeper once).

## Testing

- **Bundle smoke**: after `build:main`, assert `build/main.cjs` exists and contains
  a known importer symbol (e.g. the `add_component` patch kind or `CdkImporter`),
  proving the importer was inlined, not lost.
- **Packaged-app proof (the real test)**: launch the packaged `.app` (NOT
  `npm start`), open the gateway folder, confirm 32 components render with LogGroup
  nesting — same CDP/screenshot proof, against the bundle. This is what proves the
  packaging actually works.

## Risks (flagged honestly)

- **ts-morph bundling.** ts-morph embeds the TypeScript compiler and may use
  dynamic requires that esbuild can't statically inline. Mitigation: the plan
  verifies the *packaged* app can import a folder (not just launch). If bundling
  chokes, fall back to `--external:typescript` (and/or `--external:ts-morph`) and
  let electron-builder ship those from `node_modules`. Do not claim success until
  a folder import works in the packaged app.
- **First-launch Gatekeeper.** Unsigned → the user must right-click → Open once.
  Documented, accepted for local use.

## Out of scope (future)

- Code signing + Apple notarization (cert exists; deferred to a distribution cycle).
- Auto-update (electron-updater).
- Windows/Linux targets.
- App Store packaging.
