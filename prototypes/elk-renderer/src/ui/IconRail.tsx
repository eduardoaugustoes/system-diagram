export type RailIcon = "visions" | "components" | "add"

interface IconRailProps {
  active: RailIcon | null
  onSelect: (icon: RailIcon | null) => void
}

export function IconRail({ active, onSelect }: IconRailProps) {
  const toggle = (icon: RailIcon) => () => onSelect(active === icon ? null : icon)
  return (
    <nav style={railStyle} aria-label="Primary">
      <RailButton active={active === "visions"} onClick={toggle("visions")} label="Visions">
        <VisionsGlyph />
      </RailButton>
      <RailButton active={active === "components"} onClick={toggle("components")} label="Components">
        <ComponentsGlyph />
      </RailButton>
      <RailButton active={active === "add"} onClick={toggle("add")} label="Add">
        <AddGlyph />
      </RailButton>
    </nav>
  )
}

function RailButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        border: "none",
        background: active ? "#F5F5F4" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: active ? "#1C1917" : "#78716C",
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </button>
  )
}

function VisionsGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ComponentsGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AddGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const railStyle: React.CSSProperties = {
  width: 48,
  height: "100%",
  background: "#FFFFFF",
  borderRight: "1px solid #E7E5E4",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "12px 0",
  gap: 6,
  flexShrink: 0,
}
