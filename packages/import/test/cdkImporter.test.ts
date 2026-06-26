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
