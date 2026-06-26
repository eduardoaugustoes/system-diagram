import ELK from "elkjs/lib/elk.bundled.js"
import type { Model } from "../engine/types"

const elk = new ELK()

export interface PositionedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  parentId?: string
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

interface ElkChild {
  id: string
  width: number
  height: number
  children?: ElkChild[]
  layoutOptions?: Record<string, string>
}

function buildChildren(model: Model): ElkChild[] {
  const sizeOf = (kind: string) => ({
    width: NODE_WIDTHS[kind] ?? 140,
    height: NODE_HEIGHTS[kind] ?? 56,
  })
  const childrenByParent = new Map<string, ElkChild[]>()
  for (const c of model.components) {
    if (c.parentId === undefined) continue
    const node: ElkChild = { id: c.id, ...sizeOf(c.kind) }
    const list = childrenByParent.get(c.parentId) ?? []
    list.push(node)
    childrenByParent.set(c.parentId, list)
  }
  const roots: ElkChild[] = []
  for (const c of model.components) {
    if (c.parentId !== undefined) continue
    const kids = childrenByParent.get(c.id)
    const node: ElkChild = { id: c.id, ...sizeOf(c.kind) }
    if (kids && kids.length > 0) {
      node.children = kids
      // give the parent container padding so the child sits inside, below the title
      node.layoutOptions = {
        "elk.padding": "[top=34,left=12,bottom=12,right=12]",
        "elk.algorithm": "layered",
      }
    }
    roots.push(node)
  }
  return roots
}

export async function layoutModel(model: Model): Promise<LayoutResult> {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.layered.spacing.edgeNodeBetweenLayers": "32",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: buildChildren(model),
    edges: model.connections.map(connection => ({
      id: connection.id,
      sources: [connection.fromId],
      targets: [connection.toId],
    })),
  }

  const result = await elk.layout(graph)
  const nodes: PositionedNode[] = []
  const walk = (
    elkNodes: Array<{ id?: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] }>,
    offsetX: number,
    offsetY: number,
    parentId: string | undefined,
  ) => {
    for (const n of elkNodes) {
      const absX = offsetX + (n.x ?? 0)
      const absY = offsetY + (n.y ?? 0)
      nodes.push({
        id: n.id ?? "",
        x: absX,
        y: absY,
        width: n.width ?? 0,
        height: n.height ?? 0,
        parentId,
      })
      if (n.children && n.children.length > 0) {
        walk(n.children as typeof elkNodes, absX, absY, n.id)
      }
    }
  }
  walk((result.children ?? []) as Parameters<typeof walk>[0], 0, 0, undefined)
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
