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
