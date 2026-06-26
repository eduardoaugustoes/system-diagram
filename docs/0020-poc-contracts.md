# POC 0020 — Contracts for the typed-system-model POC

**Status:** v1.2 · Locked for M1 · 2026-05-19
**Scope:** Standalone POC. Single source of truth the five areas (schema/engine, ops/MCP, renderer, lens, persistence) build against.

## What this POC is

A typed-model-as-architecture-lens POC, built standalone. Not coupled to any host product. The output is a yes/no/by-how-much answer to one question:

> **Does a typed system model give a structural lens (Blast Radius) signal that vector-only retrieval over the same content can't?**

If yes, the design and contracts here become a reusable engine that any host (a planning tool, an IDE plugin, a CI check) can adopt. If no, we report that honestly and stop.

## Repo + package layout

- Repo: `/Users/eaugusto/system-diagram/`
- Packages:
  - `@system-diagram/engine` — pure core. JSON-in/JSON-out. No I/O. Browser-safe. `"sideEffects": false` in package.json.
  - `@system-diagram/engine/bus` — sibling subpath. Pub/sub. Imports types from the core; the core never imports from the bus.
  - `@system-diagram/persistence` — Node-only. Filesystem reads/writes. Calls engine `validate`.
  - `@system-diagram/ops` — MCP server. Adapts MCP tool inputs → engine `Patch` → persistence → bus.
  - `@system-diagram/lens-blast-radius` — single lens implementation. Pure functions over `Model`.
  - `@system-diagram/renderer` — standalone web view (Vite + React + ELK) and a CLI SVG export. No SPA host. No editing.
- File extension: `.system.json`. Default path: `<workspace>/systems/<modelId>.system.json`. Persistence accepts any path; the convention is for tooling.

## Schema (v1)

```
SchemaVersion = 1                        // envelope only

NodeId    = string
GlobalId  = string                       // optional cross-model identity (see §Cross-model identity)
Tag       = string
JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

Owner      = { id: string; name: string; contact?: string }
Capability = { id: string; name: string; description?: string; globalId?: GlobalId }

Component = {
  id: NodeId
  kind: "service" | "datastore" | "queue" | "external" | "ui" | "job"
  name: string
  description?: string                   // free-text; hybrid-retrieval target
  globalId?: GlobalId                    // cross-model identity (optional)
  ownerId?: Owner["id"]
  capabilityIds: Capability["id"][]
  tags: Tag[]
  metadata: Record<string, JsonValue>
}

Connection = {
  id: NodeId
  fromId: Component["id"]
  toId:   Component["id"]
  kind: "sync-call" | "async-event" | "data-read" | "data-write" | "deploys-on" | "depends-on"
  criticality: "hard" | "soft"           // REQUIRED — lens load-bearing
  optional: boolean                      // REQUIRED — lens load-bearing
  capabilityId?: Capability["id"]
  tags: Tag[]
  description?: string                   // free-text; hybrid-retrieval target
}

System = {
  id: NodeId
  name: string
  description?: string
}

Model = {                                // NO schemaVersion field here
  system: System
  components: Component[]
  connections: Connection[]
  capabilities: Capability[]
  owners: Owner[]
}

Envelope = {                             // persistence-owned
  schemaVersion: 1                       // format version; bumps only on migration
  modelId: string
  revision: number                       // concurrency token; bumps every successful write
  model: Model
}
```

### Field rationale (load-bearing only)

- **`Connection.criticality`** and **`Connection.optional`** are required because without them Blast Radius collapses to plain reachability — which vector retrieval already approximates. They are the lens's single biggest source of differentiating signal.
- **`description`** on Components, Connections, and Systems exists so the hybrid-retrieval evaluation has a free-text surface to vectorize against. Without it, "typed vs. vector" is measuring two things on different content.
- **`globalId`** on Components and Capabilities enables cross-model queries ("which systems use this capability?"). Optional; if absent, identity is intra-model only.

### Component-kind shape table (renderer-authoritative)

| `kind` | shape | typical role |
|---|---|---|
| `service` | rounded rect | running process / app |
| `datastore` | cylinder | DB, KV, blob store |
| `queue` | parallelogram | broker, topic, stream |
| `external` | rect, dashed border | third-party system |
| `ui` | rounded rect, light fill | browser/mobile client |
| `job` | hexagon | scheduled task, batch |

### Connection-kind style table (renderer-authoritative)

| `kind` | stroke | direction semantic |
|---|---|---|
| `sync-call` | solid | A calls B and waits |
| `async-event` | dashed | A publishes; B may consume |
| `data-read` | dotted thin | A reads from B |
| `data-write` | dotted thick | A writes to B |
| `deploys-on` | double line | A runs on/in B |
| `depends-on` | solid muted | logical/compile-time dependency |

## Engine API

```
// === @system-diagram/engine — pure core, zero side effects ===

load(json: unknown): { ok: true; model: Model } | { ok: false; errors: ValidationError[] }
validate(model: Model): ValidationResult
serialize(model: Model): unknown
applyPatch(model: Model, patch: Patch): { ok: true; model: Model; diff: Diff } | { ok: false; errors: ValidationError[] }

// Read primitives — all take `model` first
getComponent(model: Model, id: NodeId): Component | undefined
listComponents(model: Model, filter?): Component[]
listConnections(model: Model, filter?): Connection[]
neighbors(model: Model, id: NodeId, direction: "in"|"out"|"both"): Component[]
traverse(model: Model, startId: NodeId, direction, opts?: { maxDepth?; edgeKinds? }): Component[]
findByCapability(model: Model, capabilityId): Component[]
getOutgoingConnections(model: Model, id: NodeId): Connection[]
getIncomingConnections(model: Model, id: NodeId): Connection[]

// === @system-diagram/engine/bus — pub/sub, sibling subpath, infallible publish ===

subscribe(modelId: string, listener: (model: Model, diff: Diff) => void): Unsubscribe
publish(modelId: string, model: Model, diff: Diff): void
// publish wraps each listener call in try/catch; logs and continues on listener throw.
// Never throws to caller. Ops calls it unconditionally after writeAtomic succeeds.

ENGINE_SCHEMA_VERSION = 1                // exported constant
```

### Versioning

- `schemaVersion` is integer, envelope-owned. Engine's `Model` does not carry it.
- On load: equal → proceed; lower → dispatch to registered migrator (empty for POC); higher → reject with `VERSION_MISMATCH`.
- After migration, `revision` resets to `1` (migrated file is a fresh artifact).

### Validation error shape

```
ValidationError = {
  code: "SCHEMA" | "REF" | "DUP_ID" | "CYCLE" | "ORPHAN" | "VERSION_MISMATCH" | "MISSING_REQUIRED"
  path: string                            // JSON pointer
  message: string
  nodeId?: NodeId
}
ValidationResult = { ok: boolean; errors: ValidationError[] }
```

## Patch union (engine-owned)

```
AddComponent     { kind: "add_component", component: Component }
RemoveComponent  { kind: "remove_component", componentId: NodeId, cascade: boolean }
AddConnection    { kind: "add_connection", connection: Connection }
RemoveConnection { kind: "remove_connection", connectionId: NodeId }
SetProperty      { kind: "set_property", target: { entity: "component"|"connection", id: NodeId }, key: string, value: JsonValue }
Rename           { kind: "rename", target: { entity: "component"|"connection", id: NodeId }, newName: string }
```

`applyPatch` is pure: returns a new `Model` plus a `Diff`. Engine re-runs `validate` post-patch; invalid patches reject atomically.

```
Diff = { added: Ref[]; removed: Ref[]; changed: Ref[] }
Ref  = { entity: "component"|"connection"; id: NodeId }
```

## MCP tool surface

All tools return `{ ok: true; revision: number; diff?: Diff; ... } | ErrorShape`.

```
ErrorShape = {
  ok: false
  code: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "STALE_VERSION" | "REFERENTIAL_INTEGRITY" | "UNKNOWN_TYPE" | "UNKNOWN_KEY"
  message: string
  path?: string
  offendingOp?: OpRef
  revision: number
}
```

| tool | input |
|---|---|
| `system_model.add_component` | `{ modelId, componentId, kind, name, properties? }` |
| `system_model.remove_component` | `{ modelId, componentId, cascade?: boolean }` |
| `system_model.add_connection` | `{ modelId, connectionId, from, to, kind, criticality, optional, properties? }` |
| `system_model.remove_connection` | `{ modelId, connectionId }` |
| `system_model.set_property` | `{ modelId, target: {kind, id}, key: KnownKey, value }` — `key` narrowed to typed-field enum per entity kind (see below) |
| `system_model.set_metadata` | `{ modelId, target: {kind, id}, key: string, value: JsonValue }` — writes to `metadata` bag only |
| `system_model.rename` | `{ modelId, target: {kind, id}, newName }` |
| `system_model.preview` | `{ modelId, ops: Op[], dryRun: true }` — never persists, returns projected snapshot + diff |

### `set_property` key enums (MCP-layer narrowing)

- Component: `"name" | "kind" | "ownerId" | "description" | "globalId"`
- Connection: `"name" | "kind" | "criticality" | "optional" | "capabilityId" | "description"`

List-valued fields (`capabilityIds`, `tags`) are POC-deferred — recreate via remove + add.

### Op semantics

- Single op per call. Batched commit (`apply_batch`) is v2.
- `add_*` is idempotent by id with identical payload (returns `{ok: true, noop: true}`); conflicting payload → `CONFLICT`.
- `dryRun: true` skips `writeAtomic` and skips `bus.publish`.

## Persistence API

```
load(path: string): { model: Model; modelId: string; revision: number } | ValidationError
save(path: string, model: Model, modelId: string): { revision: number }   // initial write, revision := 1
writeAtomic(modelId: string, model: Model, expectedRevision: number): { revision: number }
                                                                          // throws STALE_VERSION if mismatch
loadAll(directory: string): Array<{ model: Model; modelId: string; revision: number; path: string }>
                                                                          // glob *.system.json, validate each, skip+report invalid
```

### File semantics

- One file per model. UTF-8, LF, trailing newline, 2-space indent.
- Object keys sorted lexicographically. Envelope key order fixed: `schemaVersion`, `modelId`, `revision`, `model`.
- Arrays of entities sorted by `id`. IDs never rewritten on save.
- Atomic write: write to `<path>.tmp`, `fsync`, `rename`.
- External-write detection: on `load`, persistence stores `(path, mtime, contentHash)` in an in-process cache. Next `load` of the same path: if hash differs but `revision` is unchanged, this is an external (human) edit — `revision` is bumped by `+1` before returning, so the next `writeAtomic` against the pre-edit revision fails with `STALE_VERSION`. This is the v1.2 fix for the two-path "human edits while agent is mid-op" gap.

## Cross-model identity (v1.2)

- `Component.globalId` and `Capability.globalId` are optional strings. When present, they assert "this entity is the same as any other entity carrying the same globalId across the workspace."
- `persistence.loadAll(dir)` returns all models. A query layer can join across models on `globalId`.
- POC ships a single query: `findUsesOf(globalId, models[]) → Array<{ modelId, componentId }>` in `@system-diagram/persistence`. Justifies the "cross-system shared infrastructure" claim from the POC's evaluation.
- Validation: within a single model, `globalId` need not be unique (two Components in the same model can refer to the same global thing, though that's unusual). Across models, `globalId` is the join key — no uniqueness enforcement at the engine layer.

## Lens: Blast Radius

```
blastRadius(model: Model, nodeId: NodeId, options?: {
  maxHops?: number       // default 3
  direction?: "downstream" | "upstream" | "both"  // default "both"
  changeType?: "remove" | "modify"                 // default "remove"
}): BlastRadiusResult

BlastRadiusResult = {
  sourceNodeId: NodeId
  affected: Array<{
    nodeId: NodeId
    hopDistance: number
    paths: ConnectionId[][]
    blocking: boolean
    reason: string
  }>
  summary: { blockingCount: number; nonBlockingCount: number; maxHopReached: number; ownersImpacted: string[] }
  truncated: boolean
}
```

### Classification rule

An edge is **blocking** iff:
- `kind ∈ {sync-call, data-read, data-write, deploys-on}` AND
- `criticality = "hard"` AND
- `optional = false`

Everything else is non-blocking. Transitive blocking requires an unbroken blocking chain from source.

### `changeType` semantics

- `"remove"` — the node and all its incident connections vanish. Classification as above.
- `"modify"` — the node's contract may change. Outbound connections classified as if the node still exists but its outputs are unreliable. Inbound `sync-call`+`hard` edges become **blocking** even if `optional: true`, because the caller can't pre-empt a behavioral change with a circuit breaker. `async-event` inbound stays non-blocking regardless. This is the v1.2 fix for the `modify` semantics gap.

### Determinism

Stable ordering by `(hopDistance asc, nodeId asc)`. Pure function — no I/O.

## Overlay payload (lens → renderer)

```
ApplyOverlay = {
  nodes: Set<NodeId>                     // membership; non-members fade
  edges: Set<EdgeId>
  intensity?: Map<NodeId, number>        // [0,1] severity — lens-defined
  hopDistance?: Map<NodeId, number>      // integer; optional badge source
  legend?: string
}
```

- **Lens emits IDs + scalars only.** No colors, no tints, no icons.
- Renderer owns a single style table that maps `(connection.criticality, connection.optional, connection.kind, intensity)` → visual. Dark-mode and focus state live in the renderer.
- For Blast Radius: `intensity = 1.0` for blocking-reachable, `0.4` for soft/optional-reachable, decayed by hop distance.
- `hopDistance` is orthogonal to `intensity` — the renderer can show a hop badge while reading severity from intensity.

## Cross-area call graph

```
agent → MCP tool (set_property narrowed | set_metadata) → ops.applyOp
                     ↓
                  engine.applyPatch (pure)
                     ↓
                  engine.validate (pure)
                     ↓
                  persistence.writeAtomic(modelId, model, expectedRevision)
                     ↓                          ↓ on STALE_VERSION: surface to agent
                  bus.publish (infallible)
                     ↓
                  renderer (via bus.subscribe) re-renders
                  lens (invoked per-query, not subscribed)
```

## Renderer

- Standalone web app (Vite + React + ELK in a Web Worker). Mounted at root; no host SPA.
- CLI SVG/PNG export for PR review and the evaluation harness.
- Read-only. Editing is exclusively via the MCP ops layer.
- Mount path: `renderer.mount(model)` for initial paint; `bus.subscribe(modelId, listener)` for updates. Persistence does not emit on load — the caller of `load` triggers `mount`.

## Evaluation harness (the POC's central test)

Lens-owned. Lives in `@system-diagram/lens-blast-radius/eval/`.

- **Corpus:** 5 hand-authored systems (15–25 components each). Mix of microservice topologies, monoliths-with-sidecars, and event-driven pipelines.
- **Questions:** 3 per system = 15 total. Each phrased as "what breaks if we remove/change X?" with a hand-labeled ground-truth affected set and blocking-classification.
- **Pipelines compared:**
  - **A — Typed lens:** `blastRadius(model, nodeId, options)` over the `Model`.
  - **B — Vector baseline:** model serialized to prose chunks (one paragraph per component including `description` + connection descriptions); local embeddings index; LLM summarization of the top-k retrieval against the question.
- **Metrics:** precision/recall on affected set, blocking-classification F1, qualitative "would an on-call engineer trust this?" 1–5 score from one human reviewer.
- **Success threshold:** typed ≥ vector by ≥20pp recall on blocking dependencies at ≥2 hops, OR blocking-F1 > 0.7 where vector < 0.4. Otherwise: report and stop.
- **Hybrid (typed + vector) is NOT measured in POC.** The architecture enables it (free-text fields exist on entities), but the harness measures typed-only vs. vector-only. Hybrid is a follow-on if the typed-only result is encouraging.

## Areas can start M1 in parallel

- **Engine** depends on nothing. Ship `@system-diagram/engine` skeleton + types + `ENGINE_SCHEMA_VERSION` first; everyone compiles against the types.
- **Persistence** depends on engine types + `validate`. Stub `validate` for M1–M2.
- **Ops/MCP** depends on engine `applyPatch` + persistence `writeAtomic` + bus `publish`. Build against in-memory stubs.
- **Lens** depends on engine read primitives + fixture models. Hand-author JSON before persistence is ready.
- **Renderer** depends on engine types + bus `subscribe` + lens overlay shape. Render fixture models before ops integration.

## Locked items

- Layout library: ELK.js.
- File extension: `.system.json`. Default path: `<workspace>/systems/<modelId>.system.json`.
- Concurrency: optimistic via envelope `revision` integer. External-write detection via mtime+hash cache. No lock files. No watch-mode.
- Engine package is browser-safe and side-effect-free.
- Single lens in POC: Blast Radius. Other lenses are post-POC.
- No host product coupling. The POC stands on its own.
