interface EmptyStateProps {
  onOpenFolder: () => void
  onOpenFile: () => void
}

export function EmptyState({ onOpenFolder, onOpenFile }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 16,
        fontFamily: "Inter, sans-serif",
        color: "#57534E",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600 }}>No system loaded</div>
      <div style={{ fontSize: 13 }}>Open a CDK folder to import and render its architecture.</div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button onClick={onOpenFolder} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Open CDK Folder…
        </button>
        <button onClick={onOpenFile} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Open .system.json…
        </button>
      </div>
    </div>
  )
}
