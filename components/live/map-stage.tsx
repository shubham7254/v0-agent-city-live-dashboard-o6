"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import type { Agent, CameraMode, MapTile, Phase, WorldMetrics } from "@/lib/types"

interface MapStageProps {
  map: MapTile[][]
  agents: Agent[]
  phase: Phase
  metrics: WorldMetrics | null
  cameraMode: CameraMode
}

// ── Constants ──
const CELL = 18
const VIEWPORT = 32

// ── Color palettes per biome (base, variation1, variation2) ──
const BIOME_PALETTE: Record<string, { base: string; v1: string; v2: string }> = {
  water: { base: "#1b4f72", v1: "#1a5276", v2: "#154360" },
  forest: { base: "#1e4d2b", v1: "#1a5c30", v2: "#145226" },
  plains: { base: "#3d5c2e", v1: "#4a6b35", v2: "#35522a" },
  mountain: { base: "#4a4540", v1: "#555048", v2: "#3d3935" },
  desert: { base: "#8c7851", v1: "#9a8560", v2: "#7a6a46" },
}

// ── Phase tint overlays ──
const PHASE_TINT: Record<Phase, string> = {
  morning: "rgba(255, 210, 120, 0.07)",
  day: "rgba(255, 255, 220, 0.03)",
  evening: "rgba(180, 120, 220, 0.1)",
  night: "rgba(15, 20, 60, 0.22)",
}

// ── Sprite drawing functions (pixel art style on canvas) ──

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, variant: number) {
  const cx = x + size / 2
  const base = y + size
  const trunkW = size * 0.12
  const trunkH = size * 0.3

  // Trunk
  ctx.fillStyle = variant % 2 === 0 ? "#5d4037" : "#4e342e"
  ctx.fillRect(cx - trunkW / 2, base - trunkH, trunkW, trunkH)

  if (variant % 3 === 0) {
    // Pine tree (triangle)
    const treeH = size * 0.65
    ctx.fillStyle = "#2e7d32"
    ctx.beginPath()
    ctx.moveTo(cx, base - trunkH - treeH)
    ctx.lineTo(cx - size * 0.3, base - trunkH)
    ctx.lineTo(cx + size * 0.3, base - trunkH)
    ctx.closePath()
    ctx.fill()

    // Lighter layer
    ctx.fillStyle = "#388e3c"
    ctx.beginPath()
    ctx.moveTo(cx, base - trunkH - treeH + size * 0.15)
    ctx.lineTo(cx - size * 0.22, base - trunkH - size * 0.1)
    ctx.lineTo(cx + size * 0.22, base - trunkH - size * 0.1)
    ctx.closePath()
    ctx.fill()
  } else if (variant % 3 === 1) {
    // Round deciduous tree
    const r = size * 0.3
    ctx.fillStyle = "#388e3c"
    ctx.beginPath()
    ctx.arc(cx, base - trunkH - r * 0.8, r, 0, Math.PI * 2)
    ctx.fill()

    // Highlight
    ctx.fillStyle = "#43a047"
    ctx.beginPath()
    ctx.arc(cx - r * 0.2, base - trunkH - r * 1.0, r * 0.6, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Bushy tree
    const r = size * 0.25
    ctx.fillStyle = "#2e7d32"
    ctx.beginPath()
    ctx.arc(cx - r * 0.4, base - trunkH - r * 0.6, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + r * 0.4, base - trunkH - r * 0.6, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#4caf50"
    ctx.beginPath()
    ctx.arc(cx, base - trunkH - r * 1.1, r * 0.85, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cx = x + size / 2
  const base = y + size
  const w = size * 0.7
  const h = size * 0.45

  // Walls
  ctx.fillStyle = "#c9a96e"
  ctx.fillRect(cx - w / 2, base - h, w, h)

  // Dark side wall accent
  ctx.fillStyle = "#b08d57"
  ctx.fillRect(cx + w / 2 - w * 0.15, base - h, w * 0.15, h)

  // Roof (triangle)
  ctx.fillStyle = "#8d4925"
  ctx.beginPath()
  ctx.moveTo(cx, base - h - size * 0.35)
  ctx.lineTo(cx - w / 2 - size * 0.08, base - h)
  ctx.lineTo(cx + w / 2 + size * 0.08, base - h)
  ctx.closePath()
  ctx.fill()

  // Door
  ctx.fillStyle = "#5d4037"
  ctx.fillRect(cx - size * 0.06, base - size * 0.22, size * 0.12, size * 0.22)

  // Window
  ctx.fillStyle = "#fff9c4"
  ctx.fillRect(cx + size * 0.1, base - h + size * 0.08, size * 0.1, size * 0.1)
}

function drawFarm(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  // Field rows
  const rows = 4
  const rowH = size * 0.12
  const margin = size * 0.15
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#6d8f3a" : "#7da342"
    ctx.fillRect(x + margin, y + margin + i * (rowH + 2), size - margin * 2, rowH)
  }

  // Wheat stalks
  ctx.strokeStyle = "#c9b458"
  ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    const sx = x + margin + (size - margin * 2) * (i / 5)
    const sy = y + size - margin
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx, sy - size * 0.3)
    ctx.stroke()
    // Wheat head
    ctx.fillStyle = "#daa520"
    ctx.beginPath()
    ctx.arc(sx, sy - size * 0.32, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWatchtower(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cx = x + size / 2
  const base = y + size
  const w = size * 0.3
  const h = size * 0.75

  // Tower body
  ctx.fillStyle = "#78909c"
  ctx.fillRect(cx - w / 2, base - h, w, h)

  // Tower top platform
  ctx.fillStyle = "#546e7a"
  ctx.fillRect(cx - w * 0.8, base - h - size * 0.06, w * 1.6, size * 0.06)

  // Roof (small triangle)
  ctx.fillStyle = "#37474f"
  ctx.beginPath()
  ctx.moveTo(cx, base - h - size * 0.22)
  ctx.lineTo(cx - w * 0.6, base - h - size * 0.06)
  ctx.lineTo(cx + w * 0.6, base - h - size * 0.06)
  ctx.closePath()
  ctx.fill()

  // Torch/light at top
  ctx.fillStyle = "#ff9800"
  ctx.beginPath()
  ctx.arc(cx, base - h - size * 0.12, size * 0.04, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "rgba(255, 152, 0, 0.3)"
  ctx.beginPath()
  ctx.arc(cx, base - h - size * 0.12, size * 0.1, 0, Math.PI * 2)
  ctx.fill()
}

function drawCouncil(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cx = x + size / 2
  const base = y + size
  const w = size * 0.8
  const h = size * 0.5

  // Large stone building
  ctx.fillStyle = "#8d8d8d"
  ctx.fillRect(cx - w / 2, base - h, w, h)

  // Columns
  ctx.fillStyle = "#9e9e9e"
  for (let i = 0; i < 3; i++) {
    const colX = cx - w / 2 + w * 0.15 + (w * 0.35 * i)
    ctx.fillRect(colX, base - h, size * 0.06, h)
  }

  // Peaked roof
  ctx.fillStyle = "#5d4037"
  ctx.beginPath()
  ctx.moveTo(cx, base - h - size * 0.25)
  ctx.lineTo(cx - w / 2 - size * 0.05, base - h)
  ctx.lineTo(cx + w / 2 + size * 0.05, base - h)
  ctx.closePath()
  ctx.fill()

  // Door
  ctx.fillStyle = "#4e342e"
  ctx.beginPath()
  ctx.arc(cx, base - size * 0.15, size * 0.08, Math.PI, 0)
  ctx.fillRect(cx - size * 0.08, base - size * 0.15, size * 0.16, size * 0.15)
  ctx.fill()
}

function drawStorehouse(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cx = x + size / 2
  const base = y + size
  const w = size * 0.7
  const h = size * 0.4

  // Barn body
  ctx.fillStyle = "#8d6e63"
  ctx.fillRect(cx - w / 2, base - h, w, h)

  // Barn roof (rounded)
  ctx.fillStyle = "#6d4c41"
  ctx.beginPath()
  ctx.moveTo(cx - w / 2 - 2, base - h)
  ctx.quadraticCurveTo(cx, base - h - size * 0.3, cx + w / 2 + 2, base - h)
  ctx.fill()

  // Cross beams
  ctx.strokeStyle = "#5d4037"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx - w / 2, base - h)
  ctx.lineTo(cx + w / 2, base)
  ctx.moveTo(cx + w / 2, base - h)
  ctx.lineTo(cx - w / 2, base)
  ctx.stroke()
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cx = x + size / 2
  const cy = y + size * 0.55

  // Stone ring
  ctx.fillStyle = "#90a4ae"
  ctx.beginPath()
  ctx.ellipse(cx, cy, size * 0.25, size * 0.15, 0, 0, Math.PI * 2)
  ctx.fill()

  // Water inside
  ctx.fillStyle = "#42a5f5"
  ctx.beginPath()
  ctx.ellipse(cx, cy, size * 0.18, size * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()

  // Highlight on water
  ctx.fillStyle = "rgba(144, 202, 249, 0.6)"
  ctx.beginPath()
  ctx.ellipse(cx - size * 0.05, cy - size * 0.02, size * 0.06, size * 0.03, 0, 0, Math.PI * 2)
  ctx.fill()

  // Support posts
  ctx.fillStyle = "#5d4037"
  ctx.fillRect(cx - size * 0.2, cy - size * 0.35, size * 0.04, size * 0.35)
  ctx.fillRect(cx + size * 0.16, cy - size * 0.35, size * 0.04, size * 0.35)

  // Crossbar
  ctx.fillRect(cx - size * 0.22, cy - size * 0.37, size * 0.44, size * 0.04)
}

function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const base = y + size
  const h = size * 0.5

  // Stone wall
  ctx.fillStyle = "#757575"
  ctx.fillRect(x + 2, base - h, size - 4, h)

  // Brick lines
  ctx.strokeStyle = "#616161"
  ctx.lineWidth = 0.5
  for (let row = 0; row < 3; row++) {
    const ry = base - h + row * (h / 3)
    ctx.beginPath()
    ctx.moveTo(x + 2, ry)
    ctx.lineTo(x + size - 2, ry)
    ctx.stroke()
    // Vertical joints (offset every other row)
    const offset = row % 2 === 0 ? 0 : size * 0.15
    for (let col = 0; col < 3; col++) {
      const vx = x + 2 + offset + (size - 4) * (col / 3)
      ctx.beginPath()
      ctx.moveTo(vx, ry)
      ctx.lineTo(vx, ry + h / 3)
      ctx.stroke()
    }
  }

  // Battlement tops
  ctx.fillStyle = "#9e9e9e"
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + 3 + i * (size * 0.3), base - h - size * 0.1, size * 0.18, size * 0.1)
  }
}

// ── Water animation helpers ──
function drawWaterTile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, tick: number, hash: number) {
  ctx.fillStyle = BIOME_PALETTE.water.base
  ctx.fillRect(x, y, size, size)

  // Animated wave highlights
  const waveSeed = (hash + tick * 0.015) % (Math.PI * 2)
  ctx.fillStyle = "rgba(100, 180, 230, 0.15)"
  const w1x = x + size * 0.2 + Math.sin(waveSeed) * size * 0.1
  const w1y = y + size * 0.4 + Math.cos(waveSeed * 1.3) * size * 0.08
  ctx.beginPath()
  ctx.ellipse(w1x, w1y, size * 0.2, size * 0.06, waveSeed * 0.3, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "rgba(130, 200, 255, 0.1)"
  const w2x = x + size * 0.7 + Math.sin(waveSeed * 0.8 + 2) * size * 0.08
  const w2y = y + size * 0.65 + Math.cos(waveSeed * 1.1 + 1) * size * 0.06
  ctx.beginPath()
  ctx.ellipse(w2x, w2y, size * 0.15, size * 0.04, -waveSeed * 0.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = "rgba(160, 140, 100, 0.4)"
  ctx.fillRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7)

  // Path stones
  ctx.fillStyle = "rgba(140, 120, 85, 0.3)"
  ctx.beginPath()
  ctx.arc(x + size * 0.3, y + size * 0.4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + size * 0.6, y + size * 0.55, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + size * 0.45, y + size * 0.7, 1.8, 0, Math.PI * 2)
  ctx.fill()
}

// ── Agent rendering ──
const AGENT_COLORS = [
  "#26c6da", "#66bb6a", "#ef5350", "#ffa726", "#ab47bc",
  "#42a5f5", "#ec407a", "#8d6e63", "#78909c", "#ffca28",
]

function drawAgent(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  agent: Agent,
  index: number,
  tick: number
) {
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size * 0.35
  const color = AGENT_COLORS[index % AGENT_COLORS.length]
  const bobY = Math.sin(tick * 0.03 + index) * 1.5

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + r + 1, r * 0.7, r * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()

  // Body glow
  ctx.fillStyle = color + "30"
  ctx.beginPath()
  ctx.arc(cx, cy + bobY, r * 1.4, 0, Math.PI * 2)
  ctx.fill()

  // Body circle
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy + bobY, r, 0, Math.PI * 2)
  ctx.fill()

  // Border ring
  ctx.strokeStyle = color + "80"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy + bobY, r + 1, 0, Math.PI * 2)
  ctx.stroke()

  // Name initial
  ctx.fillStyle = "#ffffff"
  ctx.font = `bold ${Math.round(size * 0.32)}px monospace`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(agent.name[0], cx, cy + bobY + 0.5)

  // Status indicator dot
  const statusColor =
    agent.status === "working" ? "#4caf50" :
    agent.status === "sleeping" ? "#78909c" :
    agent.status === "in_council" ? "#26c6da" :
    agent.status === "on_watch" ? "#ffa726" :
    agent.status === "exploring" ? "#ab47bc" : "#9e9e9e"

  ctx.fillStyle = statusColor
  ctx.beginPath()
  ctx.arc(cx + r * 0.7, cy + bobY - r * 0.7, size * 0.08, 0, Math.PI * 2)
  ctx.fill()
}

// ── Building dispatcher ──
const BUILDING_DRAWERS: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void> = {
  house: drawHouse,
  farm: drawFarm,
  watchtower: drawWatchtower,
  council: drawCouncil,
  storehouse: drawStorehouse,
  well: drawWell,
  wall: drawWall,
}

// ── Metric pill ──
function MetricPill({ label, value, suffix = "", direction }: { label: string; value: number; suffix?: string; direction?: "up" | "down" | null }) {
  return (
    <div className="flex items-center gap-1.5 glass-panel rounded-md px-2.5 py-1.5">
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <motion.span
        key={value}
        initial={{ opacity: 0.5, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`font-mono text-[10px] font-bold ${
          direction === "up" ? "text-[hsl(var(--success))]" : direction === "down" ? "text-[hsl(var(--live-red))]" : "text-foreground"
        }`}
      >
        {Math.round(value)}{suffix}
      </motion.span>
    </div>
  )
}

// ── Main component ──
export function MapStage({ map, agents, phase, metrics, cameraMode }: MapStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const animTick = useRef(0)
  const rafRef = useRef<number>(0)

  // Center viewport
  const startX = Math.max(0, 30 - Math.floor(VIEWPORT / 2))
  const startY = Math.max(0, 30 - Math.floor(VIEWPORT / 2))

  // Precompute tile hash for deterministic decorations
  const tileHash = useCallback((x: number, y: number) => {
    return ((x * 2654435761) ^ (y * 2246822519)) >>> 0
  }, [])

  // Agent position lookup
  const agentPositions = useMemo(() => {
    const positions = new Map<string, { agent: Agent; index: number }>()
    for (let i = 0; i < agents.length; i++) {
      const key = `${agents[i].position.x},${agents[i].position.y}`
      positions.set(key, { agent: agents[i], index: i })
    }
    return positions
  }, [agents])

  // Main render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = VIEWPORT * CELL
    const h = VIEWPORT * CELL
    canvas.width = w
    canvas.height = h

    ctx.clearRect(0, 0, w, h)
    animTick.current++

    // Render tiles
    for (let dy = 0; dy < VIEWPORT; dy++) {
      const wy = startY + dy
      if (wy >= map.length) continue
      for (let dx = 0; dx < VIEWPORT; dx++) {
        const wx = startX + dx
        if (wx >= (map[wy]?.length ?? 0)) continue
        const tile = map[wy][wx]
        const px = dx * CELL
        const py = dy * CELL
        const hash = tileHash(wx, wy)

        // Base biome
        if (tile.biome === "water") {
          drawWaterTile(ctx, px, py, CELL, animTick.current, hash)
        } else {
          const palette = BIOME_PALETTE[tile.biome] ?? BIOME_PALETTE.plains
          const variants = [palette.base, palette.v1, palette.v2]
          ctx.fillStyle = variants[hash % 3]
          ctx.fillRect(px, py, CELL, CELL)

          // Grass details on plains
          if (tile.biome === "plains" && !tile.building && hash % 4 === 0) {
            ctx.fillStyle = "rgba(100, 170, 60, 0.2)"
            ctx.beginPath()
            ctx.arc(px + (hash % 12) + 3, py + ((hash >> 4) % 12) + 3, 1.5, 0, Math.PI * 2)
            ctx.fill()
          }

          // Scatter trees in forest biome
          if (tile.biome === "forest" && !tile.building) {
            const treeDensity = 1 + (hash % 2)
            for (let t = 0; t < treeDensity; t++) {
              drawTree(ctx, px + (t * 4) % 6, py, CELL, hash + t)
            }
          }

          // Mountain rocks
          if (tile.biome === "mountain" && !tile.building) {
            ctx.fillStyle = "rgba(120, 110, 100, 0.5)"
            const rx = px + (hash % 8) + 2
            const ry = py + ((hash >> 3) % 8) + 2
            ctx.beginPath()
            ctx.moveTo(rx, ry + 6)
            ctx.lineTo(rx + 4, ry)
            ctx.lineTo(rx + 8, ry + 6)
            ctx.closePath()
            ctx.fill()
            ctx.fillStyle = "rgba(160, 150, 140, 0.3)"
            ctx.beginPath()
            ctx.moveTo(rx + 2, ry + 6)
            ctx.lineTo(rx + 5, ry + 1)
            ctx.lineTo(rx + 7, ry + 6)
            ctx.closePath()
            ctx.fill()
          }

          // Desert cacti
          if (tile.biome === "desert" && !tile.building && hash % 5 === 0) {
            ctx.fillStyle = "#558b2f"
            const cactX = px + CELL * 0.4
            const cactBase = py + CELL * 0.9
            ctx.fillRect(cactX, cactBase - CELL * 0.45, 2.5, CELL * 0.45)
            // Arms
            ctx.fillRect(cactX - 3, cactBase - CELL * 0.35, 3, 2)
            ctx.fillRect(cactX - 3, cactBase - CELL * 0.35 - 4, 2, 4)
            ctx.fillRect(cactX + 2.5, cactBase - CELL * 0.25, 3, 2)
            ctx.fillRect(cactX + 3.5, cactBase - CELL * 0.25 - 3, 2, 3)
          }
        }

        // Path overlay
        if (tile.hasPath) {
          drawPath(ctx, px, py, CELL)
        }

        // Building
        if (tile.building && BUILDING_DRAWERS[tile.building]) {
          BUILDING_DRAWERS[tile.building](ctx, px, py, CELL)
        }
      }
    }

    // Render agents on top
    for (let dy = 0; dy < VIEWPORT; dy++) {
      const wy = startY + dy
      for (let dx = 0; dx < VIEWPORT; dx++) {
        const wx = startX + dx
        const key = `${wx},${wy}`
        const agentInfo = agentPositions.get(key)
        if (agentInfo) {
          drawAgent(ctx, dx * CELL, dy * CELL, CELL, agentInfo.agent, agentInfo.index, animTick.current)
        }
      }
    }

    // Phase tint overlay
    ctx.fillStyle = PHASE_TINT[phase]
    ctx.fillRect(0, 0, w, h)

    rafRef.current = requestAnimationFrame(render)
  }, [map, agents, phase, agentPositions, startX, startY, tileHash])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  // Pan/zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom((z) => Math.max(0.5, Math.min(3, z + delta)))
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

    // Track hovered tile for tooltip
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const mx = (e.clientX - rect.left) * scaleX
      const my = (e.clientY - rect.top) * scaleY
      const tx = Math.floor(mx / CELL) + startX
      const ty = Math.floor(my / CELL) + startY
      if (tx >= 0 && tx < 60 && ty >= 0 && ty < 60) {
        setHoveredTile({ x: tx, y: ty })
      } else {
        setHoveredTile(null)
      }
    }
  }, [startX, startY])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const hoveredInfo = hoveredTile && map[hoveredTile.y]?.[hoveredTile.x] ? map[hoveredTile.y][hoveredTile.x] : null
  const hoveredAgent = hoveredTile ? agentPositions.get(`${hoveredTile.x},${hoveredTile.y}`) : null

  return (
    <div className="relative flex-1 glass-panel rounded-xl overflow-hidden" ref={containerRef}>
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-20 bg-[radial-gradient(ellipse_at_center,transparent_50%,hsl(var(--background))_100%)] opacity-50" />

      {/* Canvas container */}
      <div
        className="relative h-full w-full overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas
          ref={canvasRef}
          className="rounded-lg"
          style={{
            width: VIEWPORT * CELL,
            height: VIEWPORT * CELL,
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: isDragging.current ? "none" : "transform 0.1s ease-out",
            imageRendering: "pixelated",
          }}
        />
      </div>

      {/* Hover tooltip */}
      {hoveredInfo && hoveredTile && (
        <div className="absolute top-3 left-3 z-30 glass-panel-strong rounded-lg px-3 py-2 text-xs">
          <p className="font-mono font-bold capitalize text-foreground">{hoveredInfo.biome}</p>
          {hoveredInfo.building && (
            <p className="text-muted-foreground capitalize">
              Building: <span className="text-foreground">{hoveredInfo.building}</span>
            </p>
          )}
          {hoveredAgent && (
            <p className="text-primary font-semibold mt-0.5">
              {hoveredAgent.agent.name} ({hoveredAgent.agent.archetype})
            </p>
          )}
          <div className="flex items-center gap-3 mt-1">
            <span className="text-muted-foreground">
              Flood: <span className={hoveredInfo.floodRisk > 0.3 ? "text-[hsl(var(--primary))]" : "text-foreground"}>{Math.round(hoveredInfo.floodRisk * 100)}%</span>
            </span>
            <span className="text-muted-foreground">
              Fire: <span className={hoveredInfo.fireRisk > 0.3 ? "text-[hsl(var(--live-red))]" : "text-foreground"}>{Math.round(hoveredInfo.fireRisk * 100)}%</span>
            </span>
          </div>
          <p className="text-muted-foreground/50 mt-0.5 font-mono">
            [{hoveredTile.x}, {hoveredTile.y}]
          </p>
        </div>
      )}

      {/* Camera mode indicator */}
      <div className="absolute top-3 right-3 z-30 glass-panel rounded-md px-2 py-1">
        <span className="font-mono text-[10px] text-muted-foreground capitalize">
          {cameraMode.replace("_", " ")}
        </span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-14 right-3 z-30 glass-panel rounded-md px-2 py-1.5 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#2e7d32" },
          { label: "Plains", color: "#4a6b35" },
          { label: "Water", color: "#1b4f72" },
          { label: "Mountain", color: "#555048" },
          { label: "Desert", color: "#9a8560" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="font-mono text-[9px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Metrics ribbon */}
      {metrics && (
        <div className="absolute bottom-3 left-3 right-20 z-30 flex flex-wrap gap-2">
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
