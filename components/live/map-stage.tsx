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

// Tile size in pixels (satellite style needs larger tiles for detail)
const CELL = 48

// ── Simplex-style noise (procedural terrain) ──
// Deterministic hash for infinite terrain generation
function hash2d(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0
  h = (h ^ (h >> 13)) * 1274126177
  h = (h ^ (h >> 16))
  return (h >>> 0) / 4294967296 // 0..1
}

// Smooth noise with interpolation for natural terrain
function smoothNoise(x: number, y: number, scale: number): number {
  const sx = x / scale
  const sy = y / scale
  const ix = Math.floor(sx)
  const iy = Math.floor(sy)
  const fx = sx - ix
  const fy = sy - iy
  // Smoothstep
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2d(ix, iy)
  const b = hash2d(ix + 1, iy)
  const c = hash2d(ix, iy + 1)
  const d = hash2d(ix + 1, iy + 1)
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
}

// Fractal noise (octaves) for more natural terrain
function fbm(x: number, y: number, octaves: number = 4): number {
  let val = 0
  let amp = 0.5
  let scale = 30
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x, y, scale) * amp
    amp *= 0.5
    scale *= 0.5
  }
  return val
}

// Generate biome for procedural world tile
function getProceduralBiome(wx: number, wy: number): { biome: MapTile["biome"]; hasTree: boolean; treeVariant: number } {
  const elevation = fbm(wx + 500, wy + 500, 5)
  const moisture = fbm(wx + 2000, wy + 3000, 4)
  const detail = hash2d(wx * 7 + 13, wy * 11 + 7)

  let biome: MapTile["biome"] = "plains"
  let hasTree = false
  let treeVariant = 0

  if (elevation < 0.30) {
    biome = "water"
  } else if (elevation < 0.36) {
    // Beach/shoreline - sandy
    biome = "desert"
  } else if (elevation > 0.72) {
    biome = "mountain"
  } else if (elevation > 0.62) {
    // High elevation sparse
    biome = moisture > 0.45 ? "forest" : "plains"
    hasTree = moisture > 0.5 && detail > 0.4
  } else {
    // Mid-range
    if (moisture > 0.55) {
      biome = "forest"
      hasTree = detail > 0.2
    } else if (moisture < 0.3) {
      biome = "desert"
    } else {
      biome = "plains"
      hasTree = detail > 0.82
    }
  }

  treeVariant = Math.floor(detail * 6)
  return { biome, hasTree, treeVariant }
}

// ── COLOR PALETTES (satellite-realistic) ──

const PHASE_TINT: Record<Phase, { r: number; g: number; b: number; a: number }> = {
  morning: { r: 255, g: 220, b: 160, a: 0.06 },
  day: { r: 0, g: 0, b: 0, a: 0 },
  evening: { r: 120, g: 70, b: 160, a: 0.12 },
  night: { r: 10, g: 15, b: 45, a: 0.35 },
}

// ── SATELLITE-STYLE DRAWING FUNCTIONS ──

// Ground: realistic aerial view with texture variation
function drawSatGround(ctx: CanvasRenderingContext2D, biome: string, px: number, py: number, wx: number, wy: number) {
  const h = hash2d(wx, wy)
  const h2 = hash2d(wx + 100, wy + 100)

  if (biome === "water") {
    // Deep ocean/lake - satellite water with color depth variation
    const depth = smoothNoise(wx, wy, 8)
    const r = 20 + depth * 30
    const g = 60 + depth * 50
    const b = 100 + depth * 60
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(px, py, CELL, CELL)
    // Specular highlights
    if (h > 0.7) {
      ctx.fillStyle = `rgba(140, 190, 220, ${0.08 + h2 * 0.06})`
      ctx.beginPath()
      ctx.ellipse(px + h * CELL, py + h2 * CELL, 8 + h * 6, 3, h * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // Wave pattern
    ctx.strokeStyle = `rgba(80, 140, 180, 0.06)`
    ctx.lineWidth = 0.8
    for (let i = 0; i < 3; i++) {
      const oy = py + 10 + i * 14
      ctx.beginPath()
      ctx.moveTo(px, oy + Math.sin(wx * 0.5 + i) * 3)
      ctx.quadraticCurveTo(px + CELL / 2, oy + Math.sin(wx * 0.5 + i + 1) * 4, px + CELL, oy + Math.sin(wx * 0.5 + i + 2) * 3)
      ctx.stroke()
    }
    return
  }

  if (biome === "plains") {
    // Green fields - satellite view of grassland
    const g1 = 110 + h * 40 + smoothNoise(wx, wy, 5) * 30
    const r1 = 60 + h * 20
    const b1 = 30 + h * 15
    ctx.fillStyle = `rgb(${r1},${g1},${b1})`
    ctx.fillRect(px, py, CELL, CELL)
    // Field texture patches (like agricultural fields from above)
    if (h > 0.5) {
      ctx.fillStyle = `rgba(${65 + h2 * 20},${120 + h2 * 30},${30 + h2 * 10}, 0.3)`
      ctx.fillRect(px + h * 10, py + h2 * 12, CELL * 0.5, CELL * 0.4)
    }
    // Grass texture dots
    ctx.fillStyle = `rgba(80, 140, 50, 0.15)`
    for (let i = 0; i < 4; i++) {
      const dx = ((hash2d(wx * 3 + i, wy * 5) * CELL) | 0)
      const dy = ((hash2d(wx * 7 + i, wy * 3) * CELL) | 0)
      ctx.beginPath()
      ctx.arc(px + dx, py + dy, 1 + h2, 0, Math.PI * 2)
      ctx.fill()
    }
    return
  }

  if (biome === "forest") {
    // Dense forest canopy from above - dark greens
    const g1 = 70 + h * 30 + smoothNoise(wx, wy, 4) * 20
    const r1 = 25 + h * 15
    const b1 = 20 + h * 10
    ctx.fillStyle = `rgb(${r1},${g1},${b1})`
    ctx.fillRect(px, py, CELL, CELL)
    // Forest floor darkness
    ctx.fillStyle = `rgba(15, 40, 15, ${0.15 + h * 0.1})`
    ctx.fillRect(px, py, CELL, CELL)
    return
  }

  if (biome === "mountain") {
    // Rocky mountain terrain from above
    const elevation = smoothNoise(wx, wy, 6)
    const grey = 100 + elevation * 80 + h * 30
    ctx.fillStyle = `rgb(${grey - 5},${grey},${grey - 10})`
    ctx.fillRect(px, py, CELL, CELL)
    // Rocky texture
    ctx.fillStyle = `rgba(${80 + h * 40}, ${75 + h * 35}, ${70 + h * 30}, 0.3)`
    for (let i = 0; i < 3; i++) {
      const rx = px + hash2d(wx * 2 + i, wy) * CELL
      const ry = py + hash2d(wx, wy * 2 + i) * CELL
      ctx.beginPath()
      ctx.ellipse(rx, ry, 4 + h * 5, 3 + h2 * 4, h * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    // Snow on peaks
    if (elevation > 0.6) {
      ctx.fillStyle = `rgba(220, 225, 230, ${0.2 + elevation * 0.3})`
      ctx.beginPath()
      ctx.ellipse(px + CELL * 0.4, py + CELL * 0.4, 10 + h * 6, 8 + h2 * 5, h * 2, 0, Math.PI * 2)
      ctx.fill()
    }
    return
  }

  if (biome === "desert") {
    // Sandy desert from above
    const r1 = 190 + h * 35
    const g1 = 165 + h * 30
    const b1 = 105 + h * 25
    ctx.fillStyle = `rgb(${r1},${g1},${b1})`
    ctx.fillRect(px, py, CELL, CELL)
    // Dune shadow lines
    ctx.strokeStyle = `rgba(160, 130, 80, 0.12)`
    ctx.lineWidth = 1.5
    for (let i = 0; i < 2; i++) {
      const dy = py + 12 + i * 20
      ctx.beginPath()
      ctx.moveTo(px, dy)
      ctx.quadraticCurveTo(px + CELL * 0.5, dy + (h - 0.5) * 8, px + CELL, dy + 2)
      ctx.stroke()
    }
  }
}

// Tree canopy from above (satellite view - just a round dark-green blob with shadow)
function drawSatTree(ctx: CanvasRenderingContext2D, px: number, py: number, wx: number, wy: number, variant: number) {
  const h = hash2d(wx, wy)
  const cx = px + CELL * (0.3 + h * 0.4)
  const cy = py + CELL * (0.3 + hash2d(wx + 1, wy) * 0.4)
  const radius = 7 + variant * 1.5 + h * 5

  // Tree shadow (offset to southeast)
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
  ctx.beginPath()
  ctx.arc(cx + 3, cy + 3, radius, 0, Math.PI * 2)
  ctx.fill()

  // Main canopy - dark green circle
  const greenBase = 45 + variant * 8
  const greenVar = 25 + h * 30
  ctx.fillStyle = `rgb(${greenBase - 10}, ${greenBase + greenVar + 20}, ${greenBase - 15})`
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  // Canopy texture - lighter patches on top (sun-lit side)
  ctx.fillStyle = `rgba(${60 + variant * 5}, ${100 + h * 60}, ${30 + variant * 5}, 0.35)`
  ctx.beginPath()
  ctx.arc(cx - radius * 0.2, cy - radius * 0.2, radius * 0.6, 0, Math.PI * 2)
  ctx.fill()

  // Dark center shadow (canopy depth)
  ctx.fillStyle = `rgba(15, 30, 10, 0.15)`
  ctx.beginPath()
  ctx.arc(cx + 1, cy + 1, radius * 0.4, 0, Math.PI * 2)
  ctx.fill()
}

// Path/Road from above (satellite-style: grey asphalt or dirt)
function drawSatPath(ctx: CanvasRenderingContext2D, px: number, py: number, map: MapTile[][], wx: number, wy: number, isVillage: boolean) {
  const pathColor = isVillage ? "rgba(140, 130, 115, 0.7)" : "rgba(120, 110, 95, 0.5)"
  const pathW = isVillage ? CELL * 0.45 : CELL * 0.3
  const edgeColor = isVillage ? "rgba(110, 100, 85, 0.3)" : "rgba(100, 90, 75, 0.2)"

  const hasN = wy > 0 && map[wy - 1]?.[wx]?.hasPath
  const hasS = map[wy + 1]?.[wx]?.hasPath
  const hasE = map[wy]?.[wx + 1]?.hasPath
  const hasW2 = wx > 0 && map[wy]?.[wx - 1]?.hasPath

  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const half = pathW / 2

  // Draw connected road segments
  ctx.fillStyle = pathColor
  // Center
  ctx.fillRect(cx - half, cy - half, pathW, pathW)
  if (hasN) ctx.fillRect(cx - half, py, pathW, CELL / 2)
  if (hasS) ctx.fillRect(cx - half, cy, pathW, CELL / 2)
  if (hasE) ctx.fillRect(cx, cy - half, CELL / 2, pathW)
  if (hasW2) ctx.fillRect(px, cy - half, CELL / 2, pathW)

  // Road edge lines
  ctx.fillStyle = edgeColor
  const lineW = 1
  if (hasN || hasS) {
    ctx.fillRect(cx - half - lineW, py, lineW, CELL)
    ctx.fillRect(cx + half, py, lineW, CELL)
  }
  if (hasE || hasW2) {
    ctx.fillRect(px, cy - half - lineW, CELL, lineW)
    ctx.fillRect(px, cy + half, CELL, lineW)
  }
}

// ── SATELLITE BUILDING RENDERERS (top-down rooftop views) ──

function drawSatHouse(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const h = hash2d(px, py)
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Building shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)"
  roundRect(ctx, cx - 12 + 4, cy - 10 + 4, 24, 20, 1)
  ctx.fill()

  // Roof (top-down view) - main rectangle
  const roofColors = ["#8b5e3c", "#7a4f32", "#996b47", "#a0714e"]
  ctx.fillStyle = roofColors[Math.floor(h * 4)]
  roundRect(ctx, cx - 12, cy - 10, 24, 20, 1)
  ctx.fill()

  // Roof ridge line (center)
  ctx.strokeStyle = "rgba(60, 35, 15, 0.3)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx - 11, cy)
  ctx.lineTo(cx + 11, cy)
  ctx.stroke()

  // Roof shingle texture lines
  ctx.strokeStyle = "rgba(50, 30, 10, 0.12)"
  ctx.lineWidth = 0.5
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - 11, cy + i * 3)
    ctx.lineTo(cx + 11, cy + i * 3)
    ctx.stroke()
  }

  // Chimney (small dark rectangle on roof)
  ctx.fillStyle = "#5a5550"
  ctx.fillRect(cx + 5, cy - 8, 4, 4)
  ctx.fillStyle = "rgba(40, 40, 40, 0.3)"
  ctx.fillRect(cx + 6, cy - 7, 2, 2)

  // Window glow from skylights at night
  if (wg > 0.3) {
    ctx.fillStyle = `rgba(255, 230, 140, ${wg * 0.25})`
    ctx.fillRect(cx - 6, cy - 5, 3, 3)
    ctx.fillRect(cx - 6, cy + 3, 3, 3)
  }
}

function drawSatFarm(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Agricultural field from above - crop rows
  const h = hash2d(px + 300, py + 300)
  const colors = [
    { r: 140, g: 160, b: 50 },
    { r: 120, g: 145, b: 45 },
    { r: 160, g: 170, b: 60 },
  ]
  const c = colors[Math.floor(h * 3)]

  // Base field
  ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`
  ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4)

  // Crop rows (visible from satellite)
  ctx.strokeStyle = `rgba(${c.r - 30},${c.g - 20},${c.b - 15}, 0.4)`
  ctx.lineWidth = 1
  const rows = 8 + Math.floor(h * 4)
  for (let i = 0; i < rows; i++) {
    const ry = py + 4 + (i * (CELL - 8)) / rows
    ctx.beginPath()
    ctx.moveTo(px + 3, ry)
    ctx.lineTo(px + CELL - 3, ry)
    ctx.stroke()
  }

  // Slight fence boundary
  ctx.strokeStyle = "rgba(100, 80, 50, 0.25)"
  ctx.lineWidth = 0.8
  ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4)
}

function drawSatCouncil(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Larger building shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)"
  roundRect(ctx, cx - 16 + 5, cy - 14 + 5, 32, 28, 2)
  ctx.fill()

  // Roof - larger, grander
  ctx.fillStyle = "#6a6560"
  roundRect(ctx, cx - 16, cy - 14, 32, 28, 2)
  ctx.fill()

  // Pediment triangle on roof
  ctx.fillStyle = "#7a7570"
  ctx.beginPath()
  ctx.moveTo(cx, cy - 14)
  ctx.lineTo(cx - 14, cy - 4)
  ctx.lineTo(cx + 14, cy - 4)
  ctx.closePath()
  ctx.fill()

  // Roof detail lines
  ctx.strokeStyle = "rgba(50, 45, 40, 0.15)"
  ctx.lineWidth = 0.5
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - 15, cy - 12 + i * 7)
    ctx.lineTo(cx + 15, cy - 12 + i * 7)
    ctx.stroke()
  }

  // Courtyard/entrance (lighter area at south)
  ctx.fillStyle = "rgba(160, 150, 135, 0.4)"
  ctx.fillRect(cx - 5, cy + 10, 10, 5)

  // Night glow
  if (wg > 0.3) {
    ctx.fillStyle = `rgba(255, 220, 130, ${wg * 0.15})`
    ctx.beginPath()
    ctx.arc(cx, cy, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSatWatchtower(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)"
  ctx.beginPath()
  ctx.arc(cx + 3, cy + 3, 8, 0, Math.PI * 2)
  ctx.fill()

  // Tower base (circular from above)
  ctx.fillStyle = "#7a7570"
  ctx.beginPath()
  ctx.arc(cx, cy, 8, 0, Math.PI * 2)
  ctx.fill()

  // Top platform (lighter ring)
  ctx.fillStyle = "#8a8580"
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.fill()

  // Battlements (small squares around the circle)
  ctx.fillStyle = "#6a6560"
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
    const bx = cx + Math.cos(angle) * 7.5
    const by = cy + Math.sin(angle) * 7.5
    ctx.fillRect(bx - 1.5, by - 1.5, 3, 3)
  }

  // Torch glow
  ctx.fillStyle = `rgba(255, 160, 40, ${0.2 + wg * 0.2})`
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawSatStorehouse(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)"
  roundRect(ctx, cx - 14 + 4, cy - 10 + 4, 28, 20, 1)
  ctx.fill()

  // Barn roof (darker than house)
  ctx.fillStyle = "#6b3e22"
  roundRect(ctx, cx - 14, cy - 10, 28, 20, 1)
  ctx.fill()

  // Ridge
  ctx.strokeStyle = "rgba(40, 20, 10, 0.3)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy - 9)
  ctx.lineTo(cx, cy + 9)
  ctx.stroke()

  // Plank lines across
  ctx.strokeStyle = "rgba(40, 20, 10, 0.1)"
  ctx.lineWidth = 0.5
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - 13, cy + i * 2.2)
    ctx.lineTo(cx + 13, cy + i * 2.2)
    ctx.stroke()
  }
}

function drawSatWell(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
  ctx.beginPath()
  ctx.arc(cx + 2, cy + 2, 7, 0, Math.PI * 2)
  ctx.fill()

  // Stone ring
  ctx.fillStyle = "#8a8580"
  ctx.beginPath()
  ctx.arc(cx, cy, 7, 0, Math.PI * 2)
  ctx.fill()

  // Water inside
  ctx.fillStyle = "#3a7abb"
  ctx.beginPath()
  ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
  ctx.fill()

  // Highlight
  ctx.fillStyle = "rgba(120, 180, 220, 0.4)"
  ctx.beginPath()
  ctx.arc(cx - 1.5, cy - 1.5, 2, 0, Math.PI * 2)
  ctx.fill()
}

function drawSatWall(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)"
  ctx.fillRect(px + 6 + 3, cy - 3 + 3, CELL - 12, 8)

  // Wall top-down (thick line)
  ctx.fillStyle = "#7a7570"
  ctx.fillRect(px + 4, cy - 4, CELL - 8, 8)

  // Stone texture
  ctx.strokeStyle = "rgba(50, 45, 40, 0.15)"
  ctx.lineWidth = 0.5
  for (let i = 0; i < 4; i++) {
    const sx = px + 6 + i * 10
    ctx.beginPath()
    ctx.moveTo(sx, cy - 3)
    ctx.lineTo(sx, cy + 3)
    ctx.stroke()
  }

  // Battlement dots
  ctx.fillStyle = "#8a8580"
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(px + 8 + i * 13, cy - 5, 4, 2)
  }
}

// ── AGENT RENDERING (satellite/aerial view: small icons with indicators) ──

const AGENT_COLORS = [
  "#26c6da", "#66bb6a", "#ef5350", "#ffa726", "#ab47bc",
  "#42a5f5", "#ec407a", "#8d6e63", "#78909c", "#ffca28",
]

function drawSatAgent(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  agent: Agent,
  index: number,
  tick: number,
) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const color = AGENT_COLORS[index % AGENT_COLORS.length]
  const pulse = 0.8 + Math.sin(tick * 0.06 + index * 1.2) * 0.2

  // Glow ring
  ctx.fillStyle = color + "25"
  ctx.beginPath()
  ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2)
  ctx.fill()

  // Outer ring
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.stroke()

  // Inner fill
  ctx.fillStyle = color + "cc"
  ctx.beginPath()
  ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
  ctx.fill()

  // White center dot
  ctx.fillStyle = "#fff"
  ctx.beginPath()
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2)
  ctx.fill()

  // Name label above
  const name = agent.name.length > 6 ? agent.name.slice(0, 6) : agent.name
  ctx.font = "bold 8px var(--font-geist-sans), system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "bottom"
  const textW = ctx.measureText(name).width
  // Background pill
  ctx.fillStyle = "rgba(0,0,0,0.65)"
  roundRect(ctx, cx - textW / 2 - 3, cy - 16, textW + 6, 11, 3)
  ctx.fill()
  // Text
  ctx.fillStyle = "#fff"
  ctx.fillText(name, cx, cy - 7)

  // Status micro-dot
  const statusColor =
    agent.status === "working" ? "#4caf50" :
    agent.status === "sleeping" ? "#78909c" :
    agent.status === "in_council" ? "#26c6da" :
    agent.status === "on_watch" ? "#ffa726" :
    agent.status === "exploring" ? "#ab47bc" : "#9e9e9e"
  ctx.fillStyle = "#000"
  ctx.beginPath()
  ctx.arc(cx + 6, cy + 5, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = statusColor
  ctx.beginPath()
  ctx.arc(cx + 6, cy + 5, 2.5, 0, Math.PI * 2)
  ctx.fill()
}

// ── Helper ──
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// Building dispatchers
type BWG = (ctx: CanvasRenderingContext2D, x: number, y: number, glow: number) => void
const GLOW_BUILDINGS: Record<string, BWG> = {
  house: drawSatHouse,
  council: drawSatCouncil,
  watchtower: drawSatWatchtower,
}
type BSimple = (ctx: CanvasRenderingContext2D, x: number, y: number) => void
const SIMPLE_BUILDINGS: Record<string, BSimple> = {
  farm: drawSatFarm,
  storehouse: drawSatStorehouse,
  well: drawSatWell,
  wall: drawSatWall,
}

// ── Metric pill ──
function MetricPill({ label, value, suffix = "", direction }: { label: string; value: number; suffix?: string; direction?: "up" | "down" | null }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-background/70 backdrop-blur-md border border-border/50 px-2 py-1">
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

// ── MAIN COMPONENT ──
// The village map is placed at the center of an infinite procedural world.
// The camera offset determines which world-coordinates are visible.
// Tiles outside the 60x60 village are procedurally generated.

const MAP_SIZE = 60 // Village map size
const VILLAGE_OFFSET_X = 0 // Village world origin
const VILLAGE_OFFSET_Y = 0

export function MapStage({ map, agents, phase, metrics, cameraMode }: MapStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 960, h: 640 })
  const [zoom, setZoom] = useState(1)
  // Camera position = world tile at center of viewport
  const [camera, setCamera] = useState({ x: 30, y: 30 })
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const animTick = useRef(0)
  const rafRef = useRef<number>(0)

  const windowGlow = phase === "night" ? 1.0 : phase === "evening" ? 0.8 : phase === "morning" ? 0.3 : 0.1
  const tint = PHASE_TINT[phase]

  // Resize canvas to fill container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ w: Math.floor(width), h: Math.floor(height) })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Build agent position map for village tiles
  const agentPositions = useMemo(() => {
    const positions = new Map<string, { agent: Agent; index: number }>()
    for (let i = 0; i < agents.length; i++) {
      const key = `${agents[i].position.x},${agents[i].position.y}`
      positions.set(key, { agent: agents[i], index: i })
    }
    return positions
  }, [agents])

  // ── RENDER LOOP ──
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Canvas dimensions = container (hi-dpi)
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const cw = containerSize.w
    const ch = containerSize.h
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, cw, ch)
    animTick.current++
    const tick = animTick.current

    const cellZoomed = CELL * zoom

    // How many tiles fit on screen
    const tilesW = Math.ceil(cw / cellZoomed) + 2
    const tilesH = Math.ceil(ch / cellZoomed) + 2

    // World tile at top-left of viewport
    const startWX = camera.x - Math.floor(tilesW / 2)
    const startWY = camera.y - Math.floor(tilesH / 2)

    // Pixel offset for smooth sub-tile scrolling
    const offsetPx = {
      x: (cw / 2) - (camera.x - startWX) * cellZoomed,
      y: (ch / 2) - (camera.y - startWY) * cellZoomed,
    }

    // ── Pass 1: Ground + paths ──
    for (let dy = 0; dy < tilesH; dy++) {
      const wy = startWY + dy
      for (let dx = 0; dx < tilesW; dx++) {
        const wx = startWX + dx
        const px = offsetPx.x + dx * cellZoomed
        const py = offsetPx.y + dy * cellZoomed

        // Skip if entirely off-screen
        if (px + cellZoomed < 0 || py + cellZoomed < 0 || px > cw || py > ch) continue

        ctx.save()
        ctx.translate(px, py)
        ctx.scale(zoom, zoom)

        // Is this tile in the village?
        const vilX = wx - VILLAGE_OFFSET_X
        const vilY = wy - VILLAGE_OFFSET_Y
        const inVillage = vilX >= 0 && vilX < MAP_SIZE && vilY >= 0 && vilY < MAP_SIZE

        if (inVillage) {
          const tile = map[vilY]?.[vilX]
          if (tile) {
            drawSatGround(ctx, tile.biome, 0, 0, wx, wy)
            // Forest trees
            if (tile.biome === "forest" && !tile.building) {
              drawSatTree(ctx, 0, 0, wx, wy, Math.floor(hash2d(wx, wy) * 6))
            }
            // Paths
            if (tile.hasPath) {
              drawSatPath(ctx, 0, 0, map, vilX, vilY, true)
            }
          }
        } else {
          // Procedural terrain
          const proc = getProceduralBiome(wx, wy)
          drawSatGround(ctx, proc.biome, 0, 0, wx, wy)
          if (proc.hasTree && proc.biome !== "water") {
            drawSatTree(ctx, 0, 0, wx, wy, proc.treeVariant)
          }
        }

        ctx.restore()
      }
    }

    // ── Pass 2: Buildings ──
    for (let dy = 0; dy < tilesH; dy++) {
      const wy = startWY + dy
      for (let dx = 0; dx < tilesW; dx++) {
        const wx = startWX + dx
        const px = offsetPx.x + dx * cellZoomed
        const py = offsetPx.y + dy * cellZoomed
        if (px + cellZoomed < 0 || py + cellZoomed < 0 || px > cw || py > ch) continue

        const vilX = wx - VILLAGE_OFFSET_X
        const vilY = wy - VILLAGE_OFFSET_Y
        const inVillage = vilX >= 0 && vilX < MAP_SIZE && vilY >= 0 && vilY < MAP_SIZE
        if (!inVillage) continue

        const tile = map[vilY]?.[vilX]
        if (!tile?.building) continue

        ctx.save()
        ctx.translate(px, py)
        ctx.scale(zoom, zoom)

        if (GLOW_BUILDINGS[tile.building]) {
          GLOW_BUILDINGS[tile.building](ctx, 0, 0, windowGlow)
        } else if (SIMPLE_BUILDINGS[tile.building]) {
          SIMPLE_BUILDINGS[tile.building](ctx, 0, 0)
        }

        ctx.restore()
      }
    }

    // ── Pass 3: Agents ──
    for (let dy = 0; dy < tilesH; dy++) {
      const wy = startWY + dy
      for (let dx = 0; dx < tilesW; dx++) {
        const wx = startWX + dx
        const vilX = wx - VILLAGE_OFFSET_X
        const vilY = wy - VILLAGE_OFFSET_Y
        const agentInfo = agentPositions.get(`${vilX},${vilY}`)
        if (!agentInfo) continue

        const px = offsetPx.x + dx * cellZoomed
        const py = offsetPx.y + dy * cellZoomed
        if (px + cellZoomed < 0 || py + cellZoomed < 0 || px > cw || py > ch) continue

        ctx.save()
        ctx.translate(px, py)
        ctx.scale(zoom, zoom)
        drawSatAgent(ctx, 0, 0, agentInfo.agent, agentInfo.index, tick)
        ctx.restore()
      }
    }

    // ── Phase tint overlay ──
    if (tint.a > 0) {
      ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${tint.a})`
      ctx.fillRect(0, 0, cw, ch)
    }

    rafRef.current = requestAnimationFrame(render)
  }, [map, agents, phase, agentPositions, containerSize, zoom, camera, windowGlow, tint])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  // ── Pan (drag) ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      const cellZoomed = CELL * zoom
      setCamera(prev => ({
        x: prev.x - dx / cellZoomed,
        y: prev.y - dy / cellZoomed,
      }))
      lastPos.current = { x: e.clientX, y: e.clientY }
    }

    // Hover detection
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const cellZoomed = CELL * zoom
      const tilesW = Math.ceil(containerSize.w / cellZoomed) + 2
      const tilesH = Math.ceil(containerSize.h / cellZoomed) + 2
      const startWX = camera.x - Math.floor(tilesW / 2)
      const startWY = camera.y - Math.floor(tilesH / 2)
      const offsetPxX = (containerSize.w / 2) - (camera.x - startWX) * cellZoomed
      const offsetPxY = (containerSize.h / 2) - (camera.y - startWY) * cellZoomed

      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const tileX = Math.floor((mx - offsetPxX) / cellZoomed) + startWX
      const tileY = Math.floor((my - offsetPxY) / cellZoomed) + startWY
      setHoveredTile({ x: tileX, y: tileY })
    }
  }, [zoom, camera, containerSize])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  // ── Zoom (wheel) ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.12 : 0.12
    setZoom(z => Math.max(0.3, Math.min(5, z + delta)))
  }, [])

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastPos.current.x
      const dy = e.touches[0].clientY - lastPos.current.y
      const cellZoomed = CELL * zoom
      setCamera(prev => ({
        x: prev.x - dx / cellZoomed,
        y: prev.y - dy / cellZoomed,
      }))
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }, [zoom])

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  // Hover info
  const ht = hoveredTile
  const vilHX = ht ? ht.x - VILLAGE_OFFSET_X : -1
  const vilHY = ht ? ht.y - VILLAGE_OFFSET_Y : -1
  const inVillageHover = vilHX >= 0 && vilHX < MAP_SIZE && vilHY >= 0 && vilHY < MAP_SIZE
  const hoveredInfo = inVillageHover ? map[vilHY]?.[vilHX] : null
  const hoveredAgent = ht ? agentPositions.get(`${vilHX},${vilHY}`) : null
  const procHover = !inVillageHover && ht ? getProceduralBiome(ht.x, ht.y) : null

  return (
    <div className="relative w-full h-full overflow-hidden" ref={containerRef}>
      {/* Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none z-20 bg-[radial-gradient(ellipse_at_center,transparent_65%,hsl(var(--background))_100%)] opacity-30" />

      {/* Canvas */}
      <div
        className="relative h-full w-full overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="block" />
      </div>

      {/* Hover tooltip */}
      {ht && (hoveredInfo || procHover) && (
        <div className="absolute top-3 left-3 z-30 bg-background/80 backdrop-blur-xl border border-border/50 rounded-lg px-3 py-2 text-xs shadow-lg">
          <p className="font-mono font-bold capitalize text-foreground">
            {hoveredInfo?.biome ?? procHover?.biome ?? "unknown"}
          </p>
          {hoveredInfo?.building && (
            <p className="text-muted-foreground capitalize">
              Building: <span className="text-foreground">{hoveredInfo.building}</span>
            </p>
          )}
          {hoveredAgent && (
            <p className="text-primary font-semibold mt-0.5">
              {hoveredAgent.agent.name} ({hoveredAgent.agent.archetype})
            </p>
          )}
          {inVillageHover && (
            <span className="text-primary/50 font-mono text-[9px]">Village</span>
          )}
          {!inVillageHover && (
            <span className="text-muted-foreground/50 font-mono text-[9px]">Wilderness</span>
          )}
          <p className="text-muted-foreground/40 mt-0.5 font-mono text-[9px]">[{ht.x}, {ht.y}]</p>
        </div>
      )}

      {/* Camera & zoom info */}
      <div className="absolute top-3 right-3 z-30 bg-background/60 backdrop-blur-md border border-border/40 rounded-md px-2 py-1 flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground capitalize">{cameraMode.replace("_", " ")}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Center on village button */}
      <button
        type="button"
        onClick={() => { setCamera({ x: 30, y: 30 }); setZoom(1) }}
        className="absolute bottom-14 right-3 z-30 bg-background/60 hover:bg-background/80 backdrop-blur-md border border-border/40 rounded-md px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Center Village
      </button>

      {/* Mini legend */}
      <div className="absolute bottom-28 right-3 z-30 bg-background/60 backdrop-blur-md border border-border/40 rounded-md px-2 py-1.5 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#2d5a27" },
          { label: "Plains", color: "#5a8a3a" },
          { label: "Water", color: "#2a6a90" },
          { label: "Mountain", color: "#7a7570" },
          { label: "Desert", color: "#c4a855" },
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
