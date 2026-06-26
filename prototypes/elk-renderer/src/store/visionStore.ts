import type { Model } from "../engine/types"
import { checkout } from "../fixtures/checkout"
import gatewayJson from "../../../../examples/github-app-gateway.system.json"

const gateway = gatewayJson as Model

export interface VisionEntry {
  id: string
  name: string
  color: string
  order: number
  model: Model
  revision: number
}

const STORAGE_KEY = "system-diagram.visions.v1"
const ACTIVE_KEY = "system-diagram.activeVision.v1"

export const PAPER_COLORS = [
  "#FEF3C7",
  "#FCE7F3",
  "#DBEAFE",
  "#DCFCE7",
  "#FED7AA",
  "#E9D5FF",
] as const

function emptyModel(name: string): Model {
  return {
    system: { id: name.toLowerCase().replace(/\s+/g, "-"), name, description: "" },
    components: [],
    connections: [],
    capabilities: [],
    owners: [],
  }
}

function seed(): { visions: VisionEntry[]; activeId: string } {
  const first: VisionEntry = {
    id: "checkout",
    name: "Checkout",
    color: PAPER_COLORS[0],
    order: 0,
    model: checkout,
    revision: 1,
  }
  const gatewayVision: VisionEntry = {
    id: "github-app-gateway",
    name: "GitHub App Gateway",
    color: PAPER_COLORS[2],
    order: 1,
    model: gateway,
    revision: 1,
  }
  return { visions: [first, gatewayVision], activeId: gatewayVision.id }
}

export interface StoreState {
  visions: VisionEntry[]
  activeId: string
}

export function loadStore(): StoreState {
  try {
    const visionsRaw = localStorage.getItem(STORAGE_KEY)
    const activeRaw = localStorage.getItem(ACTIVE_KEY)
    if (!visionsRaw) return seed()
    const visions = JSON.parse(visionsRaw) as VisionEntry[]
    if (!Array.isArray(visions) || visions.length === 0) return seed()
    const activeId = activeRaw && visions.some(v => v.id === activeRaw) ? activeRaw : visions[0].id
    return { visions: visions.sort((a, b) => a.order - b.order), activeId }
  } catch {
    return seed()
  }
}

export function saveStore(state: StoreState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.visions))
  localStorage.setItem(ACTIVE_KEY, state.activeId)
}

export function createVision(state: StoreState, name: string, color?: string): StoreState {
  const id = `v-${Date.now().toString(36)}`
  const order = state.visions.length === 0 ? 0 : Math.max(...state.visions.map(v => v.order)) + 1
  const chosenColor = color ?? PAPER_COLORS[state.visions.length % PAPER_COLORS.length]
  const vision: VisionEntry = {
    id,
    name,
    color: chosenColor,
    order,
    model: emptyModel(name),
    revision: 1,
  }
  return { visions: [...state.visions, vision], activeId: id }
}

export function deleteVision(state: StoreState, id: string): StoreState {
  const visions = state.visions.filter(v => v.id !== id)
  if (visions.length === 0) return seed()
  const activeId = state.activeId === id ? visions[0].id : state.activeId
  return { visions, activeId }
}

export function updateVisionModel(state: StoreState, id: string, model: Model): StoreState {
  return {
    ...state,
    visions: state.visions.map(v =>
      v.id === id ? { ...v, model, revision: v.revision + 1 } : v,
    ),
  }
}

export function renameVision(state: StoreState, id: string, name: string): StoreState {
  return { ...state, visions: state.visions.map(v => (v.id === id ? { ...v, name } : v)) }
}

export function recolorVision(state: StoreState, id: string, color: string): StoreState {
  return { ...state, visions: state.visions.map(v => (v.id === id ? { ...v, color } : v)) }
}

export function reorderVisions(state: StoreState, orderedIds: string[]): StoreState {
  const indexMap = new Map(orderedIds.map((id, i) => [id, i]))
  return {
    ...state,
    visions: state.visions.map(v => ({ ...v, order: indexMap.get(v.id) ?? v.order })),
  }
}

export function setActive(state: StoreState, id: string): StoreState {
  return { ...state, activeId: id }
}
