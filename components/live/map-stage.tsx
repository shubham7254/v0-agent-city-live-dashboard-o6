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

const CELL = 40
const VIEWPORT = 24

// Biome ground colors - richer natural palette
const BIOME_COLORS: Record<string, string[]> = {
  water: ["#1a5276", "#1b6090", "#174f72", "#1a5a82"],
  forest: ["#2d5a27", "#2a5225", "#264c22", "#2f5f2a"],
  plains: ["#4a7a32", "#508236", "#467430", "#4c7e34"],
  mountain: ["#6b6560", "#726c66", "#5f5a55", "#7a746e"],
  desert: ["#c4a855", "#bfa04e", "#caae5c", "#b89a48"],
}

const PHASE_OVERLAY: Record<Phase, { color: string; windowGlow: number }> = {
  morning: { color: "rgba(255, 200, 100, 0.06)", windowGlow: 0.3 },
  day: { color: "rgba(255, 255, 240, 0.02)", windowGlow: 0.1 },
  evening: { color: "rgba(160, 100, 200, 0.1)", windowGlow: 0.8 },
  night: { color: "rgba(10, 15, 40, 0.3)", windowGlow: 1.0 },
}

// Deterministic hash for tile variation
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return (h ^ (h >> 16)) >>> 0
}

// ── GROUND RENDERING ──

function drawGround(ctx: CanvasRenderingContext2D, tile: MapTile, px: number, py: number, h: number) {
  const colors = BIOME_COLORS[tile.biome] || BIOME_COLORS.plains
  ctx.fillStyle = colors[h % colors.length]
  ctx.fillRect(px, py, CELL, CELL)

  // Add subtle variation patches
  const v = (h >> 4) % 5
  ctx.fillStyle = colors[(h + 1) % colors.length]
  ctx.globalAlpha = 0.3
  ctx.fillRect(px + (v * 7) % CELL, py + (v * 5) % CELL, CELL * 0.4, CELL * 0.4)
  ctx.globalAlpha = 1
}

function drawGrassDetails(ctx: CanvasRenderingContext2D, px: number, py: number, h: number) {
  // Grass blades
  ctx.strokeStyle = "rgba(80, 150, 50, 0.35)"
  ctx.lineWidth = 1
  const count = 3 + (h % 3)
  for (let i = 0; i < count; i++) {
    const gx = px + ((h + i * 17) % 34) + 3
    const gy = py + ((h + i * 13) % 34) + 3
    const lean = ((h + i) % 5 - 2) * 1.5
    ctx.beginPath()
    ctx.moveTo(gx, gy + 6)
    ctx.quadraticCurveTo(gx + lean, gy + 2, gx + lean * 0.5, gy)
    ctx.stroke()
  }

  // Occasional flower
  if (h % 11 === 0) {
    const fx = px + (h % 28) + 6
    const fy = py + ((h >> 3) % 28) + 6
    const flowerColors = ["#e8c73a", "#e07070", "#7eb8e0", "#c8a0d8"]
    ctx.fillStyle = flowerColors[h % flowerColors.length]
    ctx.beginPath()
    ctx.arc(fx, fy, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#f5e6a0"
    ctx.beginPath()
    ctx.arc(fx, fy, 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWater(ctx: CanvasRenderingContext2D, px: number, py: number, h: number, tick: number) {
  // Base water
  const baseColor = BIOME_COLORS.water[h % 4]
  ctx.fillStyle = baseColor
  ctx.fillRect(px, py, CELL, CELL)

  // Deeper areas
  ctx.fillStyle = "rgba(15, 50, 80, 0.3)"
  ctx.beginPath()
  ctx.ellipse(px + CELL * 0.5, py + CELL * 0.5, CELL * 0.35, CELL * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()

  // Animated ripples
  const t = tick * 0.02
  ctx.strokeStyle = "rgba(120, 190, 255, 0.15)"
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const rx = px + ((h + i * 11) % 30) + 5
    const ry = py + ((h + i * 7) % 25) + 8
    const phase = t + i * 2 + h * 0.1
    const rippleR = 3 + Math.sin(phase) * 2
    ctx.beginPath()
    ctx.arc(rx, ry, rippleR, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Light reflection streaks
  ctx.fillStyle = "rgba(160, 210, 255, 0.12)"
  const sx = px + 8 + Math.sin(t + h) * 4
  const sy = py + 12 + Math.cos(t * 0.7 + h) * 3
  ctx.beginPath()
  ctx.ellipse(sx, sy, 8, 2, t * 0.3, 0, Math.PI * 2)
  ctx.fill()
}

function drawMountainDetail(ctx: CanvasRenderingContext2D, px: number, py: number, h: number) {
  // Rocky peaks
  const peaks = 1 + (h % 2)
  for (let i = 0; i < peaks; i++) {
    const bx = px + ((h + i * 15) % 20) + 5
    const by = py + CELL - 4
    const pw = 12 + (h % 6)
    const ph = 14 + ((h >> 2) % 10)

    // Mountain shadow
    ctx.fillStyle = "rgba(80, 75, 70, 0.7)"
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + pw * 0.4, by - ph)
    ctx.lineTo(bx + pw, by)
    ctx.closePath()
    ctx.fill()

    // Lit face
    ctx.fillStyle = "rgba(140, 130, 120, 0.8)"
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + pw * 0.4, by - ph)
    ctx.lineTo(bx + pw * 0.5, by)
    ctx.closePath()
    ctx.fill()

    // Snow cap
    if (ph > 16) {
      ctx.fillStyle = "rgba(230, 235, 240, 0.6)"
      ctx.beginPath()
      ctx.moveTo(bx + pw * 0.3, by - ph + 4)
      ctx.lineTo(bx + pw * 0.4, by - ph)
      ctx.lineTo(bx + pw * 0.55, by - ph + 5)
      ctx.closePath()
      ctx.fill()
    }
  }
}

function drawDesertDetail(ctx: CanvasRenderingContext2D, px: number, py: number, h: number) {
  // Sand dune ripples
  ctx.strokeStyle = "rgba(180, 155, 80, 0.25)"
  ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const ry = py + 8 + i * 8
    ctx.beginPath()
    ctx.moveTo(px + 2, ry)
    ctx.quadraticCurveTo(px + CELL * 0.5, ry - 2 + (i % 2) * 4, px + CELL - 2, ry)
    ctx.stroke()
  }

  // Cactus
  if (h % 7 === 0) {
    const cx = px + (h % 22) + 9
    const cy = py + CELL - 6

    // Main stem
    ctx.fillStyle = "#3d7a2f"
    roundRect(ctx, cx - 2, cy - 18, 5, 18, 2)
    ctx.fill()

    // Left arm
    ctx.fillStyle = "#3d7a2f"
    roundRect(ctx, cx - 7, cy - 14, 5, 2, 1)
    ctx.fill()
    roundRect(ctx, cx - 7, cy - 20, 3, 8, 1)
    ctx.fill()

    // Right arm
    roundRect(ctx, cx + 3, cy - 10, 5, 2, 1)
    ctx.fill()
    roundRect(ctx, cx + 6, cy - 16, 3, 8, 1)
    ctx.fill()

    // Highlight
    ctx.fillStyle = "rgba(100, 180, 70, 0.3)"
    ctx.fillRect(cx - 1, cy - 16, 2, 14)
  }
}

// ── TREE RENDERING ──

function drawForestTree(ctx: CanvasRenderingContext2D, px: number, py: number, h: number) {
  const variant = h % 4
  const cx = px + CELL * 0.5
  const base = py + CELL - 2

  // Shadow under tree
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)"
  ctx.beginPath()
  ctx.ellipse(cx + 2, base + 1, 10, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  if (variant === 0) {
    // Tall pine
    const trunkH = 20
    const trunkW = 3

    // Trunk
    ctx.fillStyle = "#5a3a1e"
    roundRect(ctx, cx - trunkW / 2, base - trunkH, trunkW, trunkH, 1)
    ctx.fill()

    // Canopy layers
    const layers = [
      { y: base - trunkH + 2, w: 16, h: 10, color: "#1a5c1f" },
      { y: base - trunkH - 4, w: 13, h: 9, color: "#227a28" },
      { y: base - trunkH - 9, w: 9, h: 8, color: "#2d8a32" },
      { y: base - trunkH - 13, w: 5, h: 6, color: "#38a040" },
    ]
    for (const l of layers) {
      ctx.fillStyle = l.color
      ctx.beginPath()
      ctx.moveTo(cx, l.y - l.h)
      ctx.lineTo(cx - l.w / 2, l.y)
      ctx.lineTo(cx + l.w / 2, l.y)
      ctx.closePath()
      ctx.fill()
    }
  } else if (variant === 1) {
    // Rounded oak
    const trunkH = 14
    ctx.fillStyle = "#6b3e1a"
    roundRect(ctx, cx - 2, base - trunkH, 5, trunkH, 1)
    ctx.fill()

    // Main canopy
    ctx.fillStyle = "#2a6e20"
    ctx.beginPath()
    ctx.arc(cx, base - trunkH - 4, 12, 0, Math.PI * 2)
    ctx.fill()

    // Light clusters
    ctx.fillStyle = "#3a8e30"
    ctx.beginPath()
    ctx.arc(cx - 5, base - trunkH - 7, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#4aa840"
    ctx.beginPath()
    ctx.arc(cx + 3, base - trunkH - 9, 6, 0, Math.PI * 2)
    ctx.fill()

    // Highlight
    ctx.fillStyle = "rgba(120, 200, 80, 0.2)"
    ctx.beginPath()
    ctx.arc(cx - 2, base - trunkH - 10, 5, 0, Math.PI * 2)
    ctx.fill()
  } else if (variant === 2) {
    // Birch
    const trunkH = 18
    ctx.fillStyle = "#d4cfc2"
    roundRect(ctx, cx - 1.5, base - trunkH, 4, trunkH, 1)
    ctx.fill()
    // Bark marks
    ctx.fillStyle = "#8a8575"
    ctx.fillRect(cx - 1, base - 14, 2, 2)
    ctx.fillRect(cx, base - 8, 2, 1.5)

    // Leaves
    ctx.fillStyle = "#5aaa38"
    ctx.beginPath()
    ctx.arc(cx, base - trunkH - 2, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#72c050"
    ctx.beginPath()
    ctx.arc(cx + 3, base - trunkH - 5, 6, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Bush / small shrub
    const trunkH = 6
    ctx.fillStyle = "#5a3a1e"
    ctx.fillRect(cx - 1, base - trunkH, 3, trunkH)

    ctx.fillStyle = "#2d7a25"
    ctx.beginPath()
    ctx.arc(cx - 4, base - trunkH, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + 4, base - trunkH, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#40a235"
    ctx.beginPath()
    ctx.arc(cx, base - trunkH - 4, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── PATH RENDERING ──

function drawPath(ctx: CanvasRenderingContext2D, px: number, py: number, h: number) {
  // Dirt base
  ctx.fillStyle = "rgba(140, 115, 75, 0.55)"
  ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12)

  // Wider path area
  ctx.fillStyle = "rgba(130, 105, 65, 0.35)"
  ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6)

  // Cobblestones
  const stones = [
    { x: 8, y: 10, r: 3.5 },
    { x: 18, y: 8, r: 3 },
    { x: 28, y: 12, r: 3.5 },
    { x: 12, y: 22, r: 3 },
    { x: 22, y: 25, r: 3.5 },
    { x: 32, y: 24, r: 2.5 },
    { x: 15, y: 34, r: 3 },
    { x: 25, y: 32, r: 3 },
  ]
  for (const s of stones) {
    if (s.x < CELL && s.y < CELL) {
      ctx.fillStyle = `rgba(${155 + (h % 30)}, ${140 + (h % 20)}, ${110 + (h % 15)}, 0.4)`
      ctx.beginPath()
      ctx.arc(px + s.x, py + s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
      // Stone highlight
      ctx.fillStyle = "rgba(200, 185, 150, 0.15)"
      ctx.beginPath()
      ctx.arc(px + s.x - 0.5, py + s.y - 0.5, s.r * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ── BUILDING RENDERING (rich, detailed) ──

function drawHouse(ctx: CanvasRenderingContext2D, px: number, py: number, windowGlow: number) {
  const cx = px + CELL / 2
  const base = py + CELL - 3

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
  ctx.beginPath()
  ctx.ellipse(cx + 3, base + 2, 16, 5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Walls
  const wallW = 26
  const wallH = 16
  const wallX = cx - wallW / 2
  const wallY = base - wallH

  // Back wall (darker)
  ctx.fillStyle = "#c4a060"
  roundRect(ctx, wallX, wallY, wallW, wallH, 1)
  ctx.fill()

  // Front wall face
  ctx.fillStyle = "#d4b578"
  roundRect(ctx, wallX, wallY, wallW * 0.75, wallH, 1)
  ctx.fill()

  // Wall border
  ctx.strokeStyle = "rgba(100, 75, 40, 0.3)"
  ctx.lineWidth = 0.5
  ctx.strokeRect(wallX, wallY, wallW, wallH)

  // Timber frame details
  ctx.strokeStyle = "rgba(90, 60, 30, 0.2)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(wallX, wallY + wallH * 0.5)
  ctx.lineTo(wallX + wallW, wallY + wallH * 0.5)
  ctx.stroke()

  // Roof
  const roofOverhang = 4
  ctx.fillStyle = "#8b4026"
  ctx.beginPath()
  ctx.moveTo(cx, wallY - 14)
  ctx.lineTo(wallX - roofOverhang, wallY + 1)
  ctx.lineTo(wallX + wallW + roofOverhang, wallY + 1)
  ctx.closePath()
  ctx.fill()

  // Roof shingle lines
  ctx.strokeStyle = "rgba(60, 25, 10, 0.25)"
  ctx.lineWidth = 0.5
  for (let i = 1; i <= 3; i++) {
    const ry = wallY + 1 - i * 3.5
    const inset = i * 3
    ctx.beginPath()
    ctx.moveTo(wallX - roofOverhang + inset, ry)
    ctx.lineTo(wallX + wallW + roofOverhang - inset, ry)
    ctx.stroke()
  }

  // Roof highlight edge
  ctx.strokeStyle = "rgba(200, 120, 60, 0.3)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx, wallY - 14)
  ctx.lineTo(wallX - roofOverhang, wallY + 1)
  ctx.stroke()

  // Chimney
  ctx.fillStyle = "#7a7068"
  ctx.fillRect(cx + 6, wallY - 16, 5, 8)
  ctx.fillStyle = "#6a6058"
  ctx.fillRect(cx + 5, wallY - 17, 7, 2)

  // Door
  ctx.fillStyle = "#5a3520"
  roundRect(ctx, cx - 3, base - 10, 7, 10, 1)
  ctx.fill()
  // Door handle
  ctx.fillStyle = "#c0a040"
  ctx.beginPath()
  ctx.arc(cx + 2, base - 5, 0.8, 0, Math.PI * 2)
  ctx.fill()

  // Windows with glow
  const drawWindow = (wx: number, wy: number, ww: number, wh: number) => {
    // Frame
    ctx.fillStyle = "#5a4530"
    ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2)
    // Glass
    const glowAlpha = 0.3 + windowGlow * 0.6
    ctx.fillStyle = `rgba(255, 230, 140, ${glowAlpha})`
    ctx.fillRect(wx, wy, ww, wh)
    // Cross pane
    ctx.strokeStyle = "#5a4530"
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(wx + ww / 2, wy)
    ctx.lineTo(wx + ww / 2, wy + wh)
    ctx.moveTo(wx, wy + wh / 2)
    ctx.lineTo(wx + ww, wy + wh / 2)
    ctx.stroke()
    // Glow effect
    if (windowGlow > 0.4) {
      ctx.fillStyle = `rgba(255, 220, 100, ${windowGlow * 0.15})`
      ctx.beginPath()
      ctx.arc(wx + ww / 2, wy + wh / 2, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawWindow(cx - 12, wallY + 3, 5, 5)
  drawWindow(cx + 7, wallY + 3, 5, 5)
}

function drawFarm(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const margin = 4

  // Tilled soil rows
  for (let row = 0; row < 5; row++) {
    const ry = py + margin + row * 7
    // Dirt row
    ctx.fillStyle = row % 2 === 0 ? "rgba(120, 90, 50, 0.5)" : "rgba(100, 75, 40, 0.4)"
    ctx.fillRect(px + margin, ry, CELL - margin * 2, 5)
  }

  // Growing crops
  ctx.strokeStyle = "#8aaa30"
  ctx.lineWidth = 1.2
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row < 3; row++) {
      const sx = px + margin + 3 + col * 4.5
      const sy = py + margin + 2 + row * 12
      // Stalk
      ctx.beginPath()
      ctx.moveTo(sx, sy + 8)
      ctx.quadraticCurveTo(sx + 0.5, sy + 4, sx - 0.5, sy)
      ctx.stroke()
      // Wheat head
      ctx.fillStyle = "#d4aa20"
      ctx.beginPath()
      ctx.ellipse(sx, sy - 1, 1.5, 2.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Fence posts along edge
  ctx.fillStyle = "#7a5c30"
  ctx.fillRect(px + 1, py + 2, 2, CELL - 4)
  ctx.fillRect(px + CELL - 3, py + 2, 2, CELL - 4)
  // Fence rails
  ctx.strokeStyle = "#7a5c30"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px + 2, py + 8)
  ctx.lineTo(px + CELL - 2, py + 8)
  ctx.moveTo(px + 2, py + CELL - 8)
  ctx.lineTo(px + CELL - 2, py + CELL - 8)
  ctx.stroke()
}

function drawCouncil(ctx: CanvasRenderingContext2D, px: number, py: number, windowGlow: number) {
  const cx = px + CELL / 2
  const base = py + CELL - 2

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)"
  ctx.beginPath()
  ctx.ellipse(cx + 3, base + 2, 18, 5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Stone foundation
  ctx.fillStyle = "#707060"
  ctx.fillRect(px + 2, base - 3, CELL - 4, 3)

  // Main walls
  const wallW = 30
  const wallH = 20
  const wallX = cx - wallW / 2
  const wallY = base - 3 - wallH

  ctx.fillStyle = "#a09888"
  roundRect(ctx, wallX, wallY, wallW, wallH, 1)
  ctx.fill()

  // Stone texture lines
  ctx.strokeStyle = "rgba(80, 70, 60, 0.15)"
  ctx.lineWidth = 0.5
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(wallX, wallY + i * 4)
    ctx.lineTo(wallX + wallW, wallY + i * 4)
    ctx.stroke()
  }

  // Columns
  ctx.fillStyle = "#b8b0a0"
  const colPositions = [wallX + 3, wallX + wallW / 2 - 2, wallX + wallW - 7]
  for (const colX of colPositions) {
    roundRect(ctx, colX, wallY + 2, 4, wallH - 2, 1)
    ctx.fill()
    // Column capital
    ctx.fillStyle = "#c8c0b0"
    ctx.fillRect(colX - 1, wallY + 1, 6, 2)
    ctx.fillStyle = "#b8b0a0"
  }

  // Grand roof - pediment
  ctx.fillStyle = "#6a4a30"
  ctx.beginPath()
  ctx.moveTo(cx, wallY - 14)
  ctx.lineTo(wallX - 4, wallY + 1)
  ctx.lineTo(wallX + wallW + 4, wallY + 1)
  ctx.closePath()
  ctx.fill()

  // Pediment decoration triangle
  ctx.fillStyle = "#7a5a40"
  ctx.beginPath()
  ctx.moveTo(cx, wallY - 10)
  ctx.lineTo(wallX + 4, wallY)
  ctx.lineTo(wallX + wallW - 4, wallY)
  ctx.closePath()
  ctx.fill()

  // Grand door
  ctx.fillStyle = "#4a2a15"
  ctx.beginPath()
  ctx.arc(cx, base - 10, 5, Math.PI, 0)
  ctx.fillRect(cx - 5, base - 10, 10, 7)
  ctx.fill()

  // Door glow
  if (windowGlow > 0.3) {
    ctx.fillStyle = `rgba(255, 220, 130, ${windowGlow * 0.2})`
    ctx.beginPath()
    ctx.arc(cx, base - 8, 8, 0, Math.PI * 2)
    ctx.fill()
  }

  // Windows
  for (const wx of [wallX + 4, wallX + wallW - 10]) {
    ctx.fillStyle = "#4a3a28"
    ctx.fillRect(wx - 0.5, wallY + 6, 6, 7)
    ctx.fillStyle = `rgba(255, 220, 140, ${0.3 + windowGlow * 0.5})`
    ctx.fillRect(wx, wallY + 6.5, 5, 6)
  }
}

function drawWatchtower(ctx: CanvasRenderingContext2D, px: number, py: number, windowGlow: number) {
  const cx = px + CELL / 2
  const base = py + CELL - 2

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
  ctx.beginPath()
  ctx.ellipse(cx + 3, base + 1, 8, 3, 0, 0, Math.PI * 2)
  ctx.fill()

  // Tower body
  const tW = 10
  const tH = 30
  ctx.fillStyle = "#808078"
  roundRect(ctx, cx - tW / 2, base - tH, tW, tH, 1)
  ctx.fill()

  // Stone lines
  ctx.strokeStyle = "rgba(60, 55, 50, 0.15)"
  ctx.lineWidth = 0.5
  for (let i = 1; i <= 6; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - tW / 2, base - i * 4.5)
    ctx.lineTo(cx + tW / 2, base - i * 4.5)
    ctx.stroke()
  }

  // Platform at top
  ctx.fillStyle = "#6a6a60"
  ctx.fillRect(cx - tW / 2 - 4, base - tH - 2, tW + 8, 3)

  // Battlements
  ctx.fillStyle = "#707068"
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(cx - tW / 2 - 4 + i * 5, base - tH - 5, 3, 3)
  }

  // Torch flame at top
  const flicker = Math.random() * 2
  ctx.fillStyle = "#ff9020"
  ctx.beginPath()
  ctx.arc(cx, base - tH - 7, 3 + flicker * 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#ffcc40"
  ctx.beginPath()
  ctx.arc(cx, base - tH - 8, 1.5, 0, Math.PI * 2)
  ctx.fill()

  // Torch glow
  ctx.fillStyle = `rgba(255, 160, 40, ${0.1 + windowGlow * 0.1})`
  ctx.beginPath()
  ctx.arc(cx, base - tH - 6, 10, 0, Math.PI * 2)
  ctx.fill()

  // Arrow slit
  ctx.fillStyle = "#404038"
  ctx.fillRect(cx - 1, base - tH + 10, 2, 6)
}

function drawStorehouse(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const cx = px + CELL / 2
  const base = py + CELL - 3

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)"
  ctx.beginPath()
  ctx.ellipse(cx + 3, base + 2, 15, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Barn walls
  const wallW = 28
  const wallH = 15
  const wallX = cx - wallW / 2
  const wallY = base - wallH

  ctx.fillStyle = "#8a5a3a"
  roundRect(ctx, wallX, wallY, wallW, wallH, 1)
  ctx.fill()

  // Horizontal planks
  ctx.strokeStyle = "rgba(60, 35, 15, 0.2)"
  ctx.lineWidth = 0.5
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(wallX, wallY + i * 4)
    ctx.lineTo(wallX + wallW, wallY + i * 4)
    ctx.stroke()
  }

  // Barn roof
  ctx.fillStyle = "#6a3a20"
  ctx.beginPath()
  ctx.moveTo(wallX - 3, wallY + 1)
  ctx.quadraticCurveTo(cx, wallY - 14, wallX + wallW + 3, wallY + 1)
  ctx.fill()

  // Roof ridge
  ctx.strokeStyle = "rgba(90, 50, 25, 0.4)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(wallX - 3, wallY + 1)
  ctx.quadraticCurveTo(cx, wallY - 14, wallX + wallW + 3, wallY + 1)
  ctx.stroke()

  // Big barn door
  ctx.fillStyle = "#5a3018"
  roundRect(ctx, cx - 5, base - 11, 10, 11, 1)
  ctx.fill()
  // Cross beam
  ctx.strokeStyle = "#4a2510"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx - 4, base - 10)
  ctx.lineTo(cx + 4, base - 2)
  ctx.moveTo(cx + 4, base - 10)
  ctx.lineTo(cx - 4, base - 2)
  ctx.stroke()
}

function drawWell(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const cx = px + CELL / 2
  const cy = py + CELL * 0.55

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)"
  ctx.beginPath()
  ctx.ellipse(cx + 2, cy + 10, 10, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Stone ring (3D effect)
  ctx.fillStyle = "#8a8880"
  ctx.beginPath()
  ctx.ellipse(cx, cy + 2, 10, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#9a9890"
  ctx.beginPath()
  ctx.ellipse(cx, cy, 10, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // Water inside
  ctx.fillStyle = "#3a8acc"
  ctx.beginPath()
  ctx.ellipse(cx, cy, 7, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  // Water shimmer
  ctx.fillStyle = "rgba(120, 200, 255, 0.4)"
  ctx.beginPath()
  ctx.ellipse(cx - 2, cy - 1, 3, 1.5, -0.3, 0, Math.PI * 2)
  ctx.fill()

  // Support posts
  ctx.fillStyle = "#5a3a20"
  ctx.fillRect(cx - 8, cy - 16, 3, 18)
  ctx.fillRect(cx + 5, cy - 16, 3, 18)

  // Crossbar
  ctx.fillStyle = "#6a4a2a"
  ctx.fillRect(cx - 9, cy - 17, 18, 3)

  // Rope
  ctx.strokeStyle = "#8a7a5a"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx, cy - 15)
  ctx.lineTo(cx, cy - 4)
  ctx.stroke()

  // Bucket
  ctx.fillStyle = "#7a6a4a"
  ctx.fillRect(cx - 2, cy - 5, 4, 3)
}

function drawWall(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const base = py + CELL - 3
  const wallH = 18

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)"
  ctx.fillRect(px + 4, base - 1, CELL - 4, 4)

  // Wall body
  ctx.fillStyle = "#7a7570"
  ctx.fillRect(px + 2, base - wallH, CELL - 4, wallH)

  // Brick pattern
  ctx.strokeStyle = "rgba(55, 50, 45, 0.2)"
  ctx.lineWidth = 0.5
  for (let row = 0; row < 4; row++) {
    const ry = base - wallH + row * (wallH / 4)
    ctx.beginPath()
    ctx.moveTo(px + 2, ry)
    ctx.lineTo(px + CELL - 2, ry)
    ctx.stroke()

    const brickOff = row % 2 === 0 ? 0 : (CELL - 4) * 0.2
    for (let col = 0; col < 3; col++) {
      const vx = px + 2 + brickOff + (CELL - 4) * (col / 3)
      ctx.beginPath()
      ctx.moveTo(vx, ry)
      ctx.lineTo(vx, ry + wallH / 4)
      ctx.stroke()
    }
  }

  // Top face (lighter)
  ctx.fillStyle = "#8a8580"
  ctx.fillRect(px + 2, base - wallH - 2, CELL - 4, 3)

  // Battlements
  ctx.fillStyle = "#9a9590"
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(px + 4 + i * 12, base - wallH - 6, 8, 4)
  }
}

// ── AGENT RENDERING ──

const AGENT_COLORS = [
  "#26c6da", "#66bb6a", "#ef5350", "#ffa726", "#ab47bc",
  "#42a5f5", "#ec407a", "#8d6e63", "#78909c", "#ffca28",
]

function drawAgent(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  agent: Agent,
  index: number,
  tick: number
) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const color = AGENT_COLORS[index % AGENT_COLORS.length]
  const bobY = Math.sin(tick * 0.04 + index * 1.5) * 2

  // Ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + 14, 8, 3, 0, 0, Math.PI * 2)
  ctx.fill()

  // Glow ring
  ctx.fillStyle = color + "20"
  ctx.beginPath()
  ctx.arc(cx, cy + bobY, 14, 0, Math.PI * 2)
  ctx.fill()

  // Body (torso)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy + bobY + 3, 7, 0, Math.PI * 2)
  ctx.fill()

  // Head
  ctx.fillStyle = "#f0d8b0"
  ctx.beginPath()
  ctx.arc(cx, cy + bobY - 5, 5, 0, Math.PI * 2)
  ctx.fill()

  // Eyes
  ctx.fillStyle = "#333"
  ctx.fillRect(cx - 2, cy + bobY - 6, 1.5, 1.5)
  ctx.fillRect(cx + 1, cy + bobY - 6, 1.5, 1.5)

  // Name label
  ctx.fillStyle = "rgba(0,0,0,0.6)"
  roundRect(ctx, cx - 10, cy + bobY - 16, 20, 9, 3)
  ctx.fill()
  ctx.fillStyle = "#fff"
  ctx.font = "bold 7px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const shortName = agent.name.length > 5 ? agent.name.slice(0, 5) : agent.name
  ctx.fillText(shortName, cx, cy + bobY - 12)

  // Status dot
  const statusColor =
    agent.status === "working" ? "#4caf50" :
    agent.status === "sleeping" ? "#78909c" :
    agent.status === "in_council" ? "#26c6da" :
    agent.status === "on_watch" ? "#ffa726" :
    agent.status === "exploring" ? "#ab47bc" : "#9e9e9e"

  ctx.fillStyle = "#000"
  ctx.beginPath()
  ctx.arc(cx + 8, cy + bobY - 1, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = statusColor
  ctx.beginPath()
  ctx.arc(cx + 8, cy + bobY - 1, 3, 0, Math.PI * 2)
  ctx.fill()
}

// ── Helper: rounded rect ──
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

// Building dispatcher
type BuildingDrawer = (ctx: CanvasRenderingContext2D, x: number, y: number, glow: number) => void
const BUILDING_DRAWERS: Record<string, BuildingDrawer> = {
  house: drawHouse,
  council: drawCouncil,
  watchtower: drawWatchtower,
}
type SimpleBuildingDrawer = (ctx: CanvasRenderingContext2D, x: number, y: number) => void
const SIMPLE_BUILDING_DRAWERS: Record<string, SimpleBuildingDrawer> = {
  farm: drawFarm,
  storehouse: drawStorehouse,
  well: drawWell,
  wall: drawWall,
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

// ── Main component ──
export function MapStage({ map, agents, phase, metrics, cameraMode }: MapStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 960, h: 960 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const animTick = useRef(0)
  const rafRef = useRef<number>(0)

  const startX = Math.max(0, 30 - Math.floor(VIEWPORT / 2))
  const startY = Math.max(0, 30 - Math.floor(VIEWPORT / 2))

  // Resize canvas to fill container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setCanvasSize({ w: Math.floor(width), h: Math.floor(height) })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const agentPositions = useMemo(() => {
    const positions = new Map<string, { agent: Agent; index: number }>()
    for (let i = 0; i < agents.length; i++) {
      const key = `${agents[i].position.x},${agents[i].position.y}`
      positions.set(key, { agent: agents[i], index: i })
    }
    return positions
  }, [agents])

  const phaseInfo = PHASE_OVERLAY[phase]

  // Main render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const pixelW = VIEWPORT * CELL
    const pixelH = VIEWPORT * CELL
    canvas.width = pixelW
    canvas.height = pixelH

    ctx.clearRect(0, 0, pixelW, pixelH)
    animTick.current++
    const tick = animTick.current

    // Draw tiles
    for (let dy = 0; dy < VIEWPORT; dy++) {
      const wy = startY + dy
      if (wy >= map.length) continue
      for (let dx = 0; dx < VIEWPORT; dx++) {
        const wx = startX + dx
        if (wx >= (map[wy]?.length ?? 0)) continue
        const tile = map[wy][wx]
        const px = dx * CELL
        const py = dy * CELL
        const h = hash(wx, wy)

        // Ground
        if (tile.biome === "water") {
          drawWater(ctx, px, py, h, tick)
        } else {
          drawGround(ctx, tile, px, py, h)

          if (tile.biome === "plains" && !tile.building) {
            drawGrassDetails(ctx, px, py, h)
          }
          if (tile.biome === "forest" && !tile.building) {
            drawForestTree(ctx, px, py, h)
          }
          if (tile.biome === "mountain" && !tile.building) {
            drawMountainDetail(ctx, px, py, h)
          }
          if (tile.biome === "desert" && !tile.building) {
            drawDesertDetail(ctx, px, py, h)
          }
        }

        // Path
        if (tile.hasPath) {
          drawPath(ctx, px, py, h)
        }

        // Building
        if (tile.building) {
          if (BUILDING_DRAWERS[tile.building]) {
            BUILDING_DRAWERS[tile.building](ctx, px, py, phaseInfo.windowGlow)
          } else if (SIMPLE_BUILDING_DRAWERS[tile.building]) {
            SIMPLE_BUILDING_DRAWERS[tile.building](ctx, px, py)
          }
        }
      }
    }

    // Agents (rendered in a second pass so they appear on top)
    for (let dy = 0; dy < VIEWPORT; dy++) {
      const wy = startY + dy
      for (let dx = 0; dx < VIEWPORT; dx++) {
        const wx = startX + dx
        const agentInfo = agentPositions.get(`${wx},${wy}`)
        if (agentInfo) {
          drawAgent(ctx, dx * CELL, dy * CELL, agentInfo.agent, agentInfo.index, tick)
        }
      }
    }

    // Phase tint
    ctx.fillStyle = phaseInfo.color
    ctx.fillRect(0, 0, pixelW, pixelH)

    rafRef.current = requestAnimationFrame(render)
  }, [map, agents, phase, agentPositions, startX, startY, phaseInfo])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  // Pan/zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setZoom((z) => Math.max(0.5, Math.min(4, z + delta)))
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
    <div className="relative w-full h-full overflow-hidden" ref={containerRef}>
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-20 bg-[radial-gradient(ellipse_at_center,transparent_60%,hsl(var(--background))_100%)] opacity-40" />

      {/* Canvas */}
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
          style={{
            width: Math.max(canvasSize.w, canvasSize.h),
            height: Math.max(canvasSize.w, canvasSize.h),
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: isDragging.current ? "none" : "transform 0.1s ease-out",
            imageRendering: "pixelated",
          }}
        />
      </div>

      {/* Hover tooltip */}
      {hoveredInfo && hoveredTile && (
        <div className="absolute top-3 left-3 z-30 bg-background/80 backdrop-blur-xl border border-border/50 rounded-lg px-3 py-2 text-xs shadow-lg">
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
              Flood: <span className={hoveredInfo.floodRisk > 0.3 ? "text-primary" : "text-foreground"}>{Math.round(hoveredInfo.floodRisk * 100)}%</span>
            </span>
            <span className="text-muted-foreground">
              Fire: <span className={hoveredInfo.fireRisk > 0.3 ? "text-[hsl(var(--live-red))]" : "text-foreground"}>{Math.round(hoveredInfo.fireRisk * 100)}%</span>
            </span>
          </div>
          <p className="text-muted-foreground/50 mt-0.5 font-mono">[{hoveredTile.x}, {hoveredTile.y}]</p>
        </div>
      )}

      {/* Camera mode */}
      <div className="absolute top-3 right-3 z-30 bg-background/60 backdrop-blur-md border border-border/40 rounded-md px-2 py-1">
        <span className="font-mono text-[10px] text-muted-foreground capitalize">{cameraMode.replace("_", " ")}</span>
      </div>

      {/* Mini legend */}
      <div className="absolute bottom-14 right-3 z-30 bg-background/60 backdrop-blur-md border border-border/40 rounded-md px-2 py-1.5 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#2d5a27" },
          { label: "Plains", color: "#4a7a32" },
          { label: "Water", color: "#1a5276" },
          { label: "Mountain", color: "#6b6560" },
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
