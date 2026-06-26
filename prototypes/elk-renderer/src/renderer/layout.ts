import ELK from "elkjs/lib/elk.bundled.js"
import type { Model } from "../engine/types"

const elk = new ELK()

export interface PositionedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedEdge {
  id: string
  sections: Array<{
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    bendPoints?: Array<{ x: number; y: number }>
  }>
}

export interface LayoutResult {
  width: number
  height: number
  nodes: PositionedNode[]
  edges: PositionedEdge[]
}

const NODE_WIDTHS: Record<string, number> = {
  service: 140,
  datastore: 140,
  queue: 140,
  external: 130,
  ui: 130,
  job: 140,
}

const NODE_HEIGHTS: Record<string, number> = {
  service: 56,
  datastore: 56,
  queue: 48,
  external: 56,
  ui: 56,
  job: 56,
}

export async function layoutModel(model: Model): Promise<LayoutResult> {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.layered.spacing.edgeNodeBetweenLayers": "32",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: model.components.map(component => ({
      id: component.id,
      width: NODE_WIDTHS[component.kind] ?? 140,
      height: NODE_HEIGHTS[component.kind] ?? 56,
    })),
    edges: model.connections.map(connection => ({
      id: connection.id,
      sources: [connection.fromId],
      targets: [connection.toId],
    })),
  }

  const result = await elk.layout(graph)
  const nodes: PositionedNode[] = (result.children ?? []).map(node => ({
    id: node.id ?? "",
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
  }))
  const edges: PositionedEdge[] = (result.edges ?? []).map(edge => {
    type ElkSection = {
      startPoint: { x: number; y: number }
      endPoint: { x: number; y: number }
      bendPoints?: Array<{ x: number; y: number }>
    }
    const elkEdge = edge as { id?: string; sections?: ElkSection[] }
    return {
      id: elkEdge.id ?? "",
      sections: (elkEdge.sections ?? []).map(section => ({
        startPoint: section.startPoint,
        endPoint: section.endPoint,
        bendPoints: section.bendPoints,
      })),
    }
  })
  return { width: result.width ?? 0, height: result.height ?? 0, nodes, edges }
}
