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
