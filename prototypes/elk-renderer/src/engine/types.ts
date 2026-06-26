export type NodeId = string
export type ConnectionId = string
export type GlobalId = string
export type Tag = string
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export type ComponentKind = "service" | "datastore" | "queue" | "external" | "ui" | "job"
export type ConnectionKind =
  | "sync-call"
  | "async-event"
  | "data-read"
  | "data-write"
  | "deploys-on"
  | "depends-on"
export type Criticality = "hard" | "soft"

export interface Owner {
  id: string
  name: string
  contact?: string
}

export interface Capability {
  id: string
  name: string
  description?: string
  globalId?: GlobalId
}

export interface Component {
  id: NodeId
  kind: ComponentKind
  name: string
  description?: string
  globalId?: GlobalId
  ownerId?: string
  capabilityIds: string[]
  tags: Tag[]
  metadata: Record<string, JsonValue>
}

export interface Connection {
  id: ConnectionId
  fromId: NodeId
  toId: NodeId
  kind: ConnectionKind
  criticality: Criticality
  optional: boolean
  capabilityId?: string
  tags: Tag[]
  description?: string
}

export interface System {
  id: NodeId
  name: string
  description?: string
}

export interface Model {
  system: System
  components: Component[]
  connections: Connection[]
  capabilities: Capability[]
  owners: Owner[]
}

export interface Ref {
  entity: "component" | "connection"
  id: string
}

export interface Diff {
  added: Ref[]
  removed: Ref[]
  changed: Ref[]
}

export type Patch =
  | { kind: "add_component"; component: Component }
  | { kind: "remove_component"; componentId: NodeId; cascade: boolean }
  | { kind: "add_connection"; connection: Connection }
  | { kind: "remove_connection"; connectionId: ConnectionId }
  | { kind: "set_property"; target: Ref; key: string; value: JsonValue }
  | { kind: "rename"; target: Ref; newName: string }

export interface ValidationError {
  code: "SCHEMA" | "REF" | "DUP_ID" | "CYCLE" | "ORPHAN" | "VERSION_MISMATCH" | "MISSING_REQUIRED"
  path: string
  message: string
  nodeId?: NodeId
}

export type ApplyResult =
  | { ok: true; model: Model; diff: Diff }
  | { ok: false; errors: ValidationError[] }
