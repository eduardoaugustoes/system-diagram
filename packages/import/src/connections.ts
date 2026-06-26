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
      continue
    }

    // ── HttpLambdaIntegration inside addRoutes({ path, integration }) ──
    if (parts.method === "addRoutes") {
      const optionsArg = call.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
      if (optionsArg) {
        const pathText = optionsArg
          .getProperty("path")
          ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
          ?.getLiteralText()
        const integ = optionsArg
          .getProperty("integration")
          ?.getFirstDescendantByKind(SyntaxKind.NewExpression)
        if (integ && integ.getExpression().getText().includes("HttpLambdaIntegration")) {
          const args = integ.getArguments()
          const lambdaArg = args[1] ?? args[0]
          if (lambdaArg) {
            pushEdge(
              parts.receiver,
              lambdaArg.getText(),
              { kind: "sync-call", criticality: "hard", optional: false },
              call.getStartLineNumber(),
              pathText,
            )
          }
        }
      }
      continue
    }

    // ── fn.addEventSource(new SqsEventSource(queue, ...)) ──
    if (parts.method === "addEventSource") {
      const srcExpr = call.getArguments()[0]?.asKind(SyntaxKind.NewExpression)
      const queueArg = srcExpr?.getArguments()[0]
      if (queueArg) {
        pushEdge(
          queueArg.getText(),
          parts.receiver,
          { kind: "async-event", criticality: "soft", optional: true },
          call.getStartLineNumber(),
          "event source",
        )
      }
      continue
    }

    // ── topic.addSubscription(new LambdaSubscription(fn)) ──
    if (parts.method === "addSubscription") {
      const subExpr = call.getArguments()[0]?.asKind(SyntaxKind.NewExpression)
      const fnArg = subExpr?.getArguments()[0]
      if (fnArg) {
        pushEdge(
          parts.receiver,
          fnArg.getText(),
          { kind: "async-event", criticality: "soft", optional: true },
          call.getStartLineNumber(),
          "subscription",
        )
      }
      continue
    }
  }

  // ── deadLetterQueue: { queue: <dlq> } inside a Queue construction ──
  for (const newExpr of source.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    if (!newExpr.getExpression().getText().includes("Queue")) continue
    const opts = newExpr.getArguments()[2]?.asKind(SyntaxKind.ObjectLiteralExpression)
    const dlqProp = opts
      ?.getProperty("deadLetterQueue")
      ?.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression)
    const queueRef = dlqProp
      ?.getProperty("queue")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText()
    if (!queueRef) continue
    const ownerVar =
      newExpr.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ??
      (() => {
        const bin = newExpr.getFirstAncestorByKind(SyntaxKind.BinaryExpression)
        const left = bin?.getLeft().getText()
        return left?.startsWith("this.") ? left.slice("this.".length) : left
      })()
    if (!ownerVar) continue
    pushEdge(
      ownerVar,
      queueRef,
      { kind: "async-event", criticality: "soft", optional: true },
      newExpr.getStartLineNumber(),
      "dead-letter",
    )
  }

  return { connections, diagnostics }
}
