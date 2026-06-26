import { SyntaxKind, type SourceFile, type NewExpression } from "ts-morph"
import { lookupSubtype } from "./subtypeMap"
import type { Component, Diagnostic } from "./types"

interface ExtractResult {
  components: Component[]
  byVarName: Map<string, Component>
  diagnostics: Diagnostic[]
}

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
          level: "info",
          code: "UNMAPPED_CONSTRUCT",
          message: `Skipped unmapped construct ${cls}`,
          line: expr.getStartLineNumber(),
        })
      }
      continue
    }
    const varName = varNameFor(expr)
    if (!varName) {
      diagnostics.push({
        level: "warn",
        code: "ANON_CONSTRUCT",
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
