# Design — Nested containment: LogGroup inside Lambda (v1)

**Status:** Approved · 2026-06-26
**Author:** Eduardo
**Relates to:** 2026-06-26-cdk-importer-design.md (the importer this builds on),
POC 0020 (engine/renderer contracts)

## Problem

The CDK importer renders every resource as a peer node. But some resources
conceptually *belong inside* another: a Lambda's `LogGroup` is not a sibling in
the topology — it is part of the Lambda. Today the importer **drops** LogGroups
(reported as `UNMAPPED_CONSTRUCT` diagnostics) because as peers they would be
noise. Rendered as *contained children*, they are meaningful: they declutter the
graph (8 fewer floating nodes) while surfacing the log-retention/ownership info.

The user's canonical example:

```ts
const handoffLogGroup = new logs.LogGroup(this, "HandoffLogGroup", {
  logGroupName: `/aws/lambda/${SERVICE_NAME}-handoff`,
  retention: logs.RetentionDays.ONE_MONTH,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
})
// ...passed into the Lambda:
new lambdaNodejs.NodejsFunction(this, "HandoffLambda", { logGroup: handoffLogGroup, ... })
```

## Approach

Introduce **one schema concept** — `Component.parentId` — and render parented
components as ELK hierarchical children inside their parent's box. A contained
child is an *attribute-with-presence*: laid out inside its parent, with **no
edges of its own** (it is not a topology peer).

v1 scope: **LogGroup → Lambda only** (8 cases, all via the explicit `logGroup:`
prop — statically deterministic). The same `parentId` mechanism extends later to
DLQ→queue, GSI→table, route→API, etc. (out of scope here).

### Investigation findings that ground this

- **ELK natively supports nesting** via `ElkNode.children[]`; the existing
  `"layered"` algorithm handles hierarchy with no algorithm change. Child
  coordinates return *relative to parent*.
- **Edges cross container boundaries transparently** — `fromId`/`toId` need no
  special handling.
- **The LogGroup→Lambda link is explicit** — `logGroup: <var>` in the Lambda
  props, 8/8 Lambdas (the `alarmNotifierLambda` has none — it relies on the
  default log group, so it gets no child). No string-convention guessing.

### Rejected alternatives

- **Child node with its own edges** — more faithful for metric-filter→alarm, but
  busier and not needed for LogGroups (which have no outgoing topology).
- **Collapse/expand toggle** — most powerful, but needs renderer interaction
  state; deferred. v1 always shows the child.
- **Keep dropping LogGroups** — loses real information the user explicitly wants.

## Architecture changes (5 focused units)

### 1. Schema — `engine/types.ts`

Add one optional field to `Component`:

```ts
parentId?: NodeId   // when set, this component is a contained child of parentId
```

Engine `validate` gains one rule: if `parentId` is set, it must reference an
existing component id (else a `REF` error). Components without `parentId` are
unaffected — existing models validate identically.

### 2. Subtype map — `packages/import/src/subtypeMap.ts`

Add: `LogGroup → { kind: "job", subtype: "aws:logs", awsService: "CloudWatch Logs", icon: "logs" }`.
LogGroup was previously skipped as noise; now it is a meaningful contained child.

### 3. CDK parser — components + parent linking

- The component matcher already emits a `Component` for every `new logs.LogGroup(...)`.
- New linking pass (in `cdkImporter.ts`, after components are extracted): for each
  `NodejsFunction` construction, read its options object for a `logGroup:` property;
  resolve the referenced variable to a LogGroup component; set that LogGroup's
  `parentId` to the Lambda's id.
- LogGroups are **excluded from the connection matcher** — contained children have
  no edges. (They have no `grant*`/integration idioms anyway, so this is mostly
  automatic; the linking pass just assigns `parentId`.)

### 4. ELK layout — `prototypes/elk-renderer/src/renderer/layout.ts`

Build the `children[]` tree instead of a flat list:
- Components with no `parentId` → root-level `children`.
- Components with a `parentId` → nested inside that parent's `children` array.
- ELK lays out the hierarchy. The layout result is walked to produce render data;
  child positions stay relative to parent (consumed in step 5).

### 5. Renderer — `prototypes/elk-renderer/src/renderer/Graph.tsx`

Render children as nested SVG `<g transform>` inside the parent's group. ELK's
relative child coordinates compose naturally with the parent transform (SVG does
the math). A contained LogGroup draws as a small chip with its `LOGS` badge inside
the Lambda's (now larger) box. The Lambda box grows to contain its child — ELK
sizes the parent to fit.

## Data flow

```
CDK source
  -> component matcher: emits Lambda + LogGroup components (flat)
  -> parent-linking pass: LogGroup.parentId = owning Lambda (via logGroup: prop)
  -> connection matcher: edges among peers only (LogGroups excluded)
  -> engine.validate: parentId refs must resolve
  -> Model { components (8 with parentId), connections (unchanged) }
       |
  layout.ts: build ELK children[] tree, run "layered"
       |
  Graph.tsx: nested <g transform> — child chip inside parent box
```

## Expected golden-file change

| metric | before | after |
|---|---|---|
| components | 22 | 30 (8 LogGroups now included as children) |
| of which have `parentId` | 0 | 8 |
| connections | 28 | 28 (unchanged — children have no edges) |
| warn diagnostics | 1 (anon Rule) | 1 (anon Rule) |

(The 22→30 count is for the two-file golden test. The CLI over the full
directory also picks up a 9th LogGroup — `trailLogGroup` in the security
stack — which belongs to a CloudTrail, not a Lambda. With trail-nesting out
of v1 scope, it stays a peer node and emits an `UNRESOLVED_PARENT`-style
`info` diagnostic noting it has no Lambda owner. Only the 8 Lambda-owned
LogGroups get a `parentId` in v1.)

## Testing

- **Schema validation test** — a model with a `parentId` pointing at a missing
  component yields a `REF` error; a valid one passes.
- **Subtype test** — `lookupSubtype("LogGroup")` returns the `aws:logs` entry.
- **Parent-linking unit test** — a Lambda snippet with `logGroup: fooLogGroup`
  sets `fooLogGroup.parentId` to the Lambda id; a Lambda with no `logGroup:`
  leaves its (nonexistent) child unset.
- **Golden-file test update** — assert 30 components, 8 with `parentId`, and that
  `handoffLogGroup.parentId === "handoffLambda"`. Connections stay at 28.
- **Layout test** — `layout.ts` produces a nested structure: the parent node's
  children array contains its LogGroup; child has relative coords.

## Proof of completion

A re-rendered `14-github-app-gateway` screenshot (or a new `15-` frame) showing
LogGroups nested inside their Lambdas, with the topology edges still routing from
the Lambda containers.

## Error handling

- A `logGroup:` value that can't be resolved to a known LogGroup component →
  `warn` diagnostic (`UNRESOLVED_PARENT`), the LogGroup stays a peer rather than
  vanishing. Diagnostics-not-drops, consistent with the importer.
- A `parentId` cycle (A parent of B, B parent of A) → engine `CYCLE`-style guard;
  for v1 (single-level LogGroup nesting) a simple "parent must not itself have a
  parentId" check suffices and is cheaper than full cycle detection.

## Out of scope (future)

- DLQ→queue, GSI→table, route→API, metric-filter→logGroup, trail→logGroup
  nesting (same `parentId` mechanism, more parser cases).
- Collapse/expand interaction.
- Multi-level nesting (child-of-child). v1 is single-level; the validator
  enforces it.
- Official AWS icon images (separate effort; this spec keeps the text badge).
