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
