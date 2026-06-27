# macOS Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a double-clickable, unsigned macOS `System Diagram.app` from the existing Electron app, by bundling the main process with esbuild and boxing it with electron-builder.

**Architecture:** esbuild bundles `main.ts` + its importer/engine imports into one self-contained `build/main.cjs` (no tsx, no sibling-path reliance at runtime; ts-morph inlines fine — verified). `main.ts` chooses the renderer path by `app.isPackaged`. electron-builder packages `build/main.cjs` + `preload.cjs` + the renderer `dist/` into an unsigned `.app` + `.dmg`.

**Tech Stack:** esbuild, electron-builder, Electron, the existing desktop app + renderer.

## Global Constraints

- Branch: `feat/mac-packaging` (already created).
- Unsigned (`mac.identity: null`). Local use; first launch is right-click → Open.
- The main process is **bundled** (esbuild), NOT shipped as tsx + sources. ts-morph bundles inline with no externals (verified: bundled importer returns 32 components on the gateway).
- The packaged app must actually IMPORT a folder, not just launch — that is the success bar (the ts-morph-in-bundle risk).
- Run commands from the package dir (cwd resets between shells). Use `./node_modules/.bin/<tool>`.
- Commit after every task. Conventional commits. NO AI attribution.
- productName: "System Diagram". output dir: `dist-app`. Targets: `dir` + `dmg`.

---

## File Structure

- `apps/desktop/package.json` — MODIFY: add esbuild + electron-builder devDeps, `build:main`/`dist` scripts, and the `build` (electron-builder) config block.
- `apps/desktop/src/main.ts` — MODIFY: renderer path chooses dev vs packaged via `app.isPackaged`.
- `apps/desktop/build-assets/icon.icns` — CREATE: generated app icon.
- `apps/desktop/test/bundle.test.ts` — CREATE: asserts the esbuild bundle exists and inlined the importer.
- `apps/desktop/.gitignore` — CREATE: ignore `build/`, `dist-app/`.

---

### Task 1: esbuild bundle of the main process

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/test/bundle.test.ts`
- Create: `apps/desktop/.gitignore`

**Interfaces:**
- Produces: `npm run build:main` → `apps/desktop/build/main.cjs`, a self-contained CJS bundle with the importer + engine inlined.

- [ ] **Step 1: Add esbuild dep + build:main script**

In `apps/desktop/package.json`, add to `devDependencies`:
```json
    "esbuild": "^0.24.0",
```
And add to `scripts`:
```json
    "build:main": "esbuild src/main.ts --bundle --platform=node --format=cjs --external:electron --outfile=build/main.cjs",
```

- [ ] **Step 2: Create .gitignore for build artifacts**

`apps/desktop/.gitignore`:
```
build/
dist-app/
```

- [ ] **Step 3: Write the failing test**

`apps/desktop/test/bundle.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const bundle = join(__dirname, "..", "build", "main.cjs")

describe("main bundle", () => {
  it("exists after build:main", () => {
    expect(existsSync(bundle)).toBe(true)
  })
  it("inlined the importer (not lost to a dynamic require)", () => {
    const src = readFileSync(bundle, "utf8")
    // a known importer symbol proves CdkImporter was bundled, not externalized
    expect(src.includes("add_component")).toBe(true)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/desktop && npm install && ./node_modules/.bin/vitest run test/bundle.test.ts`
Expected: FAIL — `build/main.cjs` does not exist yet.

- [ ] **Step 5: Build the bundle**

Run: `npm run build:main`
Expected: esbuild writes `build/main.cjs` (~12MB; the size is ts-morph's embedded TS compiler — expected). A warning about bundle size is fine.

- [ ] **Step 6: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/bundle.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/package.json apps/desktop/.gitignore apps/desktop/test/bundle.test.ts apps/desktop/package-lock.json
git commit -m "feat: bundle the Electron main process with esbuild"
```

---

### Task 2: Renderer path resolves for packaged app

**Files:**
- Modify: `apps/desktop/src/main.ts:64-68`

**Interfaces:**
- Consumes: `app.isPackaged` (electron).
- Produces: `main.cjs` loads the renderer from the dev path in development and from `process.resourcesPath/renderer/index.html` when packaged.

- [ ] **Step 1: Update the renderer-path logic**

In `apps/desktop/src/main.ts`, replace the existing rendererIndex block:
```ts
  const rendererIndex = path.resolve(
    __dirname,
    "../../../prototypes/elk-renderer/dist/index.html",
  )
  win.loadFile(rendererIndex)
```
with:
```ts
  const rendererIndex = app.isPackaged
    ? path.join(process.resourcesPath, "renderer", "index.html")
    : path.resolve(__dirname, "../../../prototypes/elk-renderer/dist/index.html")
  win.loadFile(rendererIndex)
```

- [ ] **Step 2: Re-bundle and confirm it still builds + dev still loads**

Run:
```bash
cd apps/desktop && npm run build:main
./node_modules/.bin/tsc --noEmit -p tsconfig.json && echo "TSC: 0"
```
Expected: bundle rebuilds; TSC: 0. (`process.resourcesPath` is a Node/Electron global; `@types/node` covers it.)

- [ ] **Step 3: Verify dev mode still works (bundled main, dev renderer path)**

Run:
```bash
cd ../../prototypes/elk-renderer && npm run build
cd ../../apps/desktop && npx electron build/main.cjs --remote-debugging-port=9223 &
until curl -s http://localhost:9223/json/version >/dev/null 2>&1; do sleep 0.5; done
sleep 2
curl -s http://localhost:9223/json | grep -o '"url":"file[^"]*"' | head -1
pkill -f "electron" 2>/dev/null
```
Expected: a page target whose URL is the renderer `index.html` (dev path), proving the bundled main loads the renderer in dev. (If the env can't open a window, confirm `npx electron build/main.cjs` starts without a module error instead.)

- [ ] **Step 4: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/src/main.ts
git commit -m "feat: resolve renderer path for packaged vs dev"
```

---

### Task 3: App icon

**Files:**
- Create: `apps/desktop/build-assets/icon.icns`
- Create: `apps/desktop/build-assets/make-icon.sh` (the generator, for reproducibility)

**Interfaces:**
- Produces: `build-assets/icon.icns` — a dark rounded-square mark.

- [ ] **Step 1: Write the icon generator script**

`apps/desktop/build-assets/make-icon.sh`:
```bash
#!/usr/bin/env bash
# Generates icon.icns: a dark rounded square (matches the in-app logo mark).
set -euo pipefail
cd "$(dirname "$0")"
ICONSET="icon.iconset"
rm -rf "$ICONSET" && mkdir "$ICONSET"

# Base 1024px PNG via Swift/CoreGraphics (no external deps on macOS).
cat > /tmp/mkicon.swift <<'SWIFT'
import AppKit
let size = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
NSColor(red: 0.96, green: 0.96, blue: 0.95, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
let inset: CGFloat = 200
let rect = NSRect(x: inset, y: inset, width: CGFloat(size)-2*inset, height: CGFloat(size)-2*inset)
let path = NSBezierPath(roundedRect: rect, xRadius: 90, yRadius: 90)
NSColor(red: 0.11, green: 0.10, blue: 0.09, alpha: 1).setFill()
path.fill()
img.unlockFocus()
let tiff = img.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: "/tmp/icon-1024.png"))
SWIFT
swift /tmp/mkicon.swift

for s in 16 32 64 128 256 512 1024; do
  sips -z $s $s /tmp/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
done
# retina variants iconutil expects
cp "$ICONSET/icon_32x32.png"   "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png"   "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png" "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png" "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o icon.icns
rm -rf "$ICONSET" /tmp/mkicon.swift /tmp/icon-1024.png
echo "wrote icon.icns"
```

- [ ] **Step 2: Run it**

Run: `cd apps/desktop/build-assets && bash make-icon.sh`
Expected: prints `wrote icon.icns`; `icon.icns` exists.
(If `swift` is unavailable, fall back: create a 1024px PNG any way available — even a solid dark rounded square via `sips`/an existing image — then run the `sips`+`iconutil` steps. The icon is cosmetic; do not block packaging on it — if no icon can be produced, drop `mac.icon` from the config and proceed.)

- [ ] **Step 3: Verify it's a real icns**

Run: `file icon.icns`
Expected: output mentions `Mac OS X icon` / `icns`.

- [ ] **Step 4: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/build-assets/make-icon.sh apps/desktop/build-assets/icon.icns
git commit -m "feat: generate app icon"
```

---

### Task 4: electron-builder config + dist script

**Files:**
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Produces: `npm run dist` → `apps/desktop/dist-app/mac*/System Diagram.app` (+ `.dmg`).

- [ ] **Step 1: Add electron-builder dep + dist script**

In `apps/desktop/package.json`, add to `devDependencies`:
```json
    "electron-builder": "^25.1.0",
```
Add to `scripts`:
```json
    "dist": "npm run build:renderer && npm run build:main && electron-builder --mac",
```

- [ ] **Step 2: Add the build config block**

In `apps/desktop/package.json`, add a top-level `build` key:
```json
  "build": {
    "appId": "io.systemdiagram.desktop",
    "productName": "System Diagram",
    "directories": { "output": "dist-app" },
    "files": [
      "build/main.cjs",
      "src/preload.cjs",
      "package.json"
    ],
    "extraResources": [
      { "from": "../../prototypes/elk-renderer/dist", "to": "renderer" }
    ],
    "mac": {
      "target": ["dir", "dmg"],
      "icon": "build-assets/icon.icns",
      "identity": null
    }
  }
```

(electron-builder reads `main` from package.json — currently `bootstrap.cjs`. Change it: the packaged entry must be the bundle.)

- [ ] **Step 3: Point the Electron entry at the bundle**

In `apps/desktop/package.json`, change:
```json
  "main": "bootstrap.cjs",
```
to:
```json
  "main": "build/main.cjs",
```

(`bootstrap.cjs` was the tsx launcher for dev; the bundle no longer needs it. Dev now runs `electron build/main.cjs` after `build:main`. Update the `start` script accordingly in the next step.)

- [ ] **Step 4: Update the start script for the bundled entry**

Change the `start` script to build the main bundle too:
```json
    "start": "npm run build:renderer && npm run build:main && electron .",
```
(`electron .` reads `main` → `build/main.cjs`.)

- [ ] **Step 5: Install + run the packager**

Run:
```bash
cd apps/desktop && npm install
npm run dist 2>&1 | tail -20
```
Expected: electron-builder produces `dist-app/mac-*/System Diagram.app` and a `.dmg`. (First run downloads electron-builder's tooling; allow a minute.)

- [ ] **Step 6: Confirm the .app exists**

Run: `ls -la "dist-app"/*/*.app 2>/dev/null || find dist-app -maxdepth 2 -name "*.app"`
Expected: the path to `System Diagram.app` prints.

- [ ] **Step 7: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/package.json apps/desktop/package-lock.json
git commit -m "feat: package the app with electron-builder (unsigned .app + dmg)"
```

---

### Task 5: Prove the packaged .app imports a folder

**Files:**
- Create: `apps/desktop/screenshots/02-packaged-app.png`

**Interfaces:**
- Consumes: the packaged `System Diagram.app`.

- [ ] **Step 1: Launch the packaged app with remote debugging**

Run:
```bash
cd apps/desktop
APP=$(find dist-app -maxdepth 2 -name "*.app" | head -1)
"$APP/Contents/MacOS/System Diagram" --remote-debugging-port=9224 &
until curl -s http://localhost:9224/json/version >/dev/null 2>&1; do sleep 0.5; done
sleep 2
echo "packaged app running"
```
Expected: the packaged binary launches and exposes the debug port. (This runs the binary inside the `.app` directly — the same as double-clicking, but scriptable.)

- [ ] **Step 2: Drive it via CDP — import the gateway folder, confirm render**

Run this Node script (uses the built-in WebSocket; no deps):
```bash
cat > /tmp/pkg-cdp.mjs <<'EOF'
const list = await (await fetch("http://localhost:9224/json")).json()
const ws = new WebSocket(list.find(p=>p.type==="page").webSocketDebuggerUrl)
let id=0; const send=(m,p={})=>new Promise(r=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener("message",h);r(x.result)}};ws.addEventListener("message",h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
await new Promise(r=>ws.addEventListener("open",r)); await send("Runtime.enable")
const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true}))?.result?.value
console.log("API present:", await ev(`typeof window.systemDiagram === "object"`))
const lib="/Users/eaugusto/codurance/github/github-app-gateway/infra/lib"
console.log("import:", JSON.stringify(await ev(`window.systemDiagram.openRecent(${JSON.stringify(lib)}).then(r=>({ok:r.ok,comps:r.ok?r.model.components.length:r.error}))`)))
await new Promise(r=>setTimeout(r,2500))
console.log("rendered:", JSON.stringify(await ev(`(()=>{const t=[...document.querySelectorAll('svg text')].map(x=>x.textContent.trim());return{lambda:t.includes('handoffLambda'),log:t.includes('handoffLogGroup')}})()`)))
ws.close()
EOF
node /tmp/pkg-cdp.mjs
```
Expected: `API present: true`; `import: {"ok":true,"comps":32}`; `rendered: {"lambda":true,"log":true}`. THIS is the success bar — ts-morph works inside the packaged bundle.

- [ ] **Step 3: Capture proof + clean up**

```bash
cat > /tmp/pkg-shot.mjs <<'EOF'
import { writeFileSync } from "node:fs"
const list = await (await fetch("http://localhost:9224/json")).json()
const ws = new WebSocket(list.find(p=>p.type==="page").webSocketDebuggerUrl)
let id=0; const send=(m,p={})=>new Promise(r=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener("message",h);r(x.result)}};ws.addEventListener("message",h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
await new Promise(r=>ws.addEventListener("open",r))
const r=await send("Page.captureScreenshot",{format:"png"})
writeFileSync("screenshots/02-packaged-app.png", Buffer.from(r.data,"base64"))
console.log("saved"); ws.close()
EOF
node /tmp/pkg-shot.mjs
pkill -f "System Diagram" 2>/dev/null; rm -f /tmp/pkg-cdp.mjs /tmp/pkg-shot.mjs
```
Expected: `screenshots/02-packaged-app.png` saved showing the rendered gateway.

- [ ] **Step 4: Commit + final verify**

```bash
cd /Users/eaugusto/system-diagram
git add apps/desktop/screenshots/02-packaged-app.png
git commit -m "test: prove packaged .app imports and renders the gateway"
cd apps/desktop && ./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: all tests pass, TSC clean.

---

## Self-Review

**Spec coverage:**
- esbuild bundle of main + importer/engine inlined → Task 1. ✓
- Renderer path dev vs packaged (`app.isPackaged`) → Task 2. ✓
- Generated `.icns` icon → Task 3. ✓
- electron-builder config, unsigned, dir+dmg, output dist-app, productName → Task 4. ✓
- `npm run dist` build flow → Task 4. ✓
- Packaged-app proof (imports a folder, not just launches) → Task 5. ✓
- ts-morph bundling risk → de-risked pre-plan (bundled importer returned 32 comps) AND re-verified inside the packaged app in Task 5. ✓
- Entry point change (bootstrap.cjs → build/main.cjs) → Task 4 Steps 3-4. ✓
- build/ and dist-app/ gitignored → Task 1 Step 2. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows full code. The icon task has an explicit fallback (drop `mac.icon` if no icon can be produced) rather than a vague "handle it". Task 2/5 window-dependent steps have headless fallbacks, consistent with prior cycles.

**Type consistency:** No new cross-task types — this is config + build. The `main` entry is `build/main.cjs` consistently in Task 4 Steps 2-4. The debug ports differ on purpose (9223 dev check in Task 2, 9224 packaged in Task 5) to avoid colliding with a stray 9222 from earlier work. `window.systemDiagram` API used in Task 5 matches the shape shipped in the desktop-app cycle.

**Note — the `bootstrap.cjs` file:** after Task 4, `bootstrap.cjs` is no longer the entry (the bundle is). It is left in the repo (harmless, documents the dev-era approach) rather than deleted, to keep the diff focused on packaging. The `start` script now runs the bundled entry, so dev and packaged use the same `main.cjs` path — one fewer divergence.
