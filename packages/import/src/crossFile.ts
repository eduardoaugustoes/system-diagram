import type { Component } from "./types"

type Resolution = { component: Component | undefined; reason: string }

function tail(refText: string): string {
  return refText.includes(".") ? refText.split(".").pop()! : refText
}

export function resolveRef(
  refText: string,
  local: Map<string, Component>,
  dataFields: Map<string, Component>,
): Resolution {
  const name = tail(refText)
  if (refText.startsWith("this.data.")) {
    const hit = dataFields.get(name)
    return hit
      ? { component: hit, reason: "resolved cross-file via this.data" }
      : { component: undefined, reason: `unresolved cross-file ref: ${refText}` }
  }
  const localHit = local.get(name) ?? local.get(refText)
  if (localHit) return { component: localHit, reason: "resolved local" }
  const dataHit = dataFields.get(name)
  if (dataHit) return { component: dataHit, reason: "resolved via field name" }
  return { component: undefined, reason: `unresolved ref: ${refText}` }
}
