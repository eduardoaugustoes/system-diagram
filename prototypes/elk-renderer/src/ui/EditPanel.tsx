import { useState } from "react"
import type {
  Component,
  ComponentKind,
  Connection,
  ConnectionKind,
  Criticality,
  Model,
  Patch,
} from "../engine/types"

interface EditPanelProps {
  model: Model
  onApply: (patch: Patch) => void
}

const COMPONENT_KINDS: ComponentKind[] = ["service", "datastore", "queue", "external", "ui", "job"]
const CONNECTION_KINDS: ConnectionKind[] = [
  "sync-call",
  "async-event",
  "data-read",
  "data-write",
  "deploys-on",
  "depends-on",
]
const CRITICALITIES: Criticality[] = ["hard", "soft"]

export function EditPanel({ model, onApply }: EditPanelProps) {
  const [mode, setMode] = useState<"add-component" | "add-connection">("add-component")
  return (
    <aside style={panelStyle}>
      <p style={titleStyle}>EDIT</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        <TabButton active={mode === "add-component"} onClick={() => setMode("add-component")}>
          + component
        </TabButton>
        <TabButton active={mode === "add-connection"} onClick={() => setMode("add-connection")}>
          + connection
        </TabButton>
      </div>
      {mode === "add-component" ? (
        <AddComponentForm onApply={onApply} />
      ) : (
        <AddConnectionForm model={model} onApply={onApply} />
      )}
    </aside>
  )
}

function AddComponentForm({ onApply }: { onApply: (patch: Patch) => void }) {
  const [id, setId] = useState("")
  const [kind, setKind] = useState<ComponentKind>("service")
  const [name, setName] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const submit = () => {
    if (!id || !name) return
    const component: Component = {
      id,
      kind,
      name,
      ownerId: ownerId || undefined,
      capabilityIds: [],
      tags: [],
      metadata: {},
    }
    onApply({ kind: "add_component", component })
    setId("")
    setName("")
    setOwnerId("")
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Field label="id">
        <input value={id} onChange={e => setId(e.target.value)} style={inputStyle} placeholder="cart-svc" />
      </Field>
      <Field label="name">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle}
          placeholder="cart-svc"
        />
      </Field>
      <Field label="kind">
        <select value={kind} onChange={e => setKind(e.target.value as ComponentKind)} style={inputStyle}>
          {COMPONENT_KINDS.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>
      <Field label="owner">
        <input
          value={ownerId}
          onChange={e => setOwnerId(e.target.value)}
          style={inputStyle}
          placeholder="cart-team"
        />
      </Field>
      <button onClick={submit} style={buttonStyle}>
        add component
      </button>
    </div>
  )
}

function AddConnectionForm({ model, onApply }: { model: Model; onApply: (patch: Patch) => void }) {
  const [id, setId] = useState("")
  const [fromId, setFromId] = useState(model.components[0]?.id ?? "")
  const [toId, setToId] = useState(model.components[1]?.id ?? "")
  const [kind, setKind] = useState<ConnectionKind>("sync-call")
  const [criticality, setCriticality] = useState<Criticality>("hard")
  const [optional, setOptional] = useState(false)
  const submit = () => {
    if (!id || !fromId || !toId) return
    const connection: Connection = {
      id,
      fromId,
      toId,
      kind,
      criticality,
      optional,
      tags: [],
    }
    onApply({ kind: "add_connection", connection })
    setId("")
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Field label="id">
        <input value={id} onChange={e => setId(e.target.value)} style={inputStyle} placeholder="c10" />
      </Field>
      <Field label="from">
        <select value={fromId} onChange={e => setFromId(e.target.value)} style={inputStyle}>
          {model.components.map(c => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
      </Field>
      <Field label="to">
        <select value={toId} onChange={e => setToId(e.target.value)} style={inputStyle}>
          {model.components.map(c => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
      </Field>
      <Field label="kind">
        <select value={kind} onChange={e => setKind(e.target.value as ConnectionKind)} style={inputStyle}>
          {CONNECTION_KINDS.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>
      <Field label="criticality">
        <select
          value={criticality}
          onChange={e => setCriticality(e.target.value as Criticality)}
          style={inputStyle}
        >
          {CRITICALITIES.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Inter", fontSize: 12 }}>
        <input type="checkbox" checked={optional} onChange={e => setOptional(e.target.checked)} />
        optional (has fallback)
      </label>
      <button onClick={submit} style={buttonStyle}>
        add connection
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: "Inter", fontSize: 11, color: "#78716C" }}>{label}</span>
      {children}
    </label>
  )
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        border: "1px solid #E7E5E4",
        background: active ? "#1C1917" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#1C1917",
        fontFamily: "JetBrains Mono",
        fontSize: 11,
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

const panelStyle: React.CSSProperties = {
  width: 260,
  height: "100%",
  padding: 24,
  background: "#FFFFFF",
  borderRight: "1px solid #E7E5E4",
  boxSizing: "border-box",
  overflow: "auto",
  flexShrink: 0,
}

const titleStyle: React.CSSProperties = {
  fontFamily: "Inter",
  fontSize: 10,
  fontWeight: 500,
  color: "#A8A29E",
  letterSpacing: 1.5,
  margin: "0 0 16px 0",
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #E7E5E4",
  borderRadius: 4,
  fontFamily: "JetBrains Mono",
  fontSize: 12,
  background: "#FFFFFF",
}

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "8px 12px",
  border: "none",
  borderRadius: 6,
  background: "#1C1917",
  color: "#FFFFFF",
  fontFamily: "Inter",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
}
