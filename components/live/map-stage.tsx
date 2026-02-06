"use client"

import React from "react"

import { useCallback, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import type { Agent, CameraMode, MapTile, Phase, WorldMetrics } from "@/lib/types"

interface MapStageProps {
  map: MapTile[][]
  agents: Agent[]
  phase: Phase
  metrics: WorldMetrics | null
  cameraMode: CameraMode
}

const BIOME_COLORS: Record<string, string> = {
  water: "#1a4a6b",
  forest: "#1a3d2a",
  plains: "#2a3a1a",
  mountain: "#3a3530",
  desert: "#4a3a20",
}

const BUILDING_GLYPHS: Record<string, { symbol: string; color: string }> = {
  house: { symbol: "H", color: "#8cb4d0" },
  farm: { symbol: "F", color: "#7dba6a" },
  watchtower: { symbol: "W", color: "#d4a843" },
  council: { symbol: "C", color: "#c47dba" },
  storehouse: { symbol: "S", color: "#ba8a6a" },
  well: { symbol: "~", color: "#6abada" },
  wall: { symbol: "#", color: "#888" },
}

const PHASE_OVERLAY: Record<Phase, string> = {
  morning: "rgba(200, 170, 100, 0.04)",
  day: "rgba(200, 200, 150, 0.02)",
  evening: "rgba(150, 100, 180, 0.06)",
  night: "rgba(20, 30, 80, 0.12)",
}

function MetricPill({ label, value, suffix = "", direction }: { label: string; value: number; suffix?: string; direction?: "up" | "down" | null }) {
  return (
    <div className="flex items-center gap-1.5 glass-panel rounded-md px-2.5 py-1.5">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <motion.span
        key={value}
        initial={{ opacity: 0.5, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`font-mono text-xs font-bold ${
          direction === "up" ? "text-[hsl(var(--success))]" : direction === "down" ? "text-[hsl(var(--live-red))]" : "text-foreground"
        }`}
      >
        {Math.round(value)}{suffix}
      </motion.span>
    </div>
  )
}

export function MapStage({ map, agents, phase, metrics, cameraMode }: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  // Render a visible viewport of the map (center 30x30 area for performance)
  const VIEWPORT = 30
  const startX = Math.max(0, 15)
  const startY = Math.max(0, 15)
  const CELL_SIZE = 14

  const visibleMap = useMemo(() => {
    const rows: { tile: MapTile; x: number; y: number }[][] = []
    for (let y = startY; y < startY + VIEWPORT && y < map.length; y++) {
      const row: { tile: MapTile; x: number; y: number }[] = []
      for (let x = startX; x < startX + VIEWPORT && x < (map[y]?.length ?? 0); x++) {
        row.push({ tile: map[y][x], x, y })
      }
      rows.push(row)
    }
    return rows
  }, [map, startX, startY])

  const agentPositions = useMemo(() => {
    const positions = new Map<string, Agent>()
    for (const agent of agents) {
      const key = `${agent.position.x},${agent.position.y}`
      positions.set(key, agent)
    }
    return positions
  }, [agents])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom((z) => Math.max(0.5, Math.min(2.5, z + delta)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      setOffset((prev) => ({
        x: prev.x + (e.clientX - lastPos.current.x),
        y: prev.y + (e.clientY - lastPos.current.y),
      }))
      lastPos.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const hoveredInfo = hoveredTile && map[hoveredTile.y]?.[hoveredTile.x]
    ? map[hoveredTile.y][hoveredTile.x]
    : null

  return (
    <div className="relative flex-1 glass-panel rounded-xl overflow-hidden" ref={containerRef}>
      {/* Phase overlay */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ backgroundColor: PHASE_OVERLAY[phase] }} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-20 bg-[radial-gradient(ellipse_at_center,transparent_50%,hsl(var(--background))_100%)] opacity-60" />

      {/* Map grid */}
      <div
        className="relative h-full w-full overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex flex-col items-center justify-center h-full"
          style={{
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: isDragging.current ? "none" : "transform 0.1s ease-out",
          }}
        >
          <div className="inline-flex flex-col" style={{ gap: "1px" }}>
            {visibleMap.map((row, ry) => (
              <div key={ry} className="flex" style={{ gap: "1px" }}>
                {row.map(({ tile, x, y }) => {
                  const agentKey = `${x},${y}`
                  const agent = agentPositions.get(agentKey)
                  const building = tile.building
                  const isHovered = hoveredTile?.x === x && hoveredTile?.y === y

                  return (
                    <div
                      key={`${x}-${y}`}
                      className="relative flex items-center justify-center rounded-sm transition-colors"
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        backgroundColor: BIOME_COLORS[tile.biome],
                        opacity: tile.hasPath ? 1 : 0.85,
                        boxShadow: isHovered ? "0 0 6px 1px hsl(var(--primary) / 0.4)" : "none",
                      }}
                      onMouseEnter={() => setHoveredTile({ x, y })}
                      onMouseLeave={() => setHoveredTile(null)}
                    >
                      {tile.hasPath && (
                        <div className="absolute inset-0 bg-[hsl(var(--foreground)/.08)] rounded-sm" />
                      )}
                      {building && (
                        <span
                          className="text-[8px] font-bold font-mono leading-none"
                          style={{ color: BUILDING_GLYPHS[building]?.color ?? "#fff" }}
                        >
                          {BUILDING_GLYPHS[building]?.symbol ?? "?"}
                        </span>
                      )}
                      {agent && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute inset-0.5 rounded-full bg-primary/80 border border-primary flex items-center justify-center"
                        >
                          <span className="text-[6px] font-bold text-primary-foreground">{agent.name[0]}</span>
                        </motion.div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredInfo && hoveredTile && (
        <div className="absolute top-3 left-3 z-30 glass-panel-strong rounded-lg px-3 py-2 text-xs">
          <p className="font-mono font-bold capitalize text-foreground">{hoveredInfo.biome}</p>
          {hoveredInfo.building && (
            <p className="text-muted-foreground capitalize">Building: {hoveredInfo.building}</p>
          )}
          <div className="flex items-center gap-3 mt-1">
            <span className="text-muted-foreground">
              Flood: <span className={hoveredInfo.floodRisk > 0.3 ? "text-[hsl(var(--primary))]" : "text-foreground"}>{Math.round(hoveredInfo.floodRisk * 100)}%</span>
            </span>
            <span className="text-muted-foreground">
              Fire: <span className={hoveredInfo.fireRisk > 0.3 ? "text-[hsl(var(--live-red))]" : "text-foreground"}>{Math.round(hoveredInfo.fireRisk * 100)}%</span>
            </span>
          </div>
        </div>
      )}

      {/* Camera mode indicator */}
      <div className="absolute top-3 right-3 z-30 glass-panel rounded-md px-2 py-1">
        <span className="font-mono text-xs text-muted-foreground capitalize">
          {cameraMode.replace("_", " ")}
        </span>
      </div>

      {/* Metrics ribbon */}
      {metrics && (
        <div className="absolute bottom-3 left-3 right-3 z-30 flex flex-wrap gap-2">
          <MetricPill label="POP" value={metrics.population} />
          <MetricPill label="FOOD" value={metrics.foodDays} suffix="d" />
          <MetricPill label="H2O" value={metrics.waterDays} suffix="d" />
          <MetricPill label="MRL" value={metrics.morale} suffix="%" />
          <MetricPill label="UNR" value={metrics.unrest} suffix="%" />
          <MetricPill label="HP" value={metrics.healthRisk} suffix="%" direction={metrics.healthRisk > 40 ? "down" : null} />
          <MetricPill label="FIRE" value={metrics.fireStability} suffix="%" direction={metrics.fireStability < 50 ? "down" : null} />
        </div>
      )}
    </div>
  )
}
