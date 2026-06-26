import { useMemo } from "react"
import type { Component, Connection, Model } from "../engine/types"
import type { Overlay } from "../lens/blastRadius"
import type { LayoutResult } from "./layout"
import {
  COLORS,
  edgeOverlayContext,
  edgeStyle,
  nodeStyle,
  overlayContext,
} from "./styleTable"
import { iconForSubtype } from "./icons"

interface GraphProps {
  model: Model
  layout: LayoutResult
  overlay: Overlay | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function Graph({ model, layout, overlay, selectedId, onSelect }: GraphProps) {
  const nodeIndex = useMemo(() => {
    const map = new Map<string, Component>()
    for (const c of model.components) map.set(c.id, c)
    return map
  }, [model])

  const positionedNodes = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const n of layout.nodes) map.set(n.id, { x: n.x, y: n.y, width: n.width, height: n.height })
    return map
  }, [layout])

  const containerIds = useMemo(() => {
    const set = new Set<string>()
    for (const c of model.components) if (c.parentId) set.add(c.parentId)
    return set
  }, [model])

  const padding = 32
  const viewWidth = layout.width + padding * 2
  const viewHeight = layout.height + padding * 2

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${-padding} ${-padding} ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: COLORS.bg }}
      onClick={() => onSelect(null)}
    >
      <defs>
        <marker
          id="arrow-ink"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.ink} />
        </marker>
        <marker
          id="arrow-red"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.blockingRed} />
        </marker>
        <marker
          id="arrow-amber"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.softAmber} />
        </marker>
        <marker
          id="arrow-faded"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.faded} />
        </marker>
      </defs>
      {layout.edges.map(edge => {
        const connection = model.connections.find(c => c.id === edge.id) as Connection | undefined
        if (!connection) return null
        const ctx = edgeOverlayContext(overlay, connection)
        const style = edgeStyle(connection, ctx.inOverlay, ctx.blockingChain, ctx.faded)
        const marker = ctx.faded
          ? "url(#arrow-faded)"
          : ctx.blockingChain
            ? "url(#arrow-red)"
            : ctx.inOverlay
              ? "url(#arrow-amber)"
              : "url(#arrow-ink)"
        return edge.sections.map((section, i) => {
          const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
          const d = points
            .map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`)
            .join(" ")
          return (
            <g key={`${edge.id}-${i}`}>
              <path
                d={d}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dashArray}
                markerEnd={marker}
              />
              {style.doubleStroke && (
                <path
                  d={d}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  transform="translate(0, 3)"
                />
              )}
            </g>
          )
        })
      })}
      {layout.nodes.map(positioned => {
        const component = nodeIndex.get(positioned.id)
        if (!component) return null
        if (component.parentId) {
          // contained child: a small chip with a type label + its own name
          const childIcon = iconForSubtype(component.metadata?.subtype as string | undefined)
          return (
            <g key={positioned.id} transform={`translate(${positioned.x}, ${positioned.y})`}>
              <rect
                width={positioned.width}
                height={positioned.height}
                rx={4}
                ry={4}
                fill={COLORS.cardBg}
                stroke={COLORS.faded}
                strokeWidth={1}
              />
              {childIcon && (
                <text
                  x={positioned.width / 2}
                  y={positioned.height / 2 - 5}
                  textAnchor="middle"
                  fontFamily="Inter, sans-serif"
                  fontSize={7}
                  fontWeight={600}
                  letterSpacing={0.5}
                  fill={COLORS.mutedInk}
                >
                  {childIcon.label.toUpperCase()}
                </text>
              )}
              <text
                x={positioned.width / 2}
                y={positioned.height / 2 + 7}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
                fontSize={8}
                fill={COLORS.ink}
              >
                {component.name}
              </text>
            </g>
          )
        }
        const ctx = overlayContext(overlay, positioned.id)
        const style = nodeStyle(
          component.kind,
          ctx.intensity,
          ctx.isSource,
          ctx.inOverlay,
          ctx.faded,
        )
        const selected = selectedId === positioned.id
        return (
          <g
            key={positioned.id}
            transform={`translate(${positioned.x}, ${positioned.y})`}
            style={{ cursor: "pointer" }}
            onClick={event => {
              event.stopPropagation()
              onSelect(positioned.id)
            }}
          >
            <NodeShape
              kind={component.kind}
              width={positioned.width}
              height={positioned.height}
              fill={style.fill}
              stroke={selected ? COLORS.ink : style.stroke}
              strokeWidth={selected ? 2.5 : style.strokeWidth}
              cornerRadius={style.cornerRadius}
            />
            {(() => {
              const icon = iconForSubtype(component.metadata?.subtype as string | undefined)
              return icon ? (
                <text
                  x={positioned.width / 2}
                  y={14}
                  textAnchor="middle"
                  fontFamily="Inter, sans-serif"
                  fontSize={9}
                  fontWeight={600}
                  letterSpacing={0.5}
                  fill={ctx.faded ? COLORS.fadedText : COLORS.mutedInk}
                >
                  {icon.label.toUpperCase()}
                </text>
              ) : null
            })()}
            <text
              x={positioned.width / 2}
              y={
                containerIds.has(positioned.id)
                  ? 26
                  : component.kind === "queue"
                    ? positioned.height / 2 + 4
                    : positioned.height / 2 - 2
              }
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
              fontSize={12}
              fontWeight={500}
              fill={style.textFill}
            >
              {component.name}
            </text>
            {component.kind !== "queue" && component.ownerId && (
              <text
                x={positioned.width / 2}
                y={positioned.height / 2 + 14}
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontSize={10}
                fill={ctx.faded ? COLORS.fadedText : COLORS.mutedInk}
              >
                {component.ownerId}
              </text>
            )}
            {ctx.hop !== undefined && (
              <g transform={`translate(${positioned.width - 6}, ${-6})`}>
                <circle
                  r={9}
                  fill={
                    ctx.isSource
                      ? COLORS.ink
                      : (ctx.intensity ?? 0) > 0.6
                        ? COLORS.blockingRed
                        : COLORS.softAmber
                  }
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="JetBrains Mono, monospace"
                  fontSize={9}
                  fontWeight={600}
                  fill="#FFFFFF"
                >
                  {ctx.hop}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

interface NodeShapeProps {
  kind: Component["kind"]
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius: number
}

function NodeShape({ kind, width, height, fill, stroke, strokeWidth, cornerRadius }: NodeShapeProps) {
  if (kind === "external") {
    return (
      <rect
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="6 4"
      />
    )
  }
  return (
    <rect
      width={width}
      height={height}
      rx={cornerRadius}
      ry={cornerRadius}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  )
}
