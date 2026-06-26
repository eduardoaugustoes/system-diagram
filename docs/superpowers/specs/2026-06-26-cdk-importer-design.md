# Design — CDK → typed-Model importer (Importer plugin #1)

**Status:** Approved · 2026-06-26
**Author:** Eduardo
**Relates to:** ADR 0019 (typed system models), POC 0020 (engine/renderer contracts)

## Problem

The `system-diagram` POC (`prototypes/elk-renderer`) renders a typed `Model`
(components + connections, with `criticality`/`optional` driving the Blast Radius
lens). Today that `Model` is **hand-authored TypeScript** (`fixtures/checkout.ts`).

We want to generate a `Model` automatically from real AWS CDK infrastructure-as-code
— the `github-app-gateway/infra/lib/*.ts` stacks — so a live system can be diagrammed
and reasoned about by the existing lens instead of hand-drawn.

Two constraints shaped the design (from brainstorming):

1. The diagram must **self-explain the AWS infrastructure** — a Lambda must look like
   a Lambda, not collapse into a generic "service". The current six abstract `kind`s
   are cloud-agnostic and lose AWS identity.
2. This should be the **first step of an architecture evolution**, not a one-off:
   CDK today, Terraform / Pulumi / k8s as future sources behind the same seam.

## Approach

A new package **`@system-diagram/import`** defines one plugin contract and ships one
implementation, `CdkImporter`. It produces the **existing engine `Model`** — the
engine, the Blast Radius lens, and the ELK renderer are **untouched**. AWS richness is
carried in the `Component.metadata` bag (already in the schema), so no schema change
and non-AWS models render exactly as before.

Extraction is **static AST parsing** (ts-morph): no AWS credentials, no `cdk synth`,
deterministic and offline. Anything that can't be statically resolved becomes a
`Diagnostic`, never a silently dropped edge.

### Rejected alternatives

- **`cdk synth` → CloudFormation walk** — needs a working build + bootstrapped context;
  IAM-statement-level edges are noisier than grant calls. Lower signal, higher setup.
- **LLM reads the files** — non-deterministic; not a reproducible build step. Fine as a
  one-off, wrong as a renderer.
- **CDK-only with no plugin contract** — cheaper now, but the "architecture evolution"
  becomes a retrofit. The seam is thin enough to define up front.

## Architecture

```
@system-diagram/import
  ImporterPlugin (contract)
    CdkImporter (plugin #1, built now)
      ts-morph parse .ts
        -> component matchers   (new X.Resource(...))
        -> connection matchers  (grants, integrations, event sources)
        -> assembler            -> Model
        -> engine.validate()
        -> .system.json + diagnostics
    [TerraformImporter]  (future, same seam)
    [PulumiImporter]     (future, same seam)
                |
   metadata.subtype -> icon  (one addition to renderer styleTable)
                |
   existing engine + Blast Radius lens + ELK renderer  (UNCHANGED)
```

### Plugin contract

```ts
interface ImporterPlugin {
  id: string                                  // "cdk"
  detect(workspace: string): boolean          // are there CDK files here?
  import(files: string[], opts: ImportOptions): ImportResult
}

interface ImportResult {
  model: Model                                // existing engine Model, unchanged shape
  diagnostics: Diagnostic[]                   // honest coverage: what was skipped & why
}

interface Diagnostic {
  level: "info" | "warn"
  code: string                                // e.g. "UNRESOLVED_CROSS_FILE_REF"
  message: string
  file?: string
  line?: number
}
```

## AWS vocabulary (non-breaking)

The six abstract `kind`s stay load-bearing — the Blast Radius lens classifies blocking
edges off `kind` + `criticality` + `optional`, so those must remain meaningful. AWS
richness rides in `metadata`:

```ts
metadata: { subtype: "aws:lambda", awsService: "Lambda", icon: "lambda" }
```

### Component mapping (v1 — only services this gateway uses)

| CDK construct | abstract `kind` | `subtype` | renders as |
|---|---|---|---|
| `lambdaNodejs.NodejsFunction` | `service` | `aws:lambda` | Lambda icon + name |
| `dynamodb.Table` | `datastore` | `aws:dynamodb` | DynamoDB icon |
| `sqs.Queue` | `queue` | `aws:sqs` | SQS icon (DLQ badged) |
| `sns.Topic` | `queue` | `aws:sns` | SNS icon |
| `secretsmanager.Secret` | `datastore` | `aws:secret` | Secrets Manager icon |
| `apigatewayv2.HttpApi` | `external` | `aws:apigw` | API Gateway icon |
| `events.Rule` | `job` | `aws:eventbridge` | EventBridge icon |
| `cloudwatch.Alarm` / `Dashboard` | `job` | `aws:cloudwatch` | CloudWatch icon |
| `route53` record / `acm` cert | `external` | `aws:route53` / `aws:acm` | respective icons |

The subtype map is an extensible table — add an entry when a new file needs a service.
`logs.LogGroup` and `CfnOutput` are **not** modeled as components (noise; they clutter
the topology without adding lens signal). They may surface as `info` diagnostics.

### Renderer change (the only touch outside the new package)

`styleTable.ts` gains one lookup: `metadata.subtype → icon`, falling back to the abstract
shape when no subtype is present. Non-AWS models (e.g. `checkout`) are unaffected.

## Edge extraction

Direction and criticality are read directly from CDK idioms — this is the payoff: the
signal the Blast Radius lens needs comes straight from real IaC.

| CDK idiom | Connection `kind` | criticality / optional | rationale |
|---|---|---|---|
| `table.grantReadData(fn)` | `data-read` | hard / false | fn depends on the read |
| `table.grantWriteData(fn)` / `grantReadWriteData` | `data-write` | hard / false | fn depends on the write |
| `queue.grantSendMessages(fn)` | `async-event` | soft / true | fire-and-forget enqueue |
| `HttpLambdaIntegration` + `addRoutes(...)` | `sync-call` | hard / false | API invokes fn synchronously |
| `fn.addEventSource(SqsEventSource(q))` | `async-event` | soft / true | queue drives fn |
| `deadLetterQueue: { queue: dlq }` | `async-event` | soft / true | overflow path |
| `topic.addSubscription(LambdaSubscription(fn))` | `async-event` | soft / true | pub/sub fan-out |

Grant **direction** gives edge direction; grant **type** gives criticality. The
`grant*Data` family is hard (a denied read breaks the caller); the `grantSendMessages`
/ event-source family is soft + optional (buffered, retried, fire-and-forget).

## Scope decisions (resolved, not open)

1. **One `Model` per `infra/lib/` directory**, not per stack. The whole gateway is one
   system; each CDK Stack becomes a `tag` on its components (`stack:GatewayDataStack`)
   so data-plane vs. app-plane is still legible. Per-stack models would fragment the one
   diagram we actually want.
2. **AWS richness via `metadata.subtype`**, not new `kind` enum values. Keeps the lens
   and validator untouched; keeps non-AWS models rendering as today.
3. **Cross-file references resolved by public-field type matching** (app-stack consumes
   `GatewayDataStack`'s `public readonly` `ITable`/`IQueue` fields). Anything not
   statically resolvable becomes a `Diagnostic`, never a dropped edge. Silent truncation
   reads as "complete" when it isn't.

## Deliverable

- **Package** `@system-diagram/import` exporting `ImporterPlugin` + `CdkImporter`.
- **CLI** `cdk-import <dir> -o <out>.system.json` (+ prints a diagnostics summary).
- The existing `elk-renderer` then draws the output — no renderer changes beyond the
  one `styleTable` icon lookup.

## Testing

- **Unit tests per matcher** — one test per component idiom and per edge idiom, against
  small inline `.ts` snippets.
- **Golden-file test** — import the real `github-app-gateway/infra/lib/*.ts`, assert
  component count, connection count, and a handful of Blast-Radius-relevant edges
  (e.g. `webhookProcessLambda --data-write--> installationsTable`).
- **Diagnostics test** — assert that an intentionally unresolvable reference produces a
  `warn` diagnostic rather than a missing edge.

## Proof of completion

A committed `github-app-gateway.system.json` plus a rendered screenshot from the
existing renderer — we *show* the diagram, not just assert the importer ran.

## Error handling

- Parse failure on a file → `warn` diagnostic for that file; continue with the rest.
- `engine.validate()` failure on the assembled `Model` → hard error (the importer must
  not emit an invalid model); the validation errors surface to the CLI.
- Unknown construct (no subtype-map entry) → `info` diagnostic; the component is still
  emitted with its abstract `kind` and no subtype (renders with the fallback shape).

## Future work (out of scope for v1)

- Terraform / Pulumi importers behind the same `ImporterPlugin` seam.
- Broader AWS icon set (v1 ships only the ~10 services this repo uses).
- Resolving dynamically/loop-constructed resources (v1 reports them as diagnostics).
