# CDK Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@system-diagram/import` — a package that statically parses AWS CDK `.ts` stacks into the existing engine `Model`, so real infrastructure renders in the ELK renderer with AWS-aware icons.

**Architecture:** A thin `ImporterPlugin` contract with one implementation, `CdkImporter`. It uses ts-morph to walk the CDK source AST, matches construction idioms (`new X.Resource(...)`) to components and reference idioms (`grant*`, `HttpLambdaIntegration`, `addEventSource`, `addSubscription`, `deadLetterQueue`) to connections, assembles a `Model`, and validates it with the existing engine. AWS richness rides in `Component.metadata.subtype`; the renderer gains one icon lookup. The engine and Blast Radius lens are untouched.

**Tech Stack:** TypeScript, ts-morph (AST), Vitest (tests), the existing `@system-diagram` engine types, Vite + React + ELK renderer.

## Global Constraints

- Package location: `packages/import/` at repo root (new top-level `packages/` dir). One workspace package: `@system-diagram/import`.
- The package MUST NOT import from `aws-cdk-lib` or run `cdk synth` — extraction is static AST only (no AWS creds, offline, deterministic).
- The importer MUST produce a `Model` that passes the existing `validate(model)` from `prototypes/elk-renderer/src/engine/engine.ts`; an invalid model is a hard error, never emitted.
- Unresolvable references become `Diagnostic` entries — NEVER silently dropped edges.
- The six abstract `ComponentKind`s (`service|datastore|queue|external|ui|job`) stay load-bearing. AWS identity lives ONLY in `metadata` — no new `kind` enum values, no engine `types.ts` change.
- Component/connection `id`s are derived from the CDK variable name (e.g. `handoffLambda` → `handoffLambda`), so they are stable and human-legible.
- Commit after every task. Use conventional-commit messages (`feat:`, `test:`, `chore:`). NO AI attribution in commit messages.
- Golden-file target: importing `github-app-gateway/infra/lib/*.ts` yields **20 components** and **27 connections**.

---

## File Structure

- `packages/import/package.json` — workspace package manifest, ts-morph + vitest deps.
- `packages/import/tsconfig.json` — TS config.
- `packages/import/src/types.ts` — `ImporterPlugin`, `ImportResult`, `Diagnostic`, `ImportOptions`. Re-exports the engine `Model` types.
- `packages/import/src/subtypeMap.ts` — CDK class name → `{ kind, subtype, awsService, icon }`. The extensible AWS vocabulary table.
- `packages/import/src/components.ts` — component matcher: walks `new X.Y(...)` constructions → `Component[]` + a name→component index.
- `packages/import/src/connections.ts` — connection matchers: grants, integrations, event sources, DLQ, subscriptions → `Connection[]` + diagnostics.
- `packages/import/src/crossFile.ts` — resolves `this.data.<field>` references to data-stack component ids by matching `public readonly` field types.
- `packages/import/src/cdkImporter.ts` — the `CdkImporter` plugin: orchestrates parse → components → connections → assemble → validate.
- `packages/import/src/cli.ts` — `cdk-import <dir> -o <out>.system.json`.
- `packages/import/test/fixtures/` — small inline `.ts` CDK snippets for unit tests.
- `packages/import/test/*.test.ts` — one test file per source module + the golden-file test.
- `prototypes/elk-renderer/src/renderer/icons.ts` — subtype→SVG-icon-id map (renderer side).
- `prototypes/elk-renderer/src/renderer/Graph.tsx` — MODIFY: render an icon badge when `metadata.subtype` is present.

---

### Task 1: Package scaffold + plugin contract types

**Files:**
- Create: `packages/import/package.json`
- Create: `packages/import/tsconfig.json`
- Create: `packages/import/src/types.ts`
- Test: `packages/import/test/types.test.ts`

**Interfaces:**
- Produces: `ImporterPlugin`, `ImportResult`, `Diagnostic`, `ImportOptions`, and re-exported `Model`, `Component`, `Connection`, `ComponentKind` from the engine.

- [ ] **Step 1: Create the package manifest**

`packages/import/package.json`:
```json
{
  "name": "@system-diagram/import",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": { "cdk-import": "./dist/cli.js" },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "cdk-import": "tsx src/cli.ts"
  },
  "dependencies": {
    "ts-morph": "^23.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

`packages/import/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test**

`packages/import/test/types.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import type { ImporterPlugin, ImportResult, Diagnostic } from "../src/types"

describe("plugin contract", () => {
  it("a minimal plugin satisfies the ImporterPlugin shape", () => {
    const plugin: ImporterPlugin = {
      id: "noop",
      detect: () => false,
      import: (): ImportResult => ({
        model: { system: { id: "s", name: "S" }, components: [], connections: [], capabilities: [], owners: [] },
        diagnostics: [] as Diagnostic[],
      }),
    }
    expect(plugin.id).toBe("noop")
    expect(plugin.detect("/anywhere")).toBe(false)
    expect(plugin.import([], {}).model.components).toEqual([])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/import && npm install && npx vitest run test/types.test.ts`
Expected: FAIL — cannot find module `../src/types`.

- [ ] **Step 5: Write the types**

`packages/import/src/types.ts`:
```ts
export type {
  Model,
  Component,
  Connection,
  ComponentKind,
  ConnectionKind,
  Criticality,
} from "../../../prototypes/elk-renderer/src/engine/types"

export interface Diagnostic {
  level: "info" | "warn"
  code: string
  message: string
  file?: string
  line?: number
}

export interface ImportOptions {
  systemId?: string
  systemName?: string
}

export interface ImportResult {
  model: import("../../../prototypes/elk-renderer/src/engine/types").Model
  diagnostics: Diagnostic[]
}

export interface ImporterPlugin {
  id: string
  detect(workspace: string): boolean
  import(files: string[], opts: ImportOptions): ImportResult
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/types.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/import/package.json packages/import/tsconfig.json packages/import/src/types.ts packages/import/test/types.test.ts
git commit -m "feat: scaffold @system-diagram/import with plugin contract"
```

---

### Task 2: AWS subtype map

**Files:**
- Create: `packages/import/src/subtypeMap.ts`
- Test: `packages/import/test/subtypeMap.test.ts`

**Interfaces:**
- Consumes: `ComponentKind` from `../src/types`.
- Produces: `lookupSubtype(cdkClass: string): SubtypeEntry | undefined` and `interface SubtypeEntry { kind: ComponentKind; subtype: string; awsService: string; icon: string }`.

- [ ] **Step 1: Write the failing test**

`packages/import/test/subtypeMap.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { lookupSubtype } from "../src/subtypeMap"

describe("lookupSubtype", () => {
  it("maps NodejsFunction to an aws:lambda service", () => {
    expect(lookupSubtype("NodejsFunction")).toEqual({
      kind: "service", subtype: "aws:lambda", awsService: "Lambda", icon: "lambda",
    })
  })
  it("maps Table to an aws:dynamodb datastore", () => {
    expect(lookupSubtype("Table")?.kind).toBe("datastore")
    expect(lookupSubtype("Table")?.subtype).toBe("aws:dynamodb")
  })
  it("maps Queue to a queue and Topic to a queue", () => {
    expect(lookupSubtype("Queue")?.kind).toBe("queue")
    expect(lookupSubtype("Topic")?.kind).toBe("queue")
    expect(lookupSubtype("Topic")?.subtype).toBe("aws:sns")
  })
  it("maps Secret to a datastore and HttpApi to external", () => {
    expect(lookupSubtype("Secret")?.kind).toBe("datastore")
    expect(lookupSubtype("HttpApi")?.kind).toBe("external")
  })
  it("returns undefined for unknown classes", () => {
    expect(lookupSubtype("LogGroup")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/subtypeMap.test.ts`
Expected: FAIL — cannot find module `../src/subtypeMap`.

- [ ] **Step 3: Write the subtype map**

`packages/import/src/subtypeMap.ts`:
```ts
import type { ComponentKind } from "./types"

export interface SubtypeEntry {
  kind: ComponentKind
  subtype: string
  awsService: string
  icon: string
}

const MAP: Record<string, SubtypeEntry> = {
  NodejsFunction: { kind: "service", subtype: "aws:lambda", awsService: "Lambda", icon: "lambda" },
  Function: { kind: "service", subtype: "aws:lambda", awsService: "Lambda", icon: "lambda" },
  Table: { kind: "datastore", subtype: "aws:dynamodb", awsService: "DynamoDB", icon: "dynamodb" },
  Queue: { kind: "queue", subtype: "aws:sqs", awsService: "SQS", icon: "sqs" },
  Topic: { kind: "queue", subtype: "aws:sns", awsService: "SNS", icon: "sns" },
  Secret: { kind: "datastore", subtype: "aws:secret", awsService: "Secrets Manager", icon: "secret" },
  HttpApi: { kind: "external", subtype: "aws:apigw", awsService: "API Gateway", icon: "apigw" },
  Rule: { kind: "job", subtype: "aws:eventbridge", awsService: "EventBridge", icon: "eventbridge" },
  Alarm: { kind: "job", subtype: "aws:cloudwatch", awsService: "CloudWatch", icon: "cloudwatch" },
  Dashboard: { kind: "job", subtype: "aws:cloudwatch", awsService: "CloudWatch", icon: "cloudwatch" },
}

export function lookupSubtype(cdkClass: string): SubtypeEntry | undefined {
  return MAP[cdkClass]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/subtypeMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/import/src/subtypeMap.ts packages/import/test/subtypeMap.test.ts
git commit -m "feat: add AWS subtype map for CDK constructs"
```

---

### Task 3: Component matcher

**Files:**
- Create: `packages/import/src/components.ts`
- Create: `packages/import/test/fixtures/data-snippet.ts` (a tiny CDK-shaped string, written as a fixture file the test reads)
- Test: `packages/import/test/components.test.ts`

**Interfaces:**
- Consumes: `lookupSubtype` from `./subtypeMap`; ts-morph `SourceFile`.
- Produces:
  - `extractComponents(source: SourceFile, stackTag: string): { components: Component[]; byVarName: Map<string, Component>; diagnostics: Diagnostic[] }`
  - A helper `parseSource(code: string): SourceFile` (ts-morph in-memory project) usable by later tests.

- [ ] **Step 1: Write the failing test**

`packages/import/test/components.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { Project } from "ts-morph"
import { extractComponents } from "../src/components"

function parse(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  return project.createSourceFile("snippet.ts", code)
}

describe("extractComponents", () => {
  it("turns a Table construction into a datastore component with aws subtype", () => {
    const src = parse(`
      const installationsTable = new dynamodb.Table(this, "InstallationsTable", {
        tableName: "github-app-gateway-installations",
      })
    `)
    const { components, byVarName } = extractComponents(src, "GatewayDataStack")
    expect(components).toHaveLength(1)
    const c = components[0]
    expect(c.id).toBe("installationsTable")
    expect(c.kind).toBe("datastore")
    expect(c.metadata.subtype).toBe("aws:dynamodb")
    expect(c.tags).toContain("stack:GatewayDataStack")
    expect(byVarName.get("installationsTable")).toBe(c)
  })

  it("ignores unknown constructs (LogGroup) and emits an info diagnostic", () => {
    const src = parse(`const lg = new logs.LogGroup(this, "LG", {})`)
    const { components, diagnostics } = extractComponents(src, "App")
    expect(components).toHaveLength(0)
    expect(diagnostics.some(d => d.level === "info" && d.code === "UNMAPPED_CONSTRUCT")).toBe(true)
  })

  it("captures this.field = new ... assignments (public readonly producers)", () => {
    const src = parse(`this.webhookEventsQueue = new sqs.Queue(this, "Q", { queueName: "q" })`)
    const { components, byVarName } = extractComponents(src, "GatewayDataStack")
    expect(components).toHaveLength(1)
    expect(components[0].id).toBe("webhookEventsQueue")
    expect(byVarName.get("webhookEventsQueue")?.kind).toBe("queue")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/components.test.ts`
Expected: FAIL — cannot find module `../src/components`.

- [ ] **Step 3: Write the component matcher**

`packages/import/src/components.ts`:
```ts
import { SyntaxKind, type SourceFile, type NewExpression } from "ts-morph"
import { lookupSubtype } from "./subtypeMap"
import type { Component, Diagnostic } from "./types"

interface ExtractResult {
  components: Component[]
  byVarName: Map<string, Component>
  diagnostics: Diagnostic[]
}

function cdkClassName(expr: NewExpression): string | undefined {
  const callee = expr.getExpression()
  // matches `dynamodb.Table` or `Table`
  const text = callee.getText()
  return text.includes(".") ? text.split(".").pop() : text
}

function varNameFor(expr: NewExpression): string | undefined {
  const varDecl = expr.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
  if (varDecl) return varDecl.getName()
  const binary = expr.getFirstAncestorByKind(SyntaxKind.BinaryExpression)
  if (binary) {
    const left = binary.getLeft().getText() // e.g. "this.webhookEventsQueue"
    return left.startsWith("this.") ? left.slice("this.".length) : left
  }
  return undefined
}

export function extractComponents(source: SourceFile, stackTag: string): ExtractResult {
  const components: Component[] = []
  const byVarName = new Map<string, Component>()
  const diagnostics: Diagnostic[] = []

  for (const expr of source.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const cls = cdkClassName(expr)
    if (!cls) continue
    const entry = lookupSubtype(cls)
    if (!entry) {
      if (cls === "LogGroup" || cls === "CfnOutput" || cls.startsWith("Cfn")) {
        diagnostics.push({
          level: "info", code: "UNMAPPED_CONSTRUCT",
          message: `Skipped unmapped construct ${cls}`,
          line: expr.getStartLineNumber(),
        })
      }
      continue
    }
    const varName = varNameFor(expr)
    if (!varName) {
      diagnostics.push({
        level: "warn", code: "ANON_CONSTRUCT",
        message: `${cls} construction has no resolvable variable name`,
        line: expr.getStartLineNumber(),
      })
      continue
    }
    const component: Component = {
      id: varName,
      kind: entry.kind,
      name: varName,
      ownerId: undefined,
      capabilityIds: [],
      tags: [`stack:${stackTag}`],
      metadata: { subtype: entry.subtype, awsService: entry.awsService, icon: entry.icon },
    }
    components.push(component)
    byVarName.set(varName, component)
  }

  return { components, byVarName, diagnostics }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/components.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/import/src/components.ts packages/import/test/components.test.ts
git commit -m "feat: extract CDK constructions into typed components"
```

---

### Task 4: Cross-file reference resolver

**Files:**
- Create: `packages/import/src/crossFile.ts`
- Test: `packages/import/test/crossFile.test.ts`

**Interfaces:**
- Consumes: ts-morph `SourceFile`; the `byVarName` maps from `extractComponents`.
- Produces: `resolveRef(refText: string, local: Map<string, Component>, dataFields: Map<string, Component>): { component: Component; reason: string } | { component: undefined; reason: string }`.
  - `refText` is the callee/target text, e.g. `"this.data.installationsTable"`, `"installationsTable"`, or `"this.installationsTable"`.
  - `dataFields` maps a data-stack public field name → its component (built by running `extractComponents` over `gateway-data-stack.ts`).

- [ ] **Step 1: Write the failing test**

`packages/import/test/crossFile.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { resolveRef } from "../src/crossFile"
import type { Component } from "../src/types"

const comp = (id: string): Component => ({
  id, kind: "datastore", name: id, capabilityIds: [], tags: [], metadata: {},
})

describe("resolveRef", () => {
  const local = new Map([["handoffLambda", comp("handoffLambda")]])
  const data = new Map([["installationsTable", comp("installationsTable")]])

  it("resolves a this.data.<field> reference to the data-stack component", () => {
    const r = resolveRef("this.data.installationsTable", local, data)
    expect(r.component?.id).toBe("installationsTable")
  })
  it("resolves a bare local variable reference", () => {
    const r = resolveRef("handoffLambda", local, data)
    expect(r.component?.id).toBe("handoffLambda")
  })
  it("returns undefined component with a reason for unresolvable refs", () => {
    const r = resolveRef("this.data.mysteryThing", local, data)
    expect(r.component).toBeUndefined()
    expect(r.reason).toMatch(/unresolved/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/crossFile.test.ts`
Expected: FAIL — cannot find module `../src/crossFile`.

- [ ] **Step 3: Write the resolver**

`packages/import/src/crossFile.ts`:
```ts
import type { Component } from "./types"

type Resolution = { component: Component | undefined; reason: string }

function tail(refText: string): string {
  return refText.includes(".") ? refText.split(".").pop()! : refText
}

export function resolveRef(
  refText: string,
  local: Map<string, Component>,
  dataFields: Map<string, Component>,
): Resolution {
  const name = tail(refText)
  if (refText.startsWith("this.data.")) {
    const hit = dataFields.get(name)
    return hit
      ? { component: hit, reason: "resolved cross-file via this.data" }
      : { component: undefined, reason: `unresolved cross-file ref: ${refText}` }
  }
  const localHit = local.get(name) ?? local.get(refText)
  if (localHit) return { component: localHit, reason: "resolved local" }
  const dataHit = dataFields.get(name)
  if (dataHit) return { component: dataHit, reason: "resolved via field name" }
  return { component: undefined, reason: `unresolved ref: ${refText}` }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/crossFile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/import/src/crossFile.ts packages/import/test/crossFile.test.ts
git commit -m "feat: resolve cross-file this.data references to components"
```

---

### Task 5: Connection matcher — grants

**Files:**
- Create: `packages/import/src/connections.ts`
- Test: `packages/import/test/connections.grants.test.ts`

**Interfaces:**
- Consumes: ts-morph `SourceFile`; `resolveRef` from `./crossFile`; component maps.
- Produces:
  - `extractConnections(source, ctx): { connections: Connection[]; diagnostics: Diagnostic[] }` where `ctx = { local: Map<string, Component>; dataFields: Map<string, Component> }`.
  - This task implements ONLY the grant idioms inside `extractConnections`; later tasks extend the same function. The function returns connections with deterministic ids `e${n}` assigned in source order.

- [ ] **Step 1: Write the failing test**

`packages/import/test/connections.grants.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { Project } from "ts-morph"
import { extractConnections } from "../src/connections"
import type { Component } from "../src/types"

function parse(code: string) {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile("s.ts", code)
}
const comp = (id: string, kind: Component["kind"]): Component => ({
  id, kind, name: id, capabilityIds: [], tags: [], metadata: {},
})

describe("extractConnections — grants", () => {
  const ctx = {
    local: new Map([["handoffLambda", comp("handoffLambda", "service")]]),
    dataFields: new Map([
      ["stateTokensTable", comp("stateTokensTable", "datastore")],
      ["gatewayCredentialsTable", comp("gatewayCredentialsTable", "datastore")],
      ["webhookEventsQueue", comp("webhookEventsQueue", "queue")],
    ]),
  }

  it("grantWriteData becomes a hard data-write edge from grantee to resource", () => {
    const src = parse(`this.data.stateTokensTable.grantWriteData(handoffLambda)`)
    const { connections } = extractConnections(src, ctx)
    expect(connections).toHaveLength(1)
    const e = connections[0]
    expect(e.fromId).toBe("handoffLambda")
    expect(e.toId).toBe("stateTokensTable")
    expect(e.kind).toBe("data-write")
    expect(e.criticality).toBe("hard")
    expect(e.optional).toBe(false)
  })

  it("grantReadData becomes a hard data-read edge", () => {
    const src = parse(`this.data.gatewayCredentialsTable.grantReadData(handoffLambda)`)
    const { connections } = extractConnections(src, ctx)
    expect(connections[0].kind).toBe("data-read")
  })

  it("grantSendMessages becomes a soft optional async-event edge", () => {
    const src = parse(`this.data.webhookEventsQueue.grantSendMessages(handoffLambda)`)
    const { connections } = extractConnections(src, ctx)
    expect(connections[0].kind).toBe("async-event")
    expect(connections[0].criticality).toBe("soft")
    expect(connections[0].optional).toBe(true)
  })

  it("an unresolvable grantee yields a warn diagnostic, not a dropped edge", () => {
    const src = parse(`this.data.stateTokensTable.grantReadData(ghostLambda)`)
    const { connections, diagnostics } = extractConnections(src, ctx)
    expect(connections).toHaveLength(0)
    expect(diagnostics.some(d => d.level === "warn")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/connections.grants.test.ts`
Expected: FAIL — cannot find module `../src/connections`.

- [ ] **Step 3: Write the connection matcher (grants only)**

`packages/import/src/connections.ts`:
```ts
import { SyntaxKind, type SourceFile, type CallExpression } from "ts-morph"
import { resolveRef } from "./crossFile"
import type { Component, Connection, ConnectionKind, Criticality, Diagnostic } from "./types"

export interface ConnContext {
  local: Map<string, Component>
  dataFields: Map<string, Component>
}

interface ConnResult {
  connections: Connection[]
  diagnostics: Diagnostic[]
}

interface EdgeSpec {
  kind: ConnectionKind
  criticality: Criticality
  optional: boolean
}

const GRANT_EDGE: Record<string, EdgeSpec> = {
  grantReadData: { kind: "data-read", criticality: "hard", optional: false },
  grantWriteData: { kind: "data-write", criticality: "hard", optional: false },
  grantReadWriteData: { kind: "data-write", criticality: "hard", optional: false },
  grantRead: { kind: "data-read", criticality: "hard", optional: false },
  grantSendMessages: { kind: "async-event", criticality: "soft", optional: true },
  grantConsumeMessages: { kind: "async-event", criticality: "soft", optional: true },
}

function calleeParts(call: CallExpression): { receiver: string; method: string } | undefined {
  const propAccess = call.getExpressionIfKind(SyntaxKind.PropertyAccessExpression)
  if (!propAccess) return undefined
  return { receiver: propAccess.getExpression().getText(), method: propAccess.getName() }
}

export function extractConnections(source: SourceFile, ctx: ConnContext): ConnResult {
  const connections: Connection[] = []
  const diagnostics: Diagnostic[] = []
  let counter = 0
  const nextId = () => `e${++counter}`

  function pushEdge(fromText: string, toText: string, spec: EdgeSpec, line: number, label?: string) {
    const from = resolveRef(fromText, ctx.local, ctx.dataFields)
    const to = resolveRef(toText, ctx.local, ctx.dataFields)
    if (!from.component || !to.component) {
      diagnostics.push({
        level: "warn", code: "UNRESOLVED_EDGE",
        message: `Edge skipped: ${from.reason}; ${to.reason}`, line,
      })
      return
    }
    connections.push({
      id: nextId(),
      fromId: from.component.id,
      toId: to.component.id,
      kind: spec.kind,
      criticality: spec.criticality,
      optional: spec.optional,
      tags: [],
      description: label,
    })
  }

  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const parts = calleeParts(call)
    if (!parts) continue
    const grant = GRANT_EDGE[parts.method]
    if (grant) {
      const granteeArg = call.getArguments()[0]
      if (!granteeArg) continue
      // resource (parts.receiver) grants to grantee → edge from grantee to resource
      pushEdge(granteeArg.getText(), parts.receiver, grant, call.getStartLineNumber(), parts.method)
    }
  }

  return { connections, diagnostics }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/connections.grants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/import/src/connections.ts packages/import/test/connections.grants.test.ts
git commit -m "feat: extract IAM grant calls into typed connections"
```

---

### Task 6: Connection matcher — integrations, event sources, DLQ, subscriptions

**Files:**
- Modify: `packages/import/src/connections.ts`
- Test: `packages/import/test/connections.wiring.test.ts`

**Interfaces:**
- Consumes/extends the `extractConnections` from Task 5 — same signature, same `e${n}` id scheme, edges appended in source order after grants.
- Produces: edges for `HttpLambdaIntegration` (sync-call, hard), `addEventSource`/`SqsEventSource` (async-event, soft/optional), `deadLetterQueue` (async-event, soft/optional), `addSubscription`/`LambdaSubscription` (async-event, soft/optional).

- [ ] **Step 1: Write the failing test**

`packages/import/test/connections.wiring.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { Project } from "ts-morph"
import { extractConnections } from "../src/connections"
import type { Component } from "../src/types"

function parse(code: string) {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile("s.ts", code)
}
const comp = (id: string, kind: Component["kind"]): Component => ({
  id, kind, name: id, capabilityIds: [], tags: [], metadata: {},
})

const ctx = {
  local: new Map([
    ["httpApi", comp("httpApi", "external")],
    ["handoffLambda", comp("handoffLambda", "service")],
    ["webhookProcessLambda", comp("webhookProcessLambda", "service")],
    ["alarmTopic", comp("alarmTopic", "queue")],
    ["alarmNotifierLambda", comp("alarmNotifierLambda", "service")],
    ["webhookEventsQueue", comp("webhookEventsQueue", "queue")],
    ["webhookEventsDlq", comp("webhookEventsDlq", "queue")],
  ]),
  dataFields: new Map([["webhookEventsQueue", comp("webhookEventsQueue", "queue")]]),
}

describe("extractConnections — wiring", () => {
  it("HttpLambdaIntegration becomes a hard sync-call from api to lambda", () => {
    const src = parse(`
      httpApi.addRoutes({
        path: "/installations/handoff",
        integration: new apigatewayv2Integrations.HttpLambdaIntegration("HandoffIntegration", handoffLambda),
      })
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.kind === "sync-call")
    expect(e).toBeDefined()
    expect(e!.fromId).toBe("httpApi")
    expect(e!.toId).toBe("handoffLambda")
    expect(e!.criticality).toBe("hard")
    expect(e!.description).toBe("/installations/handoff")
  })

  it("addEventSource(SqsEventSource(queue)) becomes async-event from queue to lambda", () => {
    const src = parse(`
      webhookProcessLambda.addEventSource(new lambdaEventSources.SqsEventSource(this.data.webhookEventsQueue, { batchSize: 5 }))
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.kind === "async-event")
    expect(e!.fromId).toBe("webhookEventsQueue")
    expect(e!.toId).toBe("webhookProcessLambda")
    expect(e!.optional).toBe(true)
  })

  it("deadLetterQueue option becomes async-event from queue to dlq", () => {
    const src = parse(`
      const webhookEventsQueue = new sqs.Queue(this, "Q", {
        deadLetterQueue: { queue: webhookEventsDlq, maxReceiveCount: 3 },
      })
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.toId === "webhookEventsDlq")
    expect(e).toBeDefined()
    expect(e!.fromId).toBe("webhookEventsQueue")
    expect(e!.kind).toBe("async-event")
  })

  it("addSubscription(LambdaSubscription(fn)) becomes async-event from topic to lambda", () => {
    const src = parse(`
      alarmTopic.addSubscription(new snsSubscriptions.LambdaSubscription(alarmNotifierLambda))
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.fromId === "alarmTopic")
    expect(e!.toId).toBe("alarmNotifierLambda")
    expect(e!.kind).toBe("async-event")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/connections.wiring.test.ts`
Expected: FAIL — the integration/event-source/DLQ/subscription edges are not produced yet.

- [ ] **Step 3: Extend `extractConnections`**

In `packages/import/src/connections.ts`, add the wiring matchers inside the existing `for` loop over call expressions, plus a separate pass for `deadLetterQueue`. Append after the grant block, before the loop ends:

```ts
    // ── HttpLambdaIntegration inside addRoutes({ path, integration }) ──
    if (parts.method === "addRoutes") {
      const optionsArg = call.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
      if (optionsArg) {
        const pathText = optionsArg.getProperty("path")?.getFirstDescendantByKind(SyntaxKind.StringLiteral)?.getLiteralText()
        const integrationProp = optionsArg.getProperty("integration")
        const integ = integrationProp?.getFirstDescendantByKind(SyntaxKind.NewExpression)
        if (integ && integ.getExpression().getText().includes("HttpLambdaIntegration")) {
          const lambdaArg = integ.getArguments()[1] ?? integ.getArguments()[0]
          if (lambdaArg) {
            pushEdge(parts.receiver, lambdaArg.getText(),
              { kind: "sync-call", criticality: "hard", optional: false },
              call.getStartLineNumber(), pathText)
          }
        }
      }
    }

    // ── fn.addEventSource(new SqsEventSource(queue, ...)) ──
    if (parts.method === "addEventSource") {
      const srcExpr = call.getArguments()[0]?.asKind(SyntaxKind.NewExpression)
      const queueArg = srcExpr?.getArguments()[0]
      if (queueArg) {
        pushEdge(queueArg.getText(), parts.receiver,
          { kind: "async-event", criticality: "soft", optional: true },
          call.getStartLineNumber(), "event source")
      }
    }

    // ── topic.addSubscription(new LambdaSubscription(fn)) ──
    if (parts.method === "addSubscription") {
      const subExpr = call.getArguments()[0]?.asKind(SyntaxKind.NewExpression)
      const fnArg = subExpr?.getArguments()[0]
      if (fnArg) {
        pushEdge(parts.receiver, fnArg.getText(),
          { kind: "async-event", criticality: "soft", optional: true },
          call.getStartLineNumber(), "subscription")
      }
    }
```

Then, after the call-expression loop (still inside `extractConnections`, before `return`), add the DLQ pass:

```ts
  // ── deadLetterQueue: { queue: <dlq> } inside a Queue construction ──
  for (const newExpr of source.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    if (!newExpr.getExpression().getText().includes("Queue")) continue
    const opts = newExpr.getArguments()[2]?.asKind(SyntaxKind.ObjectLiteralExpression)
    const dlqProp = opts?.getProperty("deadLetterQueue")?.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression)
    const queueRef = dlqProp?.getProperty("queue")?.getFirstDescendantByKind(SyntaxKind.Identifier)?.getText()
    if (!queueRef) continue
    const ownerVar =
      newExpr.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ??
      (() => {
        const bin = newExpr.getFirstAncestorByKind(SyntaxKind.BinaryExpression)
        const left = bin?.getLeft().getText()
        return left?.startsWith("this.") ? left.slice(5) : left
      })()
    if (!ownerVar) continue
    pushEdge(ownerVar, queueRef,
      { kind: "async-event", criticality: "soft", optional: true },
      newExpr.getStartLineNumber(), "dead-letter")
  }
```

- [ ] **Step 4: Run both connection test files to verify they pass**

Run: `npx vitest run test/connections.grants.test.ts test/connections.wiring.test.ts`
Expected: PASS (grants unaffected; wiring now produced).

- [ ] **Step 5: Commit**

```bash
git add packages/import/src/connections.ts packages/import/test/connections.wiring.test.ts
git commit -m "feat: extract API integrations, event sources, DLQ, and SNS subs"
```

---

### Task 7: CdkImporter orchestration + validation

**Files:**
- Create: `packages/import/src/cdkImporter.ts`
- Test: `packages/import/test/cdkImporter.test.ts`

**Interfaces:**
- Consumes: `extractComponents`, `extractConnections`, the engine `validate`.
- Produces: `CdkImporter: ImporterPlugin`. Its `import(files, opts)` reads each file with ts-morph, runs `extractComponents` per file (tagging by the file's stack class name), builds the combined `dataFields` map (union of all files' producers) and a per-file `local` map, runs `extractConnections` per file, assembles one `Model`, runs `validate`, and throws if invalid. `detect(workspace)` returns true if any `*.ts` under the dir imports `aws-cdk-lib`.

- [ ] **Step 1: Write the failing test**

`packages/import/test/cdkImporter.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CdkImporter } from "../src/cdkImporter"

function tmpProject(files: Record<string, string>): { dir: string; paths: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "cdk-"))
  const paths: string[] = []
  for (const [name, body] of Object.entries(files)) {
    const p = join(dir, name)
    writeFileSync(p, body)
    paths.push(p)
  }
  return { dir, paths }
}

describe("CdkImporter", () => {
  it("imports a two-file project into one validated model", () => {
    const { paths } = tmpProject({
      "data.ts": `
        import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
        export class GatewayDataStack {
          constructor() {
            this.installationsTable = new dynamodb.Table(this, "T", { tableName: "t" })
          }
        }
      `,
      "app.ts": `
        import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs"
        export class GatewayAppStack {
          constructor() {
            const handoffLambda = new lambdaNodejs.NodejsFunction(this, "H", {})
            this.data.installationsTable.grantReadData(handoffLambda)
          }
        }
      `,
    })
    const result = CdkImporter.import(paths, { systemId: "gw", systemName: "Gateway" })
    expect(result.model.system.id).toBe("gw")
    expect(result.model.components.map(c => c.id).sort()).toEqual(["handoffLambda", "installationsTable"])
    const edge = result.model.connections[0]
    expect(edge.fromId).toBe("handoffLambda")
    expect(edge.toId).toBe("installationsTable")
    expect(edge.kind).toBe("data-read")
  })

  it("detect() is true when a file imports aws-cdk-lib", () => {
    const { dir } = tmpProject({ "x.ts": `import * as cdk from "aws-cdk-lib"` })
    expect(CdkImporter.detect(dir)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cdkImporter.test.ts`
Expected: FAIL — cannot find module `../src/cdkImporter`.

- [ ] **Step 3: Write the importer**

`packages/import/src/cdkImporter.ts`:
```ts
import { Project, SyntaxKind, type SourceFile } from "ts-morph"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { extractComponents } from "./components"
import { extractConnections } from "./connections"
import { validate } from "../../../prototypes/elk-renderer/src/engine/engine"
import type { Component, Diagnostic, ImporterPlugin, ImportOptions, ImportResult, Model } from "./types"

function stackTagOf(source: SourceFile): string {
  const cls = source.getClasses()[0]
  return cls?.getName() ?? "UnknownStack"
}

export const CdkImporter: ImporterPlugin = {
  id: "cdk",

  detect(workspace: string): boolean {
    let found = false
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory() && entry.name !== "node_modules") walk(full)
        else if (entry.name.endsWith(".ts") && readFileSync(full, "utf8").includes("aws-cdk-lib")) found = true
      }
    }
    walk(workspace)
    return found
  },

  import(files: string[], opts: ImportOptions): ImportResult {
    const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true })
    const sources = files.map(f => project.addSourceFileAtPath(f))

    const components: Component[] = []
    const diagnostics: Diagnostic[] = []
    const dataFields = new Map<string, Component>()
    const perFileLocal = new Map<SourceFile, Map<string, Component>>()

    for (const source of sources) {
      const tag = stackTagOf(source)
      const { components: comps, byVarName, diagnostics: diags } = extractComponents(source, tag)
      components.push(...comps)
      diagnostics.push(...diags)
      perFileLocal.set(source, byVarName)
      for (const [name, comp] of byVarName) dataFields.set(name, comp) // producers visible cross-file
    }

    const connections = []
    for (const source of sources) {
      const local = perFileLocal.get(source)!
      const { connections: conns, diagnostics: diags } = extractConnections(source, { local, dataFields })
      connections.push(...conns)
      diagnostics.push(...diags)
    }
    // reassign globally-unique connection ids in collection order
    connections.forEach((c, i) => (c.id = `e${i + 1}`))

    const model: Model = {
      system: { id: opts.systemId ?? "system", name: opts.systemName ?? "System" },
      components,
      connections,
      capabilities: [],
      owners: [],
    }

    const validation = validate(model)
    if (!validation.ok) {
      throw new Error(
        `Imported model failed validation:\n` +
          validation.errors.map(e => `  [${e.code}] ${e.path}: ${e.message}`).join("\n"),
      )
    }

    return { model, diagnostics }
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cdkImporter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/import/src/cdkImporter.ts packages/import/test/cdkImporter.test.ts
git commit -m "feat: assemble and validate full model in CdkImporter"
```

---

### Task 8: Golden-file test against the real gateway

**Files:**
- Test: `packages/import/test/golden.test.ts`

**Interfaces:**
- Consumes: `CdkImporter` from `./cdkImporter`. Reads the real CDK files from an absolute path (skips gracefully if absent, so the suite is portable).

- [ ] **Step 1: Write the test**

`packages/import/test/golden.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { existsSync } from "node:fs"
import { CdkImporter } from "../src/cdkImporter"

const LIB = "/Users/eaugusto/codurance/github/github-app-gateway/infra/lib"
const FILES = [
  "gateway-data-stack.ts",
  "gateway-app-stack.ts",
].map(f => `${LIB}/${f}`)

const present = FILES.every(existsSync)
const maybe = present ? describe : describe.skip

maybe("golden: github-app-gateway", () => {
  const result = CdkImporter.import(FILES, { systemId: "github-app-gateway", systemName: "GitHub App Gateway" })

  it("extracts 20 components", () => {
    expect(result.model.components).toHaveLength(20)
  })

  it("extracts 27 connections", () => {
    expect(result.model.connections).toHaveLength(27)
  })

  it("includes the key Blast-Radius-relevant edge: webhookProcessLambda writes installationsTable", () => {
    const edge = result.model.connections.find(
      c => c.fromId === "webhookProcessLambda" && c.toId === "installationsTable",
    )
    expect(edge).toBeDefined()
    expect(edge!.kind).toBe("data-write")
    expect(edge!.criticality).toBe("hard")
  })

  it("models the HTTP API as an external component with the apigw subtype", () => {
    const api = result.model.components.find(c => c.id === "httpApi")
    expect(api?.kind).toBe("external")
    expect(api?.metadata.subtype).toBe("aws:apigw")
  })

  it("produces a valid model (no diagnostics at warn level for resolved edges)", () => {
    const warns = result.diagnostics.filter(d => d.level === "warn")
    expect(warns).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the golden test**

Run: `npx vitest run test/golden.test.ts`
Expected: PASS (20 components, 27 connections, key edge present). If counts differ, the discrepancy is the spec's honest-coverage signal — inspect `result.diagnostics`, fix the matcher or update the count with a comment explaining why, then re-run.

- [ ] **Step 3: Commit**

```bash
git add packages/import/test/golden.test.ts
git commit -m "test: golden-file import of the real github-app-gateway"
```

---

### Task 9: CLI

**Files:**
- Create: `packages/import/src/cli.ts`
- Test: `packages/import/test/cli.test.ts`

**Interfaces:**
- Consumes: `CdkImporter`. Produces a CLI: `cdk-import <dir> -o <out>.system.json` — globs `*.ts` under `<dir>`, imports, writes the model JSON (2-space indent, trailing newline), prints a diagnostics summary to stderr, exits non-zero on validation error.

- [ ] **Step 1: Write the failing test**

`packages/import/test/cli.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("cli", () => {
  it("writes a system.json from a CDK dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-"))
    writeFileSync(join(dir, "stack.ts"), `
      import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
      export class MyStack {
        constructor() {
          const usersTable = new dynamodb.Table(this, "U", { tableName: "u" })
        }
      }
    `)
    const out = join(dir, "out.system.json")
    execFileSync("npx", ["tsx", "src/cli.ts", dir, "-o", out], { cwd: process.cwd() })
    const model = JSON.parse(readFileSync(out, "utf8"))
    expect(model.components[0].id).toBe("usersTable")
    expect(model.components[0].metadata.subtype).toBe("aws:dynamodb")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — `src/cli.ts` does not exist.

- [ ] **Step 3: Write the CLI**

`packages/import/src/cli.ts`:
```ts
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { CdkImporter } from "./cdkImporter"

function parseArgs(argv: string[]): { dir: string; out: string } {
  const dir = argv[0]
  const oIdx = argv.indexOf("-o")
  if (!dir || oIdx === -1 || !argv[oIdx + 1]) {
    console.error("usage: cdk-import <dir> -o <out>.system.json")
    process.exit(2)
  }
  return { dir, out: argv[oIdx + 1] }
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map(e => join(dir, e.name))
}

function main() {
  const { dir, out } = parseArgs(process.argv.slice(2))
  const files = tsFiles(dir)
  if (files.length === 0) {
    console.error(`no .ts files found in ${dir}`)
    process.exit(2)
  }
  try {
    const result = CdkImporter.import(files, {
      systemId: dir.split("/").filter(Boolean).slice(-2).join("-"),
      systemName: dir.split("/").filter(Boolean).pop(),
    })
    writeFileSync(out, JSON.stringify(result.model, null, 2) + "\n")
    const counts = `${result.model.components.length} components, ${result.model.connections.length} connections`
    console.error(`wrote ${out} — ${counts}`)
    for (const d of result.diagnostics) console.error(`  [${d.level}] ${d.code}: ${d.message}`)
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  }
}

main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the real artifact + commit**

```bash
cd packages/import
npx tsx src/cli.ts /Users/eaugusto/codurance/github/github-app-gateway/infra/lib -o ../../examples/github-app-gateway.system.json
cd ../..
git add packages/import/src/cli.ts packages/import/test/cli.test.ts examples/github-app-gateway.system.json
git commit -m "feat: add cdk-import CLI and generate gateway example model"
```

---

### Task 10: Renderer icon layer (the one renderer touch)

**Files:**
- Create: `prototypes/elk-renderer/src/renderer/icons.ts`
- Modify: `prototypes/elk-renderer/src/renderer/Graph.tsx`
- Test: `prototypes/elk-renderer/src/renderer/icons.test.ts`

**Interfaces:**
- Consumes: `Component.metadata.subtype` (string | undefined).
- Produces: `iconForSubtype(subtype: string | undefined): IconDef | undefined` where `IconDef = { id: string; label: string }`. `Graph.tsx` renders the label badge when an icon is present; falls back to the existing abstract shape otherwise (non-AWS models unchanged).

- [ ] **Step 1: Write the failing test**

`prototypes/elk-renderer/src/renderer/icons.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { iconForSubtype } from "./icons"

describe("iconForSubtype", () => {
  it("returns a labeled icon for a known aws subtype", () => {
    expect(iconForSubtype("aws:lambda")).toEqual({ id: "lambda", label: "Lambda" })
  })
  it("returns undefined for no subtype (non-AWS models render as before)", () => {
    expect(iconForSubtype(undefined)).toBeUndefined()
  })
  it("returns undefined for an unknown subtype", () => {
    expect(iconForSubtype("gcp:run")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `prototypes/elk-renderer`): `npx vitest run src/renderer/icons.test.ts`
Expected: FAIL — cannot find module `./icons`. (If vitest is not yet a dep of the prototype, add it: `npm i -D vitest` in `prototypes/elk-renderer`, then re-run.)

- [ ] **Step 3: Write the icon map**

`prototypes/elk-renderer/src/renderer/icons.ts`:
```ts
export interface IconDef {
  id: string
  label: string
}

const ICONS: Record<string, IconDef> = {
  "aws:lambda": { id: "lambda", label: "Lambda" },
  "aws:dynamodb": { id: "dynamodb", label: "DynamoDB" },
  "aws:sqs": { id: "sqs", label: "SQS" },
  "aws:sns": { id: "sns", label: "SNS" },
  "aws:secret": { id: "secret", label: "Secrets Manager" },
  "aws:apigw": { id: "apigw", label: "API Gateway" },
  "aws:eventbridge": { id: "eventbridge", label: "EventBridge" },
  "aws:cloudwatch": { id: "cloudwatch", label: "CloudWatch" },
  "aws:route53": { id: "route53", label: "Route 53" },
  "aws:acm": { id: "acm", label: "ACM" },
}

export function iconForSubtype(subtype: string | undefined): IconDef | undefined {
  return subtype ? ICONS[subtype] : undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/icons.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the badge into Graph.tsx**

In `prototypes/elk-renderer/src/renderer/Graph.tsx`, import the helper and render a small service-label badge above each node's name when present. Add near the top:

```tsx
import { iconForSubtype } from "./icons"
```

Then, where each node's text/label is rendered (inside the per-node group, alongside the existing name `<text>`), add:

```tsx
{(() => {
  const icon = iconForSubtype(node.metadata?.subtype as string | undefined)
  return icon ? (
    <text
      className="aws-badge"
      x={NODE_PADDING_X}
      y={BADGE_Y}
      fontSize={10}
      fill={COLORS.mutedInk}
    >
      {icon.label}
    </text>
  ) : null
})()}
```

Define the two layout constants near the other node-geometry constants in the file (use values consistent with existing node padding; if the file already has an `x`/`y` text offset, reuse it):

```tsx
const NODE_PADDING_X = 12
const BADGE_Y = 14
```

(If `node.metadata` is not already in scope at the render site, thread the component's `metadata` through the same way `node.name`/`node.kind` are already passed to the renderer.)

- [ ] **Step 6: Verify the renderer builds**

Run (from `prototypes/elk-renderer`): `npm run build`
Expected: `tsc -b && vite build` completes with no type errors.

- [ ] **Step 7: Commit**

```bash
git add prototypes/elk-renderer/src/renderer/icons.ts prototypes/elk-renderer/src/renderer/icons.test.ts prototypes/elk-renderer/src/renderer/Graph.tsx prototypes/elk-renderer/package.json
git commit -m "feat: render AWS service badge from component subtype"
```

---

### Task 11: Wire the gateway model into the renderer + capture proof

**Files:**
- Modify: `prototypes/elk-renderer/src/store/visionStore.ts` (or wherever fixtures are registered) — add the generated gateway model as a selectable system.
- Create: `examples/github-app-gateway.system.json` (already generated in Task 9; this task loads it).
- Create: `prototypes/elk-renderer/screenshots/14-github-app-gateway.png` (captured proof).

**Interfaces:**
- Consumes: `examples/github-app-gateway.system.json` (the engine `Model`), `iconForSubtype`.

- [ ] **Step 1: Load the gateway model as a fixture**

Inspect `prototypes/elk-renderer/src/store/visionStore.ts` and `src/fixtures/checkout.ts` to see how `checkout` is registered. Add a sibling import of the generated JSON and register it under the same mechanism, e.g.:

```ts
import gatewayModel from "../../../examples/github-app-gateway.system.json"
// register `gatewayModel as Model` alongside `checkout` in the systems list
```

Ensure `resolveJsonModule` is enabled in `prototypes/elk-renderer/tsconfig.json` (`"resolveJsonModule": true`); add it if missing.

- [ ] **Step 2: Run the renderer and confirm it draws**

Run (from `prototypes/elk-renderer`): `npm run dev`
Expected: the dev server starts; selecting "GitHub App Gateway" renders 20 nodes (Lambdas, tables, queues, API, topic) with AWS badges and edges. Manually confirm the API→lambda sync-calls and lambda→table data edges are visible.

- [ ] **Step 3: Capture a screenshot**

Take a screenshot of the rendered gateway and save it as `prototypes/elk-renderer/screenshots/14-github-app-gateway.png`. (Use the browser-automation tooling or a manual capture.)

- [ ] **Step 4: Commit the proof**

```bash
git add prototypes/elk-renderer/src/store/visionStore.ts prototypes/elk-renderer/tsconfig.json prototypes/elk-renderer/screenshots/14-github-app-gateway.png
git commit -m "feat: render the github-app-gateway model with AWS badges"
```

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- Plugin contract (`ImporterPlugin`/`ImportResult`/`Diagnostic`) → Task 1. ✓
- Static AST extraction, no aws-cdk-lib/synth → Tasks 3,5,6,7 (ts-morph only). ✓
- AWS vocabulary via `metadata.subtype`, no schema change → Tasks 2,3. ✓
- Component mapping table → Task 2 subtype map. ✓
- Edge mapping table (grants, integration, event source, DLQ, subscription) → Tasks 5,6. ✓
- Cross-file `this.data` resolution → Task 4, used in Task 7. ✓
- Diagnostics-not-drops → Tasks 3,5,6 (every unresolved ref emits a diagnostic). ✓
- One model per directory, stack-as-tag → Task 3 (`stack:` tag), Task 7 (single model). ✓
- `LogGroup`/`CfnOutput` excluded as noise → Task 3 (info diagnostic, not modeled). ✓
- Validate-or-fail → Task 7 (throws on invalid). ✓
- CLI `cdk-import <dir> -o <out>` → Task 9. ✓
- Renderer one-touch icon layer → Task 10. ✓
- Golden-file test (20/27, key edge) → Task 8. ✓
- Proof: committed `.system.json` + screenshot → Tasks 9,11. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step shows full code. The one soft spot is Task 10 Step 5 (the exact Graph.tsx insertion point depends on the existing render structure) and Task 11 Step 1 (fixture registration mechanism); both instruct the engineer to inspect the named existing file and follow its established pattern, with the concrete code to insert provided.

**Type consistency:** `extractComponents` returns `{ components, byVarName, diagnostics }` — same shape consumed in Tasks 5 and 7. `extractConnections(source, ctx)` with `ctx = { local, dataFields }` — identical in Tasks 5, 6, 7. `resolveRef(refText, local, dataFields)` — identical in Tasks 4, 5. `Diagnostic.level` is `"info" | "warn"` everywhere. Connection ids are `e${n}`, reassigned globally in Task 7. `iconForSubtype` returns `IconDef | undefined` in Tasks 10, 11.
