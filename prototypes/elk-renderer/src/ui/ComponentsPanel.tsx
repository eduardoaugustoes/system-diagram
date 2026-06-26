import { useMemo, useState } from "react"
import type { Component, ComponentKind, Connection, Model } from "../engine/types"

interface ComponentsPanelProps {
  model: Model
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ComponentsPanel({ model, selectedId, onSelect }: ComponentsPanelProps) {
  const [query, setQuery] = useState("")
  const [connectionsOpen, setConnectionsOpen] = useState(true)

  const filteredComponents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return model.components
    return model.components.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.kind.toLowerCase().includes(q),
    )
  }, [model.components, query])

  const filteredConnections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return model.connections
    return model.connections.filter(
      c =>
        c.fromId.toLowerCase().includes(q) ||
        c.toId.toLowerCase().includes(q) ||
        c.kind.toLowerCase().includes(q),
    )
  }, [model.connections, query])

  return (
    <aside style={panelStyle}>
      <div style={headerStyle}>
        <span style={eyebrowStyle}>COMPONENTS</span>
        <span style={countStyle}>{model.components.length}</span>
      </div>
      <div style={{ padding: "0 16px 8px 16px" }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search components…"
          style={searchStyle}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
        {filteredComponents.map(component => (
          <ComponentRow
            key={component.id}
            component={component}
            active={component.id === selectedId}
            onClick={() => onSelect(component.id)}
          />
        ))}
        {filteredComponents.length === 0 && (
          <div style={emptyStyle}>No components match “{query}”.</div>
        )}
        <div style={dividerStyle} />
        <button
          onClick={() => setConnectionsOpen(o => !o)}
          style={subHeaderStyle}
          aria-expanded={connectionsOpen}
        >
          <span style={{ ...eyebrowStyle, color: connectionsOpen ? "#78716C" : "#A8A29E" }}>
            {connectionsOpen ? "▾ " : "▸ "}CONNECTIONS
          </span>
          <span style={countStyle}>{model.connections.length}</span>
        </button>
        {connectionsOpen &&
          filteredConnections.map(connection => (
            <ConnectionRow key={connection.id} connection={connection} />
          ))}
      </div>
    </aside>
  )
}

function ComponentRow({
  component,
  active,
  onClick,
}: {
  component: Component
  active: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 4,
        background: active ? "#FEF3C7" : "transparent",
        cursor: "pointer",
      }}
    >
      <MiniShape kind={component.kind} />
      <span
        style={{
          fontFamily: "JetBrains Mono",
          fontSize: 12,
          fontWeight: active ? 500 : 400,
          color: "#1C1917",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {component.name}
      </span>
    </div>
  )
}

function ConnectionRow({ connection }: { connection: Connection }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        borderRadius: 4,
      }}
    >
      <EdgeSwatch kind={connection.kind} />
      <span
        style={{
          fontFamily: "JetBrains Mono",
          fontSize: 11,
          color: "#44403C",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={`${connection.fromId} → ${connection.toId} (${connection.kind})`}
      >
        {connection.fromId} → {connection.toId}
      </span>
    </div>
  )
}

function MiniShape({ kind }: { kind: ComponentKind }) {
  const common = { width: 14, height: 10, fill: "#FFFFFF", stroke: "#1C1917", strokeWidth: 1 }
  if (kind === "external") {
    return (
      <svg width="14" height="10">
        <rect {...common} fill="#F5F5F4" stroke="#A8A29E" strokeDasharray="2 2" />
      </svg>
    )
  }
  if (kind === "datastore") {
    return (
      <svg width="14" height="10">
        <rect {...common} rx="5" ry="5" />
      </svg>
    )
  }
  if (kind === "queue") {
    return (
      <svg width="14" height="10">
        <rect {...common} />
      </svg>
    )
  }
  if (kind === "ui") {
    return (
      <svg width="14" height="10">
        <rect {...common} fill="#FAFAF9" rx="3" ry="3" />
      </svg>
    )
  }
  if (kind === "job") {
    return (
      <svg width="14" height="10">
        <rect {...common} rx="1" ry="1" />
      </svg>
    )
  }
  return (
    <svg width="14" height="10">
      <rect {...common} rx="3" ry="3" />
    </svg>
  )
}

function EdgeSwatch({ kind }: { kind: Connection["kind"] }) {
  let dash: string | undefined
  let stroke = "#1C1917"
  let width = 1.5
  switch (kind) {
    case "async-event":
      dash = "4 3"
      break
    case "data-read":
      dash = "1 2"
      break
    case "data-write":
      dash = "3 2"
      width = 2
      break
    case "depends-on":
      stroke = "#A8A29E"
      break
  }
  return (
    <svg width="14" height="10">
      <line x1="0" y1="5" x2="14" y2="5" stroke={stroke} strokeWidth={width} strokeDasharray={dash} />
      {kind === "deploys-on" && (
        <line x1="0" y1="8" x2="14" y2="8" stroke={stroke} strokeWidth={width} />
      )}
    </svg>
  )
}

const panelStyle: React.CSSProperties = {
  width: 240,
  height: "100%",
  background: "#FFFFFF",
  borderRight: "1px solid #E7E5E4",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
}

const headerStyle: React.CSSProperties = {
  padding: "16px 16px 8px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "Inter",
  fontSize: 10,
  fontWeight: 500,
  color: "#A8A29E",
  letterSpacing: 1.5,
}

const countStyle: React.CSSProperties = {
  fontFamily: "JetBrains Mono",
  fontSize: 10,
  color: "#A8A29E",
}

const searchStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  border: "none",
  borderRadius: 6,
  background: "#F5F5F4",
  fontFamily: "Inter",
  fontSize: 12,
  color: "#1C1917",
  outline: "none",
  boxSizing: "border-box",
}

const emptyStyle: React.CSSProperties = {
  padding: "12px 8px",
  fontFamily: "Inter",
  fontSize: 12,
  color: "#A8A29E",
}

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "#E7E5E4",
  margin: "8px 0",
}

const subHeaderStyle: React.CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 8px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
}
