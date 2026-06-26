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

const ctx = {
  local: new Map([
    ["httpApi", comp("httpApi", "external")],
    ["handoffLambda", comp("handoffLambda", "service")],
    ["webhookProcessLambda", comp("webhookProcessLambda", "service")],
    ["alarmTopic", comp("alarmTopic", "queue")],
    ["alarmNotifierLambda", comp("alarmNotifierLambda", "service")],
    ["webhookEventsQueue", comp("webhookEventsQueue", "queue")],
    ["webhookEventsDlq", comp("webhookEventsDlq", "queue")],
  ]),
  dataFields: new Map([["webhookEventsQueue", comp("webhookEventsQueue", "queue")]]),
}

describe("extractConnections — wiring", () => {
  it("HttpLambdaIntegration becomes a hard sync-call from api to lambda", () => {
    const src = parse(`
      httpApi.addRoutes({
        path: "/installations/handoff",
        integration: new apigatewayv2Integrations.HttpLambdaIntegration("HandoffIntegration", handoffLambda),
      })
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.kind === "sync-call")
    expect(e).toBeDefined()
    expect(e!.fromId).toBe("httpApi")
    expect(e!.toId).toBe("handoffLambda")
    expect(e!.criticality).toBe("hard")
    expect(e!.description).toBe("/installations/handoff")
  })

  it("addEventSource(SqsEventSource(queue)) becomes async-event from queue to lambda", () => {
    const src = parse(`
      webhookProcessLambda.addEventSource(new lambdaEventSources.SqsEventSource(this.data.webhookEventsQueue, { batchSize: 5 }))
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.kind === "async-event")
    expect(e!.fromId).toBe("webhookEventsQueue")
    expect(e!.toId).toBe("webhookProcessLambda")
    expect(e!.optional).toBe(true)
  })

  it("deadLetterQueue option becomes async-event from queue to dlq", () => {
    const src = parse(`
      const webhookEventsQueue = new sqs.Queue(this, "Q", {
        deadLetterQueue: { queue: webhookEventsDlq, maxReceiveCount: 3 },
      })
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.toId === "webhookEventsDlq")
    expect(e).toBeDefined()
    expect(e!.fromId).toBe("webhookEventsQueue")
    expect(e!.kind).toBe("async-event")
  })

  it("addSubscription(LambdaSubscription(fn)) becomes async-event from topic to lambda", () => {
    const src = parse(`
      alarmTopic.addSubscription(new snsSubscriptions.LambdaSubscription(alarmNotifierLambda))
    `)
    const { connections } = extractConnections(src, ctx)
    const e = connections.find(c => c.fromId === "alarmTopic")
    expect(e!.toId).toBe("alarmNotifierLambda")
    expect(e!.kind).toBe("async-event")
  })
})
