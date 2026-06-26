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
        level: "warn",
        code: "UNRESOLVED_EDGE",
        message: `Edge skipped: ${from.reason}; ${to.reason}`,
        line,
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
