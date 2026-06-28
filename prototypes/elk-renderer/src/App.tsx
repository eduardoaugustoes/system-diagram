import { useCallback, useEffect, useMemo, useState } from "react"
import { applyPatch } from "./engine/engine"
import type { Patch } from "./engine/types"
import { blastRadius, overlayFromBlastRadius, type Overlay } from "./lens/blastRadius"
import { Graph } from "./renderer/Graph"
import { layoutModel, type LayoutResult } from "./renderer/layout"
import {
  addVisionFromModel,
  createVision,
  deleteVision,
  loadStore,
  recolorVision,
  renameVision,
  saveStore,
  setActive,
  type StoreState,
  updateVisionModel,
} from "./store/visionStore"
import type { OpenResult } from "./systemDiagramApi"
import { ComponentsPanel } from "./ui/ComponentsPanel"
import { EditPanel } from "./ui/EditPanel"
import { EmptyState } from "./ui/EmptyState"
import { FloatingSelection } from "./ui/FloatingSelection"
import { IconRail, type RailIcon } from "./ui/IconRail"
import { VisionsPanel } from "./ui/VisionsPanel"

export function App() {
  const [store, setStore] = useState<StoreState>(() => loadStore())
  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [railIcon, setRailIcon] = useState<RailIcon | null>(null)
  const [structureOnly, setStructureOnly] = useState(false)

  const activeVision = useMemo(
    () => store.visions.find(v => v.id === store.activeId) ?? store.visions[0],
    [store],
  )
  const model = activeVision?.model

  useEffect(() => {
    saveStore(store)
  }, [store])

  useEffect(() => {
    setSelectedId(null)
    setOverlay(null)
  }, [store.activeId])

  useEffect(() => {
    if (!model) return
    let cancelled = false
    layoutModel(model).then(result => {
      if (!cancelled) setLayout(result)
    })
    return () => {
      cancelled = true
    }
  }, [model])

  const runBlastRadius = useCallback(
    (nodeId: string) => {
      if (!model) return
      const result = blastRadius(model, nodeId, { direction: "both", maxHops: 3 })
      setOverlay(overlayFromBlastRadius(result))
    },
    [model],
  )

  const handlePatch = useCallback(
    (patch: Patch) => {
      if (!model || !activeVision) return
      const result = applyPatch(model, patch)
      if (!result.ok) {
        setError(result.errors.map(e => `${e.code}: ${e.message}`).join(" · "))
        return
      }
      setError(null)
      setStore(prev => updateVisionModel(prev, activeVision.id, result.model))
      setOverlay(null)
    },
    [model, activeVision],
  )

  const removeComponent = useCallback(
    (nodeId: string) => {
      handlePatch({ kind: "remove_component", componentId: nodeId, cascade: true })
      setSelectedId(null)
    },
    [handlePatch],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      )
        return
      if (event.key.toLowerCase() === "b" && selectedId) {
        runBlastRadius(selectedId)
      }
      if (event.key === "Escape") {
        if (overlay) {
          setOverlay(null)
        } else if (selectedId) {
          setSelectedId(null)
        } else if (railIcon) {
          setRailIcon(null)
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedId, overlay, railIcon, runBlastRadius])

  const handleOpenResult = useCallback((result: OpenResult, fallbackLabel: string) => {
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    const label = result.model.system.name || fallbackLabel
    setStore(s => addVisionFromModel(s, result.model, label))
    if (result.diagnostics.length > 0) {
      setError(`${result.diagnostics.length} note(s) from import — see console`)
      // eslint-disable-next-line no-console
      console.table(result.diagnostics)
    }
  }, [])

  const openFolder = useCallback(async () => {
    const r = await window.systemDiagram.openFolder()
    handleOpenResult(r, "Imported system")
  }, [handleOpenResult])

  const openFile = useCallback(async () => {
    const r = await window.systemDiagram.openFile()
    handleOpenResult(r, "Loaded system")
  }, [handleOpenResult])

  useEffect(() => {
    window.systemDiagram.onMenu(action => {
      if (action === "open-folder") void openFolder()
      else void openFile()
    })
  }, [openFolder, openFile])

  const overlayCaption = overlay?.legend ?? null
  const isEmpty = model && model.components.length === 0

  if (!activeVision) {
    return <EmptyState onOpenFolder={openFolder} onOpenFile={openFile} />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#FAFAF9" }}>
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, background: "#1C1917", borderRadius: 3 }} />
          <span style={brandStyle}>system-diagram</span>
          <span style={{ color: "#A8A29E", fontFamily: "JetBrains Mono", fontSize: 13 }}>/</span>
          <span style={{ color: "#78716C", fontFamily: "JetBrains Mono", fontSize: 13 }}>
            {activeVision ? `${activeVision.name.toLowerCase().replace(/\s+/g, "-")}.system.json` : "—"}
          </span>
          <span style={{ color: "#A8A29E", fontFamily: "JetBrains Mono", fontSize: 11 }}>
            rev {activeVision?.revision ?? 0}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {error && (
            <span style={{ color: "#7F1D1D", fontFamily: "JetBrains Mono", fontSize: 11 }}>{error}</span>
          )}
          {overlayCaption && (
            <span
              style={{
                padding: "4px 10px",
                background: "#FEF2F2",
                color: "#7F1D1D",
                fontFamily: "Inter",
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 4,
              }}
            >
              {overlayCaption}
            </span>
          )}
          <button
            onClick={() => setStructureOnly(v => !v)}
            style={structureOnly ? activeButtonStyle : secondaryButtonStyle}
            title="Hide implementation names — show structure by type only"
          >
            {structureOnly ? "Structure only" : "Show structure"}
          </button>
          <button
            onClick={() => selectedId && runBlastRadius(selectedId)}
            disabled={!selectedId}
            style={selectedId ? secondaryButtonStyle : disabledButtonStyle}
            title="Run Blast Radius on selected node (B)"
          >
            Blast Radius
          </button>
          <button
            onClick={() => setOverlay(null)}
            disabled={!overlay}
            style={overlay ? secondaryButtonStyle : disabledButtonStyle}
          >
            Clear overlay
          </button>
        </div>
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <IconRail active={railIcon} onSelect={setRailIcon} />
        {railIcon === "visions" && (
          <VisionsPanel
            visions={store.visions}
            activeId={store.activeId}
            onSelect={id => setStore(prev => setActive(prev, id))}
            onCreate={name => setStore(prev => createVision(prev, name))}
            onRename={(id, name) => setStore(prev => renameVision(prev, id, name))}
            onRecolor={(id, color) => setStore(prev => recolorVision(prev, id, color))}
            onDelete={id => setStore(prev => deleteVision(prev, id))}
          />
        )}
        {railIcon === "components" && model && (
          <ComponentsPanel model={model} selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {railIcon === "add" && model && <EditPanel model={model} onApply={handlePatch} />}
        <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {!model ? (
            <div style={messageStyle}>No vision selected.</div>
          ) : isEmpty ? (
            <EmptyCanvas
              visionName={activeVision?.name ?? ""}
              onOpenAdd={() => setRailIcon("add")}
            />
          ) : layout ? (
            <Graph
              model={model}
              layout={layout}
              overlay={overlay}
              selectedId={selectedId}
              onSelect={setSelectedId}
              structureOnly={structureOnly}
            />
          ) : (
            <div style={messageStyle}>Laying out…</div>
          )}
          {model && (
            <FloatingSelection
              model={model}
              selectedId={selectedId}
              onClose={() => setSelectedId(null)}
              onRunBlastRadius={runBlastRadius}
              onRemove={removeComponent}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function EmptyCanvas({ visionName, onOpenAdd }: { visionName: string; onOpenAdd: () => void }) {
  return (
    <div style={emptyContainerStyle}>
      <div style={{ fontSize: 22, fontWeight: 600, color: "#1C1917" }}>{visionName}</div>
      <div style={{ fontSize: 14, maxWidth: 360, textAlign: "center", color: "#78716C" }}>
        This vision has no components yet.
      </div>
      <button onClick={onOpenAdd} style={emptyButtonStyle}>
        Add first component
      </button>
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  height: 56,
  padding: "0 24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#FFFFFF",
  borderBottom: "1px solid #E7E5E4",
}

const brandStyle: React.CSSProperties = {
  fontFamily: "JetBrains Mono",
  fontSize: 13,
  fontWeight: 500,
  color: "#1C1917",
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #E7E5E4",
  background: "#FFFFFF",
  color: "#1C1917",
  fontFamily: "Inter",
  fontSize: 12,
  borderRadius: 6,
  cursor: "pointer",
}

const disabledButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: "#D6D3D1",
  cursor: "not-allowed",
}

const activeButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  background: "#1C1917",
  color: "#FFFFFF",
  border: "1px solid #1C1917",
}

const messageStyle: React.CSSProperties = {
  padding: 32,
  color: "#A8A29E",
  fontFamily: "Inter",
}

const emptyContainerStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  color: "#78716C",
  fontFamily: "Inter",
}

const emptyButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  border: "none",
  borderRadius: 6,
  background: "#1C1917",
  color: "#FFFFFF",
  fontFamily: "Inter",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
}
