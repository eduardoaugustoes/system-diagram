// Electron launches this CJS file. It registers tsx so the rest of the app
// (main.ts + its cross-package .ts imports of the importer/engine) runs as TS.
require("tsx/cjs")
require("./src/main.ts")
