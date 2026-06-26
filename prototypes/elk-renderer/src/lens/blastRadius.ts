import { getIncomingConnections, getOutgoingConnections, getComponent } from "../engine/engine"
import type { Connection, ConnectionKind, Model, NodeId } from "../engine/types"

const BLOCKING_KINDS: ConnectionKind[] = ["sync-call", "data-read", "data-write", "deploys-on"]

function isBlocking(connection: Connection, changeType: "remove" | "modify"): boolean {
  if (changeType === "modify") {
    if (connection.kind === "async-event") return false
    if (connection.kind === "sync-call" && connection.criticality === "hard") return true
  }
  return (
    BLOCKING_KINDS.includes(connection.kind) &&
    connection.criticality === "hard" &&
    !connection.optional
  )
}

export interface BlastRadiusOptions {
  maxHops?: number
  direction?: "downstream" | "upstream" | "both"
  changeType?: "remove" | "modify"
}

export interface AffectedNode {
  nodeId: NodeId
  hopDistance: number
  paths: string[][]
  blocking: boolean
  reason: string
}

export interface BlastRadiusResult {
  sourceNodeId: NodeId
  affected: AffectedNode[]
  summary: {
    blockingCount: number
    nonBlockingCount: number
    maxHopReached: number
    ownersImpacted: string[]
  }
  truncated: boolean
}

export function blastRadius(
  model: Model,
  nodeId: NodeId,
  options: BlastRadiusOptions = {},
): BlastRadiusResult {
  const maxHops = options.maxHops ?? 3
  const direction = options.direction ?? "both"
  const changeType = options.changeType ?? "remove"

  const visited = new Map<NodeId, AffectedNode>()
  type Frontier = { nodeId: NodeId; hop: number; blockingChain: boolean; viaPath: string[] }
  const queue: Frontier[] = [
    { nodeId, hop: 0, blockingChain: true, viaPath: [] },
  ]
  let truncated = false

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.nodeId !== nodeId && !visited.has(current.nodeId)) {
      visited.set(current.nodeId, {
        nodeId: current.nodeId,
        hopDistance: current.hop,
        paths: [current.viaPath],
        blocking: current.blockingChain,
        reason: current.blockingChain ? "blocking dependency" : "non-blocking dependency",
      })
    } else if (current.nodeId !== nodeId) {
      const existing = visited.get(current.nodeId)!
      existing.paths.push(current.viaPath)
      if (current.blockingChain) existing.blocking = true
    }

    if (current.hop >= maxHops) {
      truncated = true
      continue
    }

    const neighbors: { nextId: NodeId; connectionId: string; blocking: boolean }[] = []
    if (direction === "downstream" || direction === "both") {
      for (const connection of getOutgoingConnections(model, current.nodeId)) {
        neighbors.push({
          nextId: connection.toId,
          connectionId: connection.id,
          blocking: isBlocking(connection, changeType),
        })
      }
    }
    if (direction === "upstream" || direction === "both") {
      for (const connection of getIncomingConnections(model, current.nodeId)) {
        neighbors.push({
          nextId: connection.fromId,
          connectionId: connection.id,
          blocking: isBlocking(connection, changeType),
        })
      }
    }
    for (const neighbor of neighbors) {
      if (neighbor.nextId === nodeId) continue
      if (visited.has(neighbor.nextId) && visited.get(neighbor.nextId)!.hopDistance < current.hop + 1) continue
      queue.push({
        nodeId: neighbor.nextId,
        hop: current.hop + 1,
        blockingChain: current.blockingChain && neighbor.blocking,
        viaPath: [...current.viaPath, neighbor.connectionId],
      })
    }
  }

  const affected = Array.from(visited.values()).sort(
    (a, b) => a.hopDistance - b.hopDistance || a.nodeId.localeCompare(b.nodeId),
  )
  const ownersImpacted = Array.from(
    new Set(
      affected
        .map(a => getComponent(model, a.nodeId)?.ownerId)
        .filter((o): o is string => Boolean(o)),
    ),
  )

  return {
    sourceNodeId: nodeId,
    affected,
    summary: {
      blockingCount: affected.filter(a => a.blocking).length,
      nonBlockingCount: affected.filter(a => !a.blocking).length,
      maxHopReached: affected.reduce((m, a) => Math.max(m, a.hopDistance), 0),
      ownersImpacted,
    },
    truncated,
  }
}

export interface Overlay {
  nodes: Set<NodeId>
  edges: Set<string>
  intensity: Map<NodeId, number>
  hopDistance: Map<NodeId, number>
  legend: string
}

export function overlayFromBlastRadius(result: BlastRadiusResult): Overlay {
  const nodes = new Set<NodeId>([result.sourceNodeId])
  const edges = new Set<string>()
  const intensity = new Map<NodeId, number>()
  const hopDistance = new Map<NodeId, number>()
  intensity.set(result.sourceNodeId, 1)
  hopDistance.set(result.sourceNodeId, 0)
  for (const a of result.affected) {
    nodes.add(a.nodeId)
    hopDistance.set(a.nodeId, a.hopDistance)
    const decay = Math.max(0.2, 1 - 0.15 * (a.hopDistance - 1))
    intensity.set(a.nodeId, a.blocking ? 1 * decay : 0.4 * decay)
    for (const path of a.paths) {
      for (const edgeId of path) edges.add(edgeId)
    }
  }
  return {
    nodes,
    edges,
    intensity,
    hopDistance,
    legend: `Blast radius — ${result.summary.blockingCount} blocking · ${result.summary.nonBlockingCount} non-blocking · ${result.summary.ownersImpacted.length} owners impacted`,
  }
}
