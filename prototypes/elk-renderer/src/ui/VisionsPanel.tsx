import { useState } from "react"
import { PAPER_COLORS, type VisionEntry } from "../store/visionStore"

interface VisionsPanelProps {
  visions: VisionEntry[]
  activeId: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: string) => void
  onDelete: (id: string) => void
}

export function VisionsPanel({
  visions,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onRecolor,
  onDelete,
}: VisionsPanelProps) {
  const ordered = [...visions].sort((a, b) => a.order - b.order)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)

  const handleCreate = () => {
    const name = window.prompt("Vision name?", "New vision")
    if (name && name.trim()) onCreate(name.trim())
  }

  return (
    <aside style={panelStyle}>
      <PanelHeader title="VISIONS" count={visions.length} />
      <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
        {ordered.map(vision => (
          <Row
            key={vision.id}
            vision={vision}
            active={vision.id === activeId}
            editing={editingId === vision.id}
            pickingColor={colorPickerId === vision.id}
            onSelect={() => onSelect(vision.id)}
            onStartEdit={() => setEditingId(vision.id)}
            onCommitEdit={name => {
              onRename(vision.id, name)
              setEditingId(null)
            }}
            onTogglePicker={() =>
              setColorPickerId(colorPickerId === vision.id ? null : vision.id)
            }
            onPickColor={color => {
              onRecolor(vision.id, color)
              setColorPickerId(null)
            }}
            onDelete={() => {
              if (window.confirm(`Delete "${vision.name}"?`)) onDelete(vision.id)
            }}
          />
        ))}
      </div>
      <div style={footerStyle}>
        <button onClick={handleCreate} style={newButtonStyle}>
          + new vision
        </button>
      </div>
    </aside>
  )
}

function PanelHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={headerStyle}>
      <span style={eyebrowStyle}>{title}</span>
      <span style={countStyle}>{count}</span>
    </div>
  )
}

function Row({
  vision,
  active,
  editing,
  pickingColor,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onTogglePicker,
  onPickColor,
  onDelete,
}: {
  vision: VisionEntry
  active: boolean
  editing: boolean
  pickingColor: boolean
  onSelect: () => void
  onStartEdit: () => void
  onCommitEdit: (name: string) => void
  onTogglePicker: () => void
  onPickColor: (color: string) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(vision.name)
  return (
    <div style={{ position: "relative", marginBottom: 2 }}>
      <div
        onClick={onSelect}
        onDoubleClick={onStartEdit}
        onContextMenu={event => {
          event.preventDefault()
          onTogglePicker()
        }}
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 10,
          padding: "8px 8px 8px 0",
          borderRadius: 4,
          background: active ? "#F5F5F4" : "transparent",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 3,
            background: active ? "#1C1917" : vision.color,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => onCommitEdit(draft.trim() || vision.name)}
              onKeyDown={e => {
                if (e.key === "Enter") onCommitEdit(draft.trim() || vision.name)
                if (e.key === "Escape") onCommitEdit(vision.name)
              }}
              style={inputStyle}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              style={{
                fontFamily: "Inter",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: "#1C1917",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {vision.name}
            </span>
          )}
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: active ? "#78716C" : "#A8A29E" }}>
            {vision.model.components.length} comp · {vision.model.connections.length} conn
          </span>
        </div>
        {active && (
          <button
            onClick={e => {
              e.stopPropagation()
              onDelete()
            }}
            title="Delete vision"
            style={deleteStyle}
          >
            ×
          </button>
        )}
      </div>
      {pickingColor && (
        <div style={pickerStyle}>
          {PAPER_COLORS.map(color => (
            <button
              key={color}
              onClick={() => onPickColor(color)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                border: color === vision.color ? "2px solid #1C1917" : "1px solid rgba(28, 25, 23, 0.15)",
                background: color,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
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

const footerStyle: React.CSSProperties = {
  padding: 12,
  borderTop: "1px solid #E7E5E4",
}

const newButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "transparent",
  border: "1px dashed #A8A29E",
  borderRadius: 4,
  fontFamily: "Inter",
  fontSize: 12,
  color: "#78716C",
  cursor: "pointer",
}

const inputStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  fontFamily: "Inter",
  fontSize: 13,
  fontWeight: 500,
  color: "#1C1917",
  outline: "none",
  padding: 0,
  width: "100%",
}

const deleteStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  border: "none",
  background: "transparent",
  color: "rgba(28, 25, 23, 0.5)",
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  alignSelf: "center",
}

const pickerStyle: React.CSSProperties = {
  position: "absolute",
  top: 4,
  right: 4,
  display: "flex",
  gap: 6,
  padding: 8,
  background: "#FFFFFF",
  border: "1px solid #E7E5E4",
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(28, 25, 23, 0.12)",
  zIndex: 20,
}
