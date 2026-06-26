import type { ComponentKind, Connection, ConnectionKind } from "../engine/types"
import type { Overlay } from "../lens/blastRadius"

const BLOCKING_RED = "#7F1D1D"
const BLOCKING_RED_BG = "#FEF2F2"
const SOFT_AMBER = "#92400E"
const SOFT_AMBER_BG = "#FFFBEB"
const INK = "#1C1917"
const MUTED_INK = "#A8A29E"
const FADED = "#E7E5E4"
const FADED_TEXT = "#D6D3D1"
const BG = "#FAFAF9"
const CARD_BG = "#FFFFFF"

export interface NodeStyle {
  fill: string
  stroke: string
  strokeWidth: number
  textFill: string
  shapeKind: ComponentKind
  cornerRadius: number
}

export interface EdgeStyle {
  stroke: string
  strokeWidth: number
  dashArray?: string
  doubleStroke?: boolean
}

export function nodeStyle(
  kind: ComponentKind,
  intensity: number | undefined,
  isSource: boolean,
  inOverlay: boolean,
  faded: boolean,
): NodeStyle {
  let fill = CARD_BG
  let stroke = INK
  let strokeWidth = 1.5
  let textFill = INK
  let cornerRadius = 12
  if (kind === "ui") fill = BG
  if (kind === "external") {
    fill = "#F5F5F4"
    stroke = MUTED_INK
  }
  if (kind === "datastore") cornerRadius = 999
  if (kind === "queue") cornerRadius = 0
  if (kind === "job") cornerRadius = 4
  if (faded) {
    fill = CARD_BG
    stroke = FADED
    strokeWidth = 1
    textFill = FADED_TEXT
  } else if (isSource) {
    fill = BLOCKING_RED
    stroke = BLOCKING_RED
    strokeWidth = 2
    textFill = "#FFFFFF"
  } else if (inOverlay && intensity !== undefined) {
    const blocking = intensity > 0.6
    fill = blocking ? BLOCKING_RED_BG : SOFT_AMBER_BG
    stroke = blocking ? BLOCKING_RED : SOFT_AMBER
    strokeWidth = 2
    textFill = INK
  }
  return { fill, stroke, strokeWidth, textFill, shapeKind: kind, cornerRadius }
}

export function edgeStyle(
  connection: Connection,
  inOverlay: boolean,
  blockingChain: boolean,
  faded: boolean,
): EdgeStyle {
  const strokeBase = blockingChain ? BLOCKING_RED : inOverlay ? SOFT_AMBER : INK
  const stroke = faded ? FADED : strokeBase
  const width = inOverlay && !faded ? 2 : 1.5
  const style: EdgeStyle = { stroke, strokeWidth: width }
  switch (connection.kind as ConnectionKind) {
    case "sync-call":
      break
    case "async-event":
      style.dashArray = "6 4"
      break
    case "data-read":
      style.dashArray = "2 4"
      break
    case "data-write":
      style.dashArray = "4 3"
      style.strokeWidth = (style.strokeWidth ?? 1.5) + 0.5
      break
    case "deploys-on":
      style.doubleStroke = true
      break
    case "depends-on":
      style.stroke = faded ? FADED : MUTED_INK
      break
  }
  return style
}

export function overlayContext(overlay: Overlay | null, nodeId: string) {
  const inOverlay = overlay !== null && overlay.nodes.has(nodeId)
  const isSource = overlay !== null && overlay.nodes.has(nodeId) && overlay.hopDistance.get(nodeId) === 0
  const intensity = overlay?.intensity.get(nodeId)
  const hop = overlay?.hopDistance.get(nodeId)
  const faded = overlay !== null && !inOverlay
  return { inOverlay, isSource, intensity, hop, faded }
}

export function edgeOverlayContext(overlay: Overlay | null, connection: Connection) {
  const inOverlay = overlay !== null && overlay.edges.has(connection.id)
  const faded = overlay !== null && !inOverlay
  const fromIntensity = overlay?.intensity.get(connection.fromId) ?? 0
  const toIntensity = overlay?.intensity.get(connection.toId) ?? 0
  const blockingChain =
    inOverlay &&
    connection.criticality === "hard" &&
    !connection.optional &&
    fromIntensity > 0.6 &&
    toIntensity > 0.6
  return { inOverlay, faded, blockingChain }
}

export const COLORS = {
  ink: INK,
  mutedInk: MUTED_INK,
  faded: FADED,
  fadedText: FADED_TEXT,
  bg: BG,
  cardBg: CARD_BG,
  blockingRed: BLOCKING_RED,
  softAmber: SOFT_AMBER,
}
