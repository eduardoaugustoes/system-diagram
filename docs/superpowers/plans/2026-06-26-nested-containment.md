# Nested Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a Lambda's `LogGroup` as a contained child nested inside the Lambda's box, instead of dropping it — via a new `Component.parentId` field carried through the importer, ELK hierarchy, and the renderer.

**Architecture:** Add one optional schema field `parentId`. The CDK importer emits LogGroup components and links each to its owning Lambda by reading the `logGroup:` prop. ELK lays out parented components as hierarchical children (relative coords); `layout.ts` flattens to absolute coords carrying `parentId`; `Graph.tsx` draws the child as a chip inside the parent box. Contained children have no edges.

**Tech Stack:** TypeScript, ts-morph, Vitest, elkjs, React/SVG. Builds on `@system-diagram/import` and the `elk-renderer` prototype.

## Global Constraints

- Branch: continue on `feat/cdk-importer` (do NOT create a new branch).
- v1 nests ONLY LogGroup → Lambda (via the explicit `logGroup:` prop). No other containment types.
- Single-level nesting only: a child (has `parentId`) must NOT itself be a parent. The engine validator enforces this.
- Contained children have NO connections — they are excluded from the connection matcher and have no edges.
- Engine `validate` must reject a `parentId` that references a missing component (`REF` error) and a parented component that is itself someone's parent (`CYCLE` error).
- Diagnostics-not-drops: an unresolvable `logGroup:` reference yields a diagnostic; the LogGroup stays a peer rather than vanishing.
- Run tests with `./node_modules/.bin/vitest` and typecheck with `./node_modules/.bin/tsc` (npx resolves the wrong tsc in this environment). Always `cd` to the package dir first (cwd resets between shells).
- Commit after every task. Conventional-commit messages. NO AI attribution.
- Golden-file target (two-file: data + app stacks): 30 components (8 with `parentId`), 28 connections, 1 warn diagnostic.

---

## File Structure

- `prototypes/elk-renderer/src/engine/types.ts` — MODIFY: add `parentId?: NodeId` to `Component`.
- `prototypes/elk-renderer/src/engine/engine.ts` — MODIFY: `validate` adds parentId REF + single-level CYCLE checks.
- `packages/import/src/subtypeMap.ts` — MODIFY: add `LogGroup` entry.
- `packages/import/src/parentLink.ts` — CREATE: links LogGroup components to their owning Lambda via the `logGroup:` prop.
- `packages/import/src/cdkImporter.ts` — MODIFY: run the parent-linking pass; exclude parented components from being treated as edge endpoints is automatic (they have no grant idioms), but the linking pass must run after extraction and before validate.
- `prototypes/elk-renderer/src/renderer/layout.ts` — MODIFY: build ELK `children[]` tree; flatten result to absolute coords with `parentId`.
- `prototypes/elk-renderer/src/renderer/Graph.tsx` — MODIFY: render contained children as chips inside the parent box.
- Test files alongside each.

---

### Task 1: Schema field + validation

**Files:**
- Modify: `prototypes/elk-renderer/src/engine/types.ts`
- Modify: `prototypes/elk-renderer/src/engine/engine.ts:11-51` (the `validate` function)
- Test: `prototypes/elk-renderer/src/engine/engine.parentId.test.ts`

**Interfaces:**
- Produces: `Component.parentId?: string`. `validate(model)` now also errors on dangling/cyclic parentId.

- [ ] **Step 1: Write the failing test**

`prototypes/elk-renderer/src/engine/engine.parentId.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { validate } from "./engine"
import type { Model, Component } from "./types"

const comp = (id: string, extra: Partial<Component> = {}): Component => ({
  id, kind: "service", name: id, capabilityIds: [], tags: [], metadata: {}, ...extra,
})

function model(components: Component[]): Model {
  return { system: { id: "s", name: "S" }, components, connections: [], capabilities: [], owners: [] }
}

describe("validate — parentId", () => {
  it("accepts a parentId that references an existing component", () => {
    const m = model([comp("lambda"), comp("log", { parentId: "lambda" })])
    expect(validate(m).ok).toBe(true)
  })
  it("rejects a parentId that references a missing component", () => {
    const m = model([comp("log", { parentId: "ghost" })])
    const r = validate(m)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === "REF")).toBe(true)
  })
  it("rejects a parented component that is itself a parent (single-level only)", () => {
    const m = model([
      comp("a"),
      comp("b", { parentId: "a" }),
      comp("c", { parentId: "b" }),
    ])
    const r = validate(m)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === "CYCLE")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototypes/elk-renderer && ./node_modules/.bin/vitest run src/engine/engine.parentId.test.ts`
Expected: FAIL — `parentId` not on the type / no validation yet. (If vitest is not installed here, it was added in the importer work; if missing run `npm i -D vitest`.)

- [ ] **Step 3: Add the field**

In `prototypes/elk-renderer/src/engine/types.ts`, add to the `Component` interface (after `ownerId?: string`):
```ts
  parentId?: NodeId
```

- [ ] **Step 4: Add validation**

In `prototypes/elk-renderer/src/engine/engine.ts`, inside `validate`, after the component-id dedupe loop builds `componentIds` and before the connections loop, add:
```ts
  const parentIds = new Set<string>()
  for (const component of model.components) {
    if (component.parentId !== undefined) parentIds.add(component.id)
  }
  for (const component of model.components) {
    if (component.parentId === undefined) continue
    if (!componentIds.has(component.parentId)) {
      errors.push({
        code: "REF",
        path: `/components/${component.id}/parentId`,
        message: `Unknown parentId: ${component.parentId}`,
        nodeId: component.id,
      })
    }
    // single-level only: a child must not itself be a parent
    if (parentIds.has(component.parentId)) {
      const parent = model.components.find(c => c.id === component.parentId)
      if (parent?.parentId !== undefined) {
        errors.push({
          code: "CYCLE",
          path: `/components/${component.id}/parentId`,
          message: `Multi-level nesting not allowed: ${component.parentId} is itself a child`,
          nodeId: component.id,
        })
      }
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/engine/engine.parentId.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add prototypes/elk-renderer/src/engine/types.ts prototypes/elk-renderer/src/engine/engine.ts prototypes/elk-renderer/src/engine/engine.parentId.test.ts
git commit -m "feat: add Component.parentId with single-level validation"
```

---

### Task 2: LogGroup subtype

**Files:**
- Modify: `packages/import/src/subtypeMap.ts`
- Test: `packages/import/test/subtypeMap.test.ts` (extend)

**Interfaces:**
- Consumes/produces: `lookupSubtype("LogGroup")` now returns an `aws:logs` entry.

- [ ] **Step 1: Add the failing assertion**

In `packages/import/test/subtypeMap.test.ts`, change the existing "returns undefined for unknown classes" test (which currently asserts `LogGroup` is undefined) and add a new test. Replace:
```ts
  it("returns undefined for unknown classes", () => {
    expect(lookupSubtype("LogGroup")).toBeUndefined()
  })
```
with:
```ts
  it("maps LogGroup to an aws:logs job", () => {
    expect(lookupSubtype("LogGroup")).toEqual({
      kind: "job", subtype: "aws:logs", awsService: "CloudWatch Logs", icon: "logs",
    })
  })
  it("returns undefined for genuinely unknown classes", () => {
    expect(lookupSubtype("CfnOutput")).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/import && ./node_modules/.bin/vitest run test/subtypeMap.test.ts`
Expected: FAIL — `LogGroup` currently returns undefined.

- [ ] **Step 3: Add the map entry**

In `packages/import/src/subtypeMap.ts`, add to the `MAP` object (after the `Dashboard` line):
```ts
  LogGroup: { kind: "job", subtype: "aws:logs", awsService: "CloudWatch Logs", icon: "logs" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/subtypeMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add packages/import/src/subtypeMap.ts packages/import/test/subtypeMap.test.ts
git commit -m "feat: map LogGroup to aws:logs subtype"
```

---

### Task 3: Parent-linking pass

**Files:**
- Create: `packages/import/src/parentLink.ts`
- Test: `packages/import/test/parentLink.test.ts`

**Interfaces:**
- Consumes: ts-morph `SourceFile`; the `byVarName` map from `extractComponents` (Map<string, Component>).
- Produces: `linkParents(source: SourceFile, byVarName: Map<string, Component>): Diagnostic[]`. For each `NodejsFunction` (or `Function`) construction that has a `logGroup:` prop whose value is an identifier resolving to a component in `byVarName`, sets that LogGroup component's `parentId` to the Lambda's variable name. Returns diagnostics for unresolvable `logGroup:` refs.

- [ ] **Step 1: Write the failing test**

`packages/import/test/parentLink.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { Project } from "ts-morph"
import { extractComponents } from "../src/components"
import { linkParents } from "../src/parentLink"

function parse(code: string) {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile("s.ts", code)
}

describe("linkParents", () => {
  it("sets a LogGroup's parentId to the Lambda that references it via logGroup:", () => {
    const src = parse(`
      const handoffLogGroup = new logs.LogGroup(this, "HandoffLogGroup", { logGroupName: "/aws/lambda/handoff" })
      const handoffLambda = new lambdaNodejs.NodejsFunction(this, "HandoffLambda", {
        functionName: "svc-handoff",
        logGroup: handoffLogGroup,
      })
    `)
    const { byVarName } = extractComponents(src, "App")
    linkParents(src, byVarName)
    expect(byVarName.get("handoffLogGroup")?.parentId).toBe("handoffLambda")
  })

  it("leaves a Lambda without a logGroup: prop unlinked", () => {
    const src = parse(`
      const alarmNotifierLambda = new lambdaNodejs.NodejsFunction(this, "Alarm", { functionName: "svc-alarm" })
    `)
    const { byVarName } = extractComponents(src, "App")
    const diags = linkParents(src, byVarName)
    expect(byVarName.get("alarmNotifierLambda")?.parentId).toBeUndefined()
    expect(diags).toHaveLength(0)
  })

  it("emits an info diagnostic when logGroup: references an unknown component", () => {
    const src = parse(`
      const fn = new lambdaNodejs.NodejsFunction(this, "Fn", { logGroup: someImportedGroup })
    `)
    const { byVarName } = extractComponents(src, "App")
    const diags = linkParents(src, byVarName)
    expect(diags.some(d => d.code === "UNRESOLVED_PARENT")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/import && ./node_modules/.bin/vitest run test/parentLink.test.ts`
Expected: FAIL — cannot find module `../src/parentLink`.

- [ ] **Step 3: Write the linking pass**

`packages/import/src/parentLink.ts`:
```ts
import { SyntaxKind, type SourceFile, type NewExpression } from "ts-morph"
import type { Component, Diagnostic } from "./types"

const LAMBDA_CLASSES = new Set(["NodejsFunction", "Function"])

function cdkClassName(expr: NewExpression): string | undefined {
  const text = expr.getExpression().getText()
  return text.includes(".") ? text.split(".").pop() : text
}

function varNameFor(expr: NewExpression): string | undefined {
  const varDecl = expr.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
  if (varDecl) return varDecl.getName()
  const binary = expr.getFirstAncestorByKind(SyntaxKind.BinaryExpression)
  if (binary) {
    const left = binary.getLeft().getText()
    return left.startsWith("this.") ? left.slice("this.".length) : left
  }
  return undefined
}

export function linkParents(source: SourceFile, byVarName: Map<string, Component>): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const expr of source.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const cls = cdkClassName(expr)
    if (!cls || !LAMBDA_CLASSES.has(cls)) continue
    const lambdaVar = varNameFor(expr)
    if (!lambdaVar) continue

    // find the options object literal among the constructor args
    const opts = expr
      .getArguments()
      .map(a => a.asKind(SyntaxKind.ObjectLiteralExpression))
      .find(o => o !== undefined)
    if (!opts) continue

    const logGroupValue = opts
      .getProperty("logGroup")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText()
    if (!logGroupValue) continue

    const logComponent = byVarName.get(logGroupValue)
    if (!logComponent) {
      diagnostics.push({
        level: "info",
        code: "UNRESOLVED_PARENT",
        message: `logGroup: ${logGroupValue} on ${lambdaVar} did not resolve to a known LogGroup`,
        line: expr.getStartLineNumber(),
      })
      continue
    }
    logComponent.parentId = lambdaVar
  }

  return diagnostics
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/parentLink.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add packages/import/src/parentLink.ts packages/import/test/parentLink.test.ts
git commit -m "feat: link LogGroup components to owning Lambda via logGroup prop"
```

---

### Task 4: Wire parent-linking into the importer

**Files:**
- Modify: `packages/import/src/cdkImporter.ts`
- Modify: `packages/import/test/golden.test.ts`

**Interfaces:**
- Consumes: `linkParents` from `./parentLink`.
- Produces: the assembled `Model` now has 8 LogGroups carrying `parentId`. LogGroups are NOT connection endpoints (they have no grant idioms, so the connection matcher already ignores them).

- [ ] **Step 1: Update the golden test expectations**

In `packages/import/test/golden.test.ts`, replace the "extracts 22 components" test body and add a parentId assertion. Change:
```ts
  it("extracts 22 components", () => {
    expect(result.model.components).toHaveLength(22)
  })
```
to:
```ts
  // Now includes the 8 Lambda-owned LogGroups as nested children: 22 + 8 = 30.
  it("extracts 30 components, 8 of them nested LogGroups", () => {
    expect(result.model.components).toHaveLength(30)
    const nested = result.model.components.filter(c => c.parentId !== undefined)
    expect(nested).toHaveLength(8)
    expect(nested.every(c => c.metadata.subtype === "aws:logs")).toBe(true)
  })

  it("nests handoffLogGroup inside handoffLambda", () => {
    const log = result.model.components.find(c => c.id === "handoffLogGroup")
    expect(log?.parentId).toBe("handoffLambda")
  })
```

(Leave the "extracts 28 connections" test unchanged — connections stay 28.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/import && ./node_modules/.bin/vitest run test/golden.test.ts`
Expected: FAIL — currently 22 components, no parentId set.

- [ ] **Step 3: Wire the linking pass into the importer**

In `packages/import/src/cdkImporter.ts`, add the import at the top with the others:
```ts
import { linkParents } from "./parentLink"
```

Then, inside `import(...)`, in the first loop over `sources` (the one that calls `extractComponents`), after `perFileLocal.set(source, byVarName)` and the `dataFields` population, the byVarName is per-file. Parent-linking must see both the LogGroups and the Lambdas, which are in the SAME file (app stack), so call `linkParents` per source right after extraction. Change the loop body:
```ts
    for (const source of sources) {
      const tag = stackTagOf(source)
      const { components: comps, byVarName, diagnostics: diags } = extractComponents(source, tag)
      components.push(...comps)
      diagnostics.push(...diags)
      perFileLocal.set(source, byVarName)
      for (const [name, comp] of byVarName) dataFields.set(name, comp)
      diagnostics.push(...linkParents(source, byVarName))
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run test/golden.test.ts`
Expected: PASS — 30 components, 8 nested, `handoffLogGroup.parentId === "handoffLambda"`, 28 connections.

- [ ] **Step 5: Run the full import suite + typecheck**

Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && echo "TSC: 0"`
Expected: all tests pass, TSC: 0.

- [ ] **Step 6: Regenerate the artifact + commit**

```bash
cd packages/import
./node_modules/.bin/tsx src/cli.ts /Users/eaugusto/codurance/github/github-app-gateway/infra/lib -o ../../examples/github-app-gateway.system.json --id github-app-gateway --name "GitHub App Gateway"
cd ../..
git add packages/import/src/cdkImporter.ts packages/import/test/golden.test.ts examples/github-app-gateway.system.json
git commit -m "feat: nest LogGroups under their Lambdas in the imported model"
```

---

### Task 5: ELK hierarchical layout

**Files:**
- Modify: `prototypes/elk-renderer/src/renderer/layout.ts`
- Test: `prototypes/elk-renderer/src/renderer/layout.test.ts`

**Interfaces:**
- Consumes: `Model` with `parentId` on some components.
- Produces: `PositionedNode` gains `parentId?: string`. `layoutModel` builds an ELK `children[]` tree (parented components nested under their parent), runs layout, and FLATTENS the result so every node in `LayoutResult.nodes` carries ABSOLUTE coords (parent.x + child.x) plus its `parentId`. Edges unchanged.

- [ ] **Step 1: Write the failing test**

`prototypes/elk-renderer/src/renderer/layout.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { layoutModel } from "./layout"
import type { Model, Component } from "../engine/types"

const comp = (id: string, extra: Partial<Component> = {}): Component => ({
  id, kind: "service", name: id, capabilityIds: [], tags: [], metadata: {}, ...extra,
})

describe("layoutModel — nesting", () => {
  it("lays out a child inside its parent and reports both with parentId", async () => {
    const model: Model = {
      system: { id: "s", name: "S" },
      components: [comp("lambda"), comp("log", { parentId: "lambda", kind: "job" })],
      connections: [],
      capabilities: [],
      owners: [],
    }
    const result = await layoutModel(model)
    const lambda = result.nodes.find(n => n.id === "lambda")
    const log = result.nodes.find(n => n.id === "log")
    expect(lambda).toBeDefined()
    expect(log).toBeDefined()
    expect(log!.parentId).toBe("lambda")
    // child is positioned within the parent's bounds (absolute coords)
    expect(log!.x).toBeGreaterThanOrEqual(lambda!.x)
    expect(log!.y).toBeGreaterThanOrEqual(lambda!.y)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototypes/elk-renderer && ./node_modules/.bin/vitest run src/renderer/layout.test.ts`
Expected: FAIL — flat layout ignores `parentId`; `log.parentId` is undefined.

- [ ] **Step 3: Rewrite layout to build the hierarchy**

In `prototypes/elk-renderer/src/renderer/layout.ts`:

Add `parentId` to the `PositionedNode` interface:
```ts
export interface PositionedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  parentId?: string
}
```

Replace the `children: model.components.map(...)` block (lines 60-64) with a nested tree build. Insert this helper above `layoutModel`:
```ts
interface ElkChild {
  id: string
  width: number
  height: number
  children?: ElkChild[]
  layoutOptions?: Record<string, string>
}

function buildChildren(model: Model): ElkChild[] {
  const sizeOf = (kind: string) => ({
    width: NODE_WIDTHS[kind] ?? 140,
    height: NODE_HEIGHTS[kind] ?? 56,
  })
  const childrenByParent = new Map<string, ElkChild[]>()
  for (const c of model.components) {
    if (c.parentId === undefined) continue
    const node: ElkChild = { id: c.id, ...sizeOf(c.kind) }
    const list = childrenByParent.get(c.parentId) ?? []
    list.push(node)
    childrenByParent.set(c.parentId, list)
  }
  const roots: ElkChild[] = []
  for (const c of model.components) {
    if (c.parentId !== undefined) continue
    const kids = childrenByParent.get(c.id)
    const node: ElkChild = { id: c.id, ...sizeOf(c.kind) }
    if (kids && kids.length > 0) {
      node.children = kids
      // give the parent container padding so the child sits inside, below the title
      node.layoutOptions = {
        "elk.padding": "[top=34,left=12,bottom=12,right=12]",
        "elk.algorithm": "layered",
      }
    }
    roots.push(node)
  }
  return roots
}
```

Change the `graph` object's `children` to use it:
```ts
    children: buildChildren(model),
```

Add `"elk.hierarchyHandling": "INCLUDE_CHILDREN"` to the root `layoutOptions` (so edges can cross containers and nested layout runs):
```ts
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
```

Replace the result-flattening block (lines 73-79) with a recursive flatten that accumulates absolute coords and records `parentId`:
```ts
  const nodes: PositionedNode[] = []
  const walk = (
    elkNodes: Array<{ id?: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] }>,
    offsetX: number,
    offsetY: number,
    parentId: string | undefined,
  ) => {
    for (const n of elkNodes) {
      const absX = offsetX + (n.x ?? 0)
      const absY = offsetY + (n.y ?? 0)
      nodes.push({
        id: n.id ?? "",
        x: absX,
        y: absY,
        width: n.width ?? 0,
        height: n.height ?? 0,
        parentId,
      })
      if (n.children && n.children.length > 0) {
        walk(n.children as typeof elkNodes, absX, absY, n.id)
      }
    }
  }
  walk((result.children ?? []) as Parameters<typeof walk>[0], 0, 0, undefined)
```

(Leave the edges block and the final `return` unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + build**

Run: `./node_modules/.bin/tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

(If `tsc --noEmit` complains there is no tsconfig in scope, run `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — the prototype's tsconfig.)

- [ ] **Step 6: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add prototypes/elk-renderer/src/renderer/layout.ts prototypes/elk-renderer/src/renderer/layout.test.ts
git commit -m "feat: lay out parented components as ELK hierarchical children"
```

---

### Task 6: Render contained children + capture proof

**Files:**
- Modify: `prototypes/elk-renderer/src/renderer/Graph.tsx`
- Create: `prototypes/elk-renderer/screenshots/15-gateway-nested-logs.png`

**Interfaces:**
- Consumes: `LayoutResult.nodes` where each node may carry `parentId`, and the `Model` components (for kind/subtype/name).

- [ ] **Step 1: Render children as nested chips**

The node loop in `Graph.tsx` iterates `layout.nodes` and renders each at absolute `(positioned.x, positioned.y)`. Children already have absolute coords from Task 5, so they render in the right place automatically — but they must render as small chips, not full boxes, and the parent must not double-render its child's label.

In `Graph.tsx`, in the `layout.nodes.map(...)` loop, after computing `component` (line ~134), add an early branch for children. Insert right after `if (!component) return null`:
```tsx
        if (component.parentId) {
          // contained child: a small chip drawn at its absolute position
          const childIcon = iconForSubtype(component.metadata?.subtype as string | undefined)
          return (
            <g key={positioned.id} transform={`translate(${positioned.x}, ${positioned.y})`}>
              <rect
                width={positioned.width}
                height={positioned.height}
                rx={4}
                ry={4}
                fill={COLORS.bg}
                stroke={COLORS.faded}
                strokeWidth={1}
              />
              <text
                x={positioned.width / 2}
                y={positioned.height / 2 + 3}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
                fontSize={9}
                fill={COLORS.mutedInk}
              >
                {childIcon ? childIcon.label.toUpperCase() : component.name}
              </text>
            </g>
          )
        }
```

(The parent Lambda renders normally via the existing code below — ELK has already grown its box to contain the child, so the child chip sits inside it.)

- [ ] **Step 2: Build + run the renderer**

Run: `cd prototypes/elk-renderer && npm run build && echo "BUILD: $?"`
Expected: BUILD: 0.

Then start the dev server:
```bash
npm run dev > /tmp/vite-nested.log 2>&1 &
until curl -s -o /dev/null http://localhost:5173/; do sleep 0.5; done
```

- [ ] **Step 3: Capture the nested render**

Using the chrome-devtools MCP (navigate to http://localhost:5173/ with `initScript: localStorage.clear()` so the gateway vision is active), confirm visually that LogGroups (e.g. `HANDOFF-LOGS` / a `LOGS` chip) appear INSIDE their Lambda boxes, and that the Lambda's data edges still route from the container. Save a full-page screenshot to `prototypes/elk-renderer/screenshots/15-gateway-nested-logs.png`.

If the browser MCP is unavailable, leave the dev server running and ask the user to capture it, per the importer-work precedent.

- [ ] **Step 4: Commit**

```bash
cd /Users/eaugusto/system-diagram
git add prototypes/elk-renderer/src/renderer/Graph.tsx prototypes/elk-renderer/screenshots/15-gateway-nested-logs.png
git commit -m "feat: render contained LogGroup chips inside their Lambda boxes"
```

---

## Self-Review

**Spec coverage:**
- Schema `parentId` + validate (REF + single-level CYCLE) → Task 1. ✓
- LogGroup `aws:logs` subtype → Task 2. ✓
- Parent-linking via `logGroup:` prop, diagnostics-not-drops → Task 3. ✓
- Wire into importer, 8 LogGroups nested, connections unchanged → Task 4. ✓
- ELK `children[]` hierarchy, relative→absolute flatten → Task 5. ✓
- Nested SVG render (child chip in parent) → Task 6. ✓
- Golden change 22→30 components, 8 parentId, 28 connections → Task 4. ✓
- Proof screenshot → Task 6. ✓
- Single-level enforcement → Task 1 (CYCLE check) + validated end-to-end. ✓
- 9th LogGroup (trail) stays a peer → automatic: `linkParents` only sets parentId when a `logGroup:` prop on a Lambda resolves; the trail's LogGroup is referenced by `cloudWatchLogGroup:` on a Trail, not by a Lambda, so it is never parented. (No task needed; covered by Task 3's Lambda-only scope.)

**Placeholder scan:** No "TBD"/"add validation"/"similar to Task N". Every code step shows full code. Task 6 Step 3 (screenshot capture) depends on browser-MCP availability and falls back to asking the user — same honest pattern as the importer work.

**Type consistency:** `Component.parentId?: string` (Task 1) is read in Tasks 3, 4, 5, 6. `linkParents(source, byVarName): Diagnostic[]` (Task 3) is called with that exact signature in Task 4. `PositionedNode.parentId?: string` (Task 5) is consumed in Task 6. `lookupSubtype("LogGroup")` returns `{ kind:"job", subtype:"aws:logs", awsService:"CloudWatch Logs", icon:"logs" }` consistently in Tasks 2 and 4. Diagnostic code `UNRESOLVED_PARENT` (Task 3) matches the spec's error-handling section.
