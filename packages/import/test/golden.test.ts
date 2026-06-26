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

  // 9 data-stack resources + 9 Lambdas + HTTP API + SNS topic + CloudWatch
  // Dashboard + CloudWatch Alarm = 22. (The EventBridge Rule at line 943 is
  // constructed inline with no variable binding, so it has no node id and is
  // reported as an ANON_CONSTRUCT diagnostic instead — see below.)
  it("extracts 22 components", () => {
    expect(result.model.components).toHaveLength(22)
  })

  // 18 IAM grants + 7 HTTP integrations + 1 SQS event source + 1 DLQ overflow
  // + 1 SNS subscription = 28.
  it("extracts 28 connections", () => {
    expect(result.model.connections).toHaveLength(28)
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

  // Exactly one expected warn: the DeployRollbackRule EventBridge Rule is
  // constructed inline (no variable), so it is honestly reported rather than
  // silently dropped. No edges are lost — this is the diagnostics-not-drops
  // contract working as designed. Every other construct resolved cleanly.
  it("reports only the known anonymous-Rule warning, drops no edges", () => {
    const warns = result.diagnostics.filter(d => d.level === "warn")
    expect(warns).toHaveLength(1)
    expect(warns[0].code).toBe("ANON_CONSTRUCT")
    expect(warns[0].message).toMatch(/Rule/)
  })
})
