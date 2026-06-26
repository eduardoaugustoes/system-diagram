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
