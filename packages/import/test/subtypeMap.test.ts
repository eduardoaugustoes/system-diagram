import { describe, it, expect } from "vitest"
import { lookupSubtype } from "../src/subtypeMap"

describe("lookupSubtype", () => {
  it("maps NodejsFunction to an aws:lambda service", () => {
    expect(lookupSubtype("NodejsFunction")).toEqual({
      kind: "service", subtype: "aws:lambda", awsService: "Lambda", icon: "lambda",
    })
  })
  it("maps Table to an aws:dynamodb datastore", () => {
    expect(lookupSubtype("Table")?.kind).toBe("datastore")
    expect(lookupSubtype("Table")?.subtype).toBe("aws:dynamodb")
  })
  it("maps Queue to a queue and Topic to a queue", () => {
    expect(lookupSubtype("Queue")?.kind).toBe("queue")
    expect(lookupSubtype("Topic")?.kind).toBe("queue")
    expect(lookupSubtype("Topic")?.subtype).toBe("aws:sns")
  })
  it("maps Secret to a datastore and HttpApi to external", () => {
    expect(lookupSubtype("Secret")?.kind).toBe("datastore")
    expect(lookupSubtype("HttpApi")?.kind).toBe("external")
  })
  it("maps LogGroup to an aws:logs job", () => {
    expect(lookupSubtype("LogGroup")).toEqual({
      kind: "job", subtype: "aws:logs", awsService: "CloudWatch Logs", icon: "logs",
    })
  })
  it("returns undefined for genuinely unknown classes", () => {
    expect(lookupSubtype("CfnOutput")).toBeUndefined()
  })
})
