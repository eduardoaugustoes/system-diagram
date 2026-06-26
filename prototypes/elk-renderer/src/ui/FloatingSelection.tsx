import { getIncomingConnections, getOutgoingConnections } from "../engine/engine"
import type { Connection, Model } from "../engine/types"

interface FloatingSelectionProps {
  model: Model
  selectedId: string | null
  onClose: () => void
  onRunBlastRadius: (nodeId: string) => void
  onRemove: (nodeId: string) => void
}

export function FloatingSelection({
  model,
  selectedId,
  onClose,
  onRunBlastRadius,
  onRemove,
}: FloatingSelectionProps) {
  if (!selectedId) return null
  const component = model.components.find(c => c.id === selectedId)
  if (!component) return null
  const outgoing = getOutgoingConnections(model, selectedId)
  const incoming = getIncomingConnections(model, selectedId)
  return (
    <aside style={floatingStyle} role="dialog" aria-label={`Selected: ${component.name}`}>
      <div style={headerRowStyle}>
        <span style={eyebrowStyle}>SELECTED</span>
        <button
          onClick={onClose}
          style={escButtonStyle}
          aria-label="Close selection"
          title="Close (Esc)"
        >
          Esc
        </button>
      </div>
      <h2 style={titleStyle}>{component.name}</h2>
      <div style={badgeRowStyle}>
        <Badge>{component.kind}</Badge>
        {component.ownerId && <Badge>{component.ownerId}</Badge>}
      </div>
      <div style={dividerStyle} />
      {component.description && <p style={descStyle}>{component.description}</p>}
      <ConnectionList label={`Outgoing (${outgoing.length})`} connections={outgoing} dir="out" />
      <ConnectionList label={`Incoming (${incoming.length})`} connections={incoming} dir="in" />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => onRunBlastRadius(selectedId)} style={primaryButtonStyle}>
          Run Blast Radius
        </button>
        <button onClick={() => onRemove(selectedId)} style={destructiveButtonStyle}>
          Remove
        </button>
      </div>
    </aside>
  )
}

function ConnectionList({
  label,
  connections,
  dir,
}: {
  label: string
  connections: Connection[]
  dir: "in" | "out"
}) {
  if (connections.length === 0) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={listLabelStyle}>{label}</p>
      {connections.map(connection => (
        <div key={connection.id} style={connectionRowStyle}>
          <span style={{ color: "#1C1917" }}>
            {dir === "out" ? "→" : "←"} {dir === "out" ? connection.toId : connection.fromId}
          </span>
          <span style={{ color: "#A8A29E", fontSize: 11 }}>{connection.kind}</span>
          <Badge tone={connection.criticality === "hard" ? "danger" : "muted"}>
            {connection.criticality}
            {connection.optional ? " · opt" : ""}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "danger" | "muted" }) {
  const palette =
    tone === "danger"
      ? { bg: "#7F1D1D", fg: "#FFFFFF" }
      : tone === "muted"
        ? { bg: "#F5F5F4", fg: "#78716C" }
        : { bg: "#F5F5F4", fg: "#1C1917" }
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        background: palette.bg,
        color: palette.fg,
        fontFamily: "JetBrains Mono",
        fontSize: 10,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}

const floatingStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  width: 300,
  maxHeight: "calc(100% - 32px)",
  padding: 20,
  background: "#FFFFFF",
  border: "1px solid #E7E5E4",
  borderRadius: 10,
  boxShadow: "0 10px 30px rgba(28, 25, 23, 0.10), 0 2px 6px rgba(28, 25, 23, 0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  overflow: "auto",
  zIndex: 5,
}

const headerRowStyle: React.CSSProperties = {
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

const escButtonStyle: React.CSSProperties = {
  padding: "2px 6px",
  border: "1px solid #E7E5E4",
  borderRadius: 4,
  background: "#FFFFFF",
  fontFamily: "JetBrains Mono",
  fontSize: 10,
  fontWeight: 500,
  color: "#A8A29E",
  cursor: "pointer",
}

const titleStyle: React.CSSProperties = {
  fontFamily: "JetBrains Mono",
  fontSize: 18,
  fontWeight: 600,
  color: "#1C1917",
  margin: 0,
}

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
}

const dividerStyle: React.CSSProperties = {
  width: "100%",
  height: 1,
  background: "#E7E5E4",
}

const descStyle: React.CSSProperties = {
  fontFamily: "Inter",
  fontSize: 13,
  color: "#44403C",
  margin: 0,
}

const listLabelStyle: React.CSSProperties = {
  fontFamily: "Inter",
  fontSize: 11,
  fontWeight: 500,
  color: "#78716C",
  margin: "4px 0 6px 0",
}

const connectionRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px",
  fontFamily: "JetBrains Mono",
  fontSize: 12,
}

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
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

const destructiveButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #E7E5E4",
  borderRadius: 6,
  background: "#FFFFFF",
  color: "#7F1D1D",
  fontFamily: "Inter",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
}
