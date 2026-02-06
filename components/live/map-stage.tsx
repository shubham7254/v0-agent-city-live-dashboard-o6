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

// Tile size -- larger for detail
const CELL = 48

// ===== NOISE =====
function hash2d(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0
  h = (h ^ (h >> 13)) * 1274126177
  h = h ^ (h >> 16)
  return (h >>> 0) / 4294967296
}

function smoothNoise(x: number, y: number, scale: number): number {
  const sx = x / scale
  const sy = y / scale
  const ix = Math.floor(sx)
  const iy = Math.floor(sy)
  const fx = sx - ix
  const fy = sy - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2d(ix, iy)
  const b = hash2d(ix + 1, iy)
  const c = hash2d(ix, iy + 1)
  const d = hash2d(ix + 1, iy + 1)
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
}

function fbm(x: number, y: number, octaves = 4): number {
  let val = 0
  let amp = 0.5
  let scl = 30
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x, y, scl) * amp
    amp *= 0.5
    scl *= 0.5
  }
  return val
}

// High-resolution per-pixel noise (for sub-tile texture)
function pixelNoise(px: number, py: number): number {
  return hash2d(Math.floor(px * 3.7), Math.floor(py * 3.7))
}

function fineNoise(px: number, py: number, scale: number): number {
  return smoothNoise(px, py, scale)
}

// ===== BIOME GENERATION =====
type Biome = MapTile["biome"]

interface ProceduralTile {
  biome: Biome
  elevation: number
  moisture: number
  detail: number
}

function getProceduralTile(wx: number, wy: number): ProceduralTile {
  const elevation = fbm(wx + 500, wy + 500, 5)
  const moisture = fbm(wx + 2000, wy + 3000, 4)
  const detail = hash2d(wx * 7 + 13, wy * 11 + 7)
  let biome: Biome = "plains"
  if (elevation < 0.30) biome = "water"
  else if (elevation < 0.36) biome = "desert"
  else if (elevation > 0.72) biome = "mountain"
  else if (elevation > 0.62) biome = moisture > 0.45 ? "forest" : "plains"
  else if (moisture > 0.55) biome = "forest"
  else if (moisture < 0.3) biome = "desert"
  else biome = "plains"
  return { biome, elevation, moisture, detail }
}

// Resolve biome for any world coordinate (village or procedural)
function getBiomeAt(wx: number, wy: number, map: MapTile[][]): Biome {
  if (wx >= 0 && wx < 60 && wy >= 0 && wy < 60) {
    return map[wy]?.[wx]?.biome ?? "plains"
  }
  return getProceduralTile(wx, wy).biome
}

// ===== BIOME COLOR PALETTES (per-pixel sampling) =====
// Returns [r, g, b] for a given biome at sub-pixel precision
function biomeColor(biome: Biome, worldPx: number, worldPy: number, elevation: number): [number, number, number] {
  const n1 = fineNoise(worldPx, worldPy, 18)
  const n2 = fineNoise(worldPx + 100, worldPy + 200, 7)
  const n3 = pixelNoise(worldPx, worldPy)

  switch (biome) {
    case "plains": {
      // Natural grassland: varied greens with brown patches
      const baseG = 95 + n1 * 45 + n2 * 25
      const baseR = 55 + n1 * 25 + n3 * 12
      const baseB = 30 + n1 * 10
      // Occasional darker grass patches
      const patch = fineNoise(worldPx, worldPy, 30)
      if (patch > 0.65) {
        return [baseR - 10, baseG + 15, baseB - 5]
      }
      // Occasional dry/brown spots
      if (n2 < 0.15) {
        return [baseR + 30, baseG - 15, baseB + 10]
      }
      return [baseR, baseG, baseB]
    }
    case "forest": {
      // Dense canopy from above: dark greens with depth variation
      const canopy = fineNoise(worldPx, worldPy, 12)
      const deep = fineNoise(worldPx + 50, worldPy + 50, 5)
      const r = 20 + canopy * 20 + deep * 8
      const g = 50 + canopy * 40 + deep * 20
      const b = 15 + canopy * 10 + deep * 5
      // Canopy highlights (sun-lit tops)
      if (deep > 0.7) {
        return [r + 10, g + 25, b + 5]
      }
      // Dark gaps between canopy
      if (deep < 0.2) {
        return [r - 8, g - 15, b - 5]
      }
      return [r, g, b]
    }
    case "water": {
      // Realistic water with depth + subtle color variation
      const depth = fineNoise(worldPx, worldPy, 25)
      const ripple = fineNoise(worldPx * 2, worldPy * 2, 4)
      const r = 15 + depth * 25 + ripple * 8
      const g = 45 + depth * 40 + ripple * 15
      const b = 80 + depth * 55 + ripple * 20
      // Specular highlights
      if (ripple > 0.78) {
        return [r + 20, g + 30, b + 35]
      }
      return [r, g, b]
    }
    case "mountain": {
      // Rocky terrain with snow
      const rock = fineNoise(worldPx, worldPy, 10)
      const crag = fineNoise(worldPx * 1.5, worldPy * 1.5, 4)
      const baseGrey = 85 + rock * 50 + crag * 25
      // Snow on high elevation
      if (elevation > 0.78 && crag > 0.4) {
        const snow = 200 + crag * 40
        return [snow, snow + 2, snow + 5]
      }
      // Exposed rock faces (darker)
      if (crag < 0.25) {
        return [baseGrey - 15, baseGrey - 18, baseGrey - 20]
      }
      return [baseGrey - 5, baseGrey, baseGrey - 10]
    }
    case "desert": {
      // Sandy desert with dune shadows
      const sand = fineNoise(worldPx, worldPy, 15)
      const dune = fineNoise(worldPx * 0.8, worldPy * 0.8, 30)
      const r = 185 + sand * 40 + dune * 15
      const g = 160 + sand * 30 + dune * 12
      const b = 100 + sand * 20 + dune * 8
      // Dune shadow
      if (dune < 0.3) {
        return [r - 25, g - 22, b - 15]
      }
      // Bright crest
      if (dune > 0.75) {
        return [r + 10, g + 8, b + 5]
      }
      return [r, g, b]
    }
    default:
      return [80, 120, 50]
  }
}

// ===== BIOME BLENDING (smooth transitions) =====
function blendedBiomeColor(
  wx: number, wy: number,
  subX: number, subY: number,
  map: MapTile[][],
): [number, number, number] {
  const centerBiome = getBiomeAt(wx, wy, map)
  const elevation = (wx >= 0 && wx < 60 && wy >= 0 && wy < 60)
    ? 0.5
    : getProceduralTile(wx, wy).elevation

  const worldPx = wx * CELL + subX
  const worldPy = wy * CELL + subY

  // Check if we're near an edge (blend zone)
  const blendMargin = CELL * 0.35
  const nearLeft = subX < blendMargin
  const nearRight = subX > CELL - blendMargin
  const nearTop = subY < blendMargin
  const nearBottom = subY > CELL - blendMargin

  if (!nearLeft && !nearRight && !nearTop && !nearBottom) {
    // Center of tile - no blending needed
    return biomeColor(centerBiome, worldPx, worldPy, elevation)
  }

  // Gather neighbor biomes and blend weights
  const base = biomeColor(centerBiome, worldPx, worldPy, elevation)
  let totalWeight = 1.0
  let r = base[0]
  let g = base[1]
  let b = base[2]

  const blendNeighbor = (nx: number, ny: number, distNorm: number) => {
    const nBiome = getBiomeAt(nx, ny, map)
    if (nBiome === centerBiome) return
    const nElev = (nx >= 0 && nx < 60 && ny >= 0 && ny < 60) ? 0.5 : getProceduralTile(nx, ny).elevation
    const nColor = biomeColor(nBiome, worldPx, worldPy, nElev)
    // Smooth weight based on distance from edge
    const w = (1 - distNorm) * 0.55
    r += nColor[0] * w
    g += nColor[1] * w
    b += nColor[2] * w
    totalWeight += w
  }

  if (nearLeft) blendNeighbor(wx - 1, wy, subX / blendMargin)
  if (nearRight) blendNeighbor(wx + 1, wy, (CELL - subX) / blendMargin)
  if (nearTop) blendNeighbor(wx, wy - 1, subY / blendMargin)
  if (nearBottom) blendNeighbor(wx, wy + 1, (CELL - subY) / blendMargin)
  // Diagonal blending for corners
  if (nearLeft && nearTop) blendNeighbor(wx - 1, wy - 1, Math.max(subX, subY) / blendMargin * 0.7)
  if (nearRight && nearTop) blendNeighbor(wx + 1, wy - 1, Math.max(CELL - subX, subY) / blendMargin * 0.7)
  if (nearLeft && nearBottom) blendNeighbor(wx - 1, wy + 1, Math.max(subX, CELL - subY) / blendMargin * 0.7)
  if (nearRight && nearBottom) blendNeighbor(wx + 1, wy + 1, Math.max(CELL - subX, CELL - subY) / blendMargin * 0.7)

  return [r / totalWeight, g / totalWeight, b / totalWeight]
}

// ===== OFFSCREEN TILE CACHE =====
// Pre-render each tile as a small ImageData to avoid per-pixel work every frame
const tileCache = new Map<string, ImageBitmap>()
const CACHE_MAX = 4000

function getTileCacheKey(wx: number, wy: number, phase: Phase): string {
  return `${wx},${wy},${phase}`
}

async function renderTileBitmap(
  wx: number, wy: number,
  map: MapTile[][],
  phase: Phase,
): Promise<ImageBitmap> {
  const offscreen = new OffscreenCanvas(CELL, CELL)
  const ctx = offscreen.getContext("2d")!
  const imgData = ctx.createImageData(CELL, CELL)
  const data = imgData.data

  for (let py = 0; py < CELL; py++) {
    for (let px = 0; px < CELL; px++) {
      const [r, g, b] = blendedBiomeColor(wx, wy, px, py, map)
      const idx = (py * CELL + px) * 4
      data[idx] = Math.max(0, Math.min(255, r))
      data[idx + 1] = Math.max(0, Math.min(255, g))
      data[idx + 2] = Math.max(0, Math.min(255, b))
      data[idx + 3] = 255
    }
  }
  ctx.putImageData(imgData, 0, 0)
  return createImageBitmap(offscreen)
}

// ===== SATELLITE BUILDING RENDERERS =====

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

function drawHouse(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number, wx: number, wy: number) {
  const h = hash2d(wx * 31 + 7, wy * 17 + 3)
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 22 + h * 6
  const hh = 18 + h * 5

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)"
  roundRect(ctx, cx - w / 2 + 4, cy - hh / 2 + 4, w, hh, 1.5)
  ctx.fill()

  // Roof surface
  const roofHue = 15 + h * 15
  const roofSat = 40 + h * 20
  ctx.fillStyle = `hsl(${roofHue}, ${roofSat}%, ${28 + h * 12}%)`
  roundRect(ctx, cx - w / 2, cy - hh / 2, w, hh, 1.5)
  ctx.fill()

  // Ridge line
  ctx.strokeStyle = `hsla(${roofHue}, ${roofSat}%, 20%, 0.35)`
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx - w / 2 + 2, cy)
  ctx.lineTo(cx + w / 2 - 2, cy)
  ctx.stroke()

  // Shingle lines
  ctx.strokeStyle = `hsla(${roofHue}, ${roofSat}%, 18%, 0.08)`
  ctx.lineWidth = 0.6
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - w / 2 + 1, cy + i * (hh / 7))
    ctx.lineTo(cx + w / 2 - 1, cy + i * (hh / 7))
    ctx.stroke()
  }

  // Chimney
  const chimX = cx + w / 2 - 6
  const chimY = cy - hh / 2 + 1
  ctx.fillStyle = "#555"
  ctx.fillRect(chimX, chimY, 4, 5)
  ctx.fillStyle = "#444"
  ctx.fillRect(chimX + 0.5, chimY + 0.5, 3, 1.5)

  // Night window glow
  if (wg > 0.2) {
    ctx.fillStyle = `rgba(255,220,120,${wg * 0.2})`
    ctx.fillRect(cx - 5, cy - 4, 3, 3)
    ctx.fillRect(cx + 2, cy - 4, 3, 3)
    ctx.fillRect(cx - 5, cy + 2, 3, 3)
  }
}

function drawFarm(ctx: CanvasRenderingContext2D, px: number, py: number, wx: number, wy: number) {
  const h = hash2d(wx * 13 + 5, wy * 19 + 11)
  const inset = 3
  const fw = CELL - inset * 2
  const fh = CELL - inset * 2

  // Crop field base
  const cropG = 120 + h * 50
  ctx.fillStyle = `rgb(${80 + h * 30}, ${cropG}, ${35 + h * 15})`
  ctx.fillRect(px + inset, py + inset, fw, fh)

  // Crop rows (realistic from above)
  const rows = 10 + Math.floor(h * 5)
  const rowSpacing = fh / rows
  for (let i = 0; i < rows; i++) {
    const ry = py + inset + i * rowSpacing
    const lineNoise = hash2d(wx * 7 + i, wy * 3)
    ctx.strokeStyle = `rgba(${60 + lineNoise * 30}, ${cropG - 25 + lineNoise * 10}, ${25 + lineNoise * 10}, 0.35)`
    ctx.lineWidth = rowSpacing * 0.4
    ctx.beginPath()
    ctx.moveTo(px + inset + 1, ry + rowSpacing * 0.5)
    ctx.lineTo(px + inset + fw - 1, ry + rowSpacing * 0.5)
    ctx.stroke()
  }

  // Thin border
  ctx.strokeStyle = "rgba(80,60,30,0.2)"
  ctx.lineWidth = 0.7
  ctx.strokeRect(px + inset, py + inset, fw, fh)
}

function drawCouncil(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 34
  const h = 28

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)"
  roundRect(ctx, cx - w / 2 + 5, cy - h / 2 + 5, w, h, 2)
  ctx.fill()

  // Main roof
  ctx.fillStyle = "#5a5855"
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 2)
  ctx.fill()

  // Columns (lighter dots along front)
  ctx.fillStyle = "#8a8580"
  for (let i = 0; i < 5; i++) {
    const colX = cx - w / 2 + 4 + i * (w - 8) / 4
    ctx.beginPath()
    ctx.arc(colX, cy + h / 2 - 3, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Pediment accent
  ctx.fillStyle = "#6a6660"
  ctx.beginPath()
  ctx.moveTo(cx, cy - h / 2 + 1)
  ctx.lineTo(cx - 12, cy - 3)
  ctx.lineTo(cx + 12, cy - 3)
  ctx.closePath()
  ctx.fill()

  // Courtyard
  ctx.fillStyle = "rgba(150,140,125,0.3)"
  roundRect(ctx, cx - 4, cy + h / 2 - 1, 8, 4, 1)
  ctx.fill()

  if (wg > 0.2) {
    ctx.fillStyle = `rgba(255,210,100,${wg * 0.12})`
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWatchtower(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)"
  ctx.beginPath()
  ctx.arc(cx + 3, cy + 3, 9, 0, Math.PI * 2)
  ctx.fill()

  // Stone base
  ctx.fillStyle = "#706b66"
  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.fill()

  // Top platform
  ctx.fillStyle = "#807b76"
  ctx.beginPath()
  ctx.arc(cx, cy, 6.5, 0, Math.PI * 2)
  ctx.fill()

  // Crenellations
  ctx.fillStyle = "#605b56"
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    ctx.fillRect(cx + Math.cos(a) * 8 - 1.5, cy + Math.sin(a) * 8 - 1.5, 3, 3)
  }

  // Torch
  ctx.fillStyle = `rgba(255,160,40,${0.25 + wg * 0.3})`
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawStorehouse(ctx: CanvasRenderingContext2D, px: number, py: number, wx: number, wy: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 28
  const h = 20

  ctx.fillStyle = "rgba(0,0,0,0.2)"
  roundRect(ctx, cx - w / 2 + 4, cy - h / 2 + 4, w, h, 1)
  ctx.fill()

  ctx.fillStyle = "#5a3518"
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 1)
  ctx.fill()

  // Ridge
  ctx.strokeStyle = "rgba(30,15,5,0.35)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx, cy - h / 2 + 1)
  ctx.lineTo(cx, cy + h / 2 - 1)
  ctx.stroke()

  // Plank lines
  ctx.strokeStyle = "rgba(30,15,5,0.08)"
  ctx.lineWidth = 0.4
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - w / 2 + 1, cy + i * 2.3)
    ctx.lineTo(cx + w / 2 - 1, cy + i * 2.3)
    ctx.stroke()
  }
}

function drawWell(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  ctx.fillStyle = "rgba(0,0,0,0.18)"
  ctx.beginPath()
  ctx.arc(cx + 2, cy + 2, 7.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "#8a8580"
  ctx.beginPath()
  ctx.arc(cx, cy, 7.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "#3578aa"
  ctx.beginPath()
  ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "rgba(100,170,210,0.4)"
  ctx.beginPath()
  ctx.arc(cx - 1.5, cy - 1.5, 2, 0, Math.PI * 2)
  ctx.fill()
}

function drawWall(ctx: CanvasRenderingContext2D, px: number, py: number, wx: number, wy: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  ctx.fillStyle = "rgba(0,0,0,0.15)"
  ctx.fillRect(px + 4 + 3, cy - 4 + 3, CELL - 8, 8)

  ctx.fillStyle = "#706b66"
  ctx.fillRect(px + 4, cy - 4, CELL - 8, 8)

  // Stone texture
  ctx.strokeStyle = "rgba(40,35,30,0.12)"
  ctx.lineWidth = 0.5
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(px + 6 + i * 10, cy - 3)
    ctx.lineTo(px + 6 + i * 10, cy + 3)
    ctx.stroke()
  }
}

// ===== NEW BUILDING RENDERERS =====

function drawShop(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number, wx: number, wy: number) {
  const h = hash2d(wx * 23 + 1, wy * 13 + 9)
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 24 + h * 4
  const hh = 18 + h * 4

  ctx.fillStyle = "rgba(0,0,0,0.2)"
  roundRect(ctx, cx - w / 2 + 4, cy - hh / 2 + 4, w, hh, 2)
  ctx.fill()

  // Colorful shop roof
  const shopHue = 30 + h * 180
  ctx.fillStyle = `hsl(${shopHue}, 35%, 35%)`
  roundRect(ctx, cx - w / 2, cy - hh / 2, w, hh, 2)
  ctx.fill()

  // Awning
  ctx.fillStyle = `hsl(${shopHue}, 45%, 50%)`
  ctx.fillRect(cx - w / 2, cy + hh / 2 - 5, w, 5)

  // Stripes on awning
  ctx.strokeStyle = `hsl(${shopHue}, 45%, 60%)`
  ctx.lineWidth = 0.8
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - w / 2 + 3 + i * 6, cy + hh / 2 - 5)
    ctx.lineTo(cx - w / 2 + 3 + i * 6, cy + hh / 2)
    ctx.stroke()
  }

  if (wg > 0.2) {
    ctx.fillStyle = `rgba(255,220,120,${wg * 0.18})`
    ctx.fillRect(cx - 4, cy - 3, 8, 4)
  }
}

function drawMarket(ctx: CanvasRenderingContext2D, px: number, py: number, wx: number, wy: number) {
  const h = hash2d(wx * 11 + 3, wy * 7 + 1)
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  // Open air market stall with canopy
  ctx.fillStyle = "rgba(0,0,0,0.15)"
  ctx.fillRect(cx - 14 + 3, cy - 10 + 3, 28, 20)

  // Canopy
  const canopyHue = 10 + h * 30
  ctx.fillStyle = `hsl(${canopyHue}, 55%, 45%)`
  roundRect(ctx, cx - 14, cy - 10, 28, 20, 2)
  ctx.fill()

  // Support poles
  ctx.fillStyle = "#5a4a3a"
  ctx.fillRect(cx - 12, cy - 8, 2, 16)
  ctx.fillRect(cx + 10, cy - 8, 2, 16)

  // Goods display
  ctx.fillStyle = `hsl(${40 + h * 20}, 60%, 55%)`
  ctx.fillRect(cx - 8, cy - 2, 5, 4)
  ctx.fillStyle = `hsl(${120 + h * 30}, 50%, 45%)`
  ctx.fillRect(cx + 2, cy - 2, 5, 4)
}

function drawHospital(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 32
  const h = 26

  ctx.fillStyle = "rgba(0,0,0,0.25)"
  roundRect(ctx, cx - w / 2 + 4, cy - h / 2 + 4, w, h, 2)
  ctx.fill()

  // White/cream building
  ctx.fillStyle = "#e8e2d8"
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 2)
  ctx.fill()

  // Red cross on roof
  ctx.fillStyle = "#c0392b"
  ctx.fillRect(cx - 1.5, cy - 6, 3, 12)
  ctx.fillRect(cx - 6, cy - 1.5, 12, 3)

  // Dark roof edge
  ctx.strokeStyle = "rgba(0,0,0,0.15)"
  ctx.lineWidth = 1
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 2)
  ctx.stroke()

  if (wg > 0.2) {
    ctx.fillStyle = `rgba(200,255,255,${wg * 0.15})`
    ctx.beginPath()
    ctx.arc(cx, cy, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSchool(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 28
  const h = 22

  ctx.fillStyle = "rgba(0,0,0,0.22)"
  roundRect(ctx, cx - w / 2 + 4, cy - h / 2 + 4, w, h, 2)
  ctx.fill()

  // Warm brick building
  ctx.fillStyle = "#a0522d"
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 2)
  ctx.fill()

  // Lighter roof peak
  ctx.fillStyle = "#8b4513"
  ctx.beginPath()
  ctx.moveTo(cx, cy - h / 2 - 3)
  ctx.lineTo(cx - w / 2 + 2, cy - h / 2 + 5)
  ctx.lineTo(cx + w / 2 - 2, cy - h / 2 + 5)
  ctx.closePath()
  ctx.fill()

  // Bell tower
  ctx.fillStyle = "#8b7355"
  ctx.fillRect(cx - 2, cy - h / 2 - 6, 4, 5)
  ctx.fillStyle = "#d4a017"
  ctx.beginPath()
  ctx.arc(cx, cy - h / 2 - 5, 1.5, 0, Math.PI * 2)
  ctx.fill()

  // Windows
  if (wg > 0.15) {
    ctx.fillStyle = `rgba(255,230,150,${wg * 0.2})`
    ctx.fillRect(cx - 8, cy - 2, 4, 3)
    ctx.fillRect(cx + 4, cy - 2, 4, 3)
  }
}

function drawCollege(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 30
  const h = 24

  ctx.fillStyle = "rgba(0,0,0,0.25)"
  roundRect(ctx, cx - w / 2 + 4, cy - h / 2 + 4, w, h, 2)
  ctx.fill()

  // Grand stone building
  ctx.fillStyle = "#8a8070"
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 2)
  ctx.fill()

  // Columns
  ctx.fillStyle = "#a09888"
  for (let i = 0; i < 4; i++) {
    const colX = cx - w / 2 + 5 + i * (w - 10) / 3
    ctx.fillRect(colX - 1, cy - h / 2 + 2, 2, h - 4)
  }

  // Dome
  ctx.fillStyle = "#706860"
  ctx.beginPath()
  ctx.arc(cx, cy - h / 2 + 2, 6, Math.PI, 0)
  ctx.fill()

  if (wg > 0.2) {
    ctx.fillStyle = `rgba(255,240,180,${wg * 0.12})`
    ctx.fillRect(cx - 6, cy - 1, 12, 4)
  }
}

function drawInn(ctx: CanvasRenderingContext2D, px: number, py: number, wg: number, wx: number, wy: number) {
  const h = hash2d(wx * 17 + 5, wy * 23 + 3)
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 26
  const hh = 22

  ctx.fillStyle = "rgba(0,0,0,0.22)"
  roundRect(ctx, cx - w / 2 + 4, cy - hh / 2 + 4, w, hh, 2)
  ctx.fill()

  // Warm wooden building
  ctx.fillStyle = "#6b4226"
  roundRect(ctx, cx - w / 2, cy - hh / 2, w, hh, 2)
  ctx.fill()

  // Sign
  ctx.fillStyle = "#d4a017"
  ctx.fillRect(cx - 3, cy - hh / 2 - 2, 6, 3)

  // Door
  ctx.fillStyle = "#3a2010"
  ctx.fillRect(cx - 2, cy + hh / 2 - 5, 4, 5)

  if (wg > 0.3) {
    ctx.fillStyle = `rgba(255,180,80,${wg * 0.25})`
    ctx.beginPath()
    ctx.arc(cx, cy, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWorkshop(ctx: CanvasRenderingContext2D, px: number, py: number, wx: number, wy: number) {
  const h = hash2d(wx * 29 + 7, wy * 11 + 13)
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const w = 26
  const hh = 20

  ctx.fillStyle = "rgba(0,0,0,0.2)"
  roundRect(ctx, cx - w / 2 + 3, cy - hh / 2 + 3, w, hh, 1)
  ctx.fill()

  // Industrial building
  ctx.fillStyle = "#5a5550"
  roundRect(ctx, cx - w / 2, cy - hh / 2, w, hh, 1)
  ctx.fill()

  // Chimney with smoke
  ctx.fillStyle = "#444"
  ctx.fillRect(cx + w / 2 - 7, cy - hh / 2 - 4, 4, 6)

  // Smoke
  ctx.fillStyle = "rgba(100,100,100,0.3)"
  ctx.beginPath()
  ctx.arc(cx + w / 2 - 5, cy - hh / 2 - 6, 3, 0, Math.PI * 2)
  ctx.fill()

  // Door
  ctx.fillStyle = "#3a3530"
  ctx.fillRect(cx - 3, cy + hh / 2 - 4, 6, 4)
}

// ===== PATH DRAWING (road from above) =====
function drawPath(ctx: CanvasRenderingContext2D, px: number, py: number, map: MapTile[][], vx: number, vy: number) {
  const pathW = CELL * 0.35
  const half = pathW / 2
  const cx = px + CELL / 2
  const cy = py + CELL / 2

  const hasN = vy > 0 && map[vy - 1]?.[vx]?.hasPath
  const hasS = map[vy + 1]?.[vx]?.hasPath
  const hasE = map[vy]?.[vx + 1]?.hasPath
  const hasW = vx > 0 && map[vy]?.[vx - 1]?.hasPath

  // Dirt road base
  ctx.fillStyle = "rgba(130,115,90,0.6)"
  ctx.fillRect(cx - half, cy - half, pathW, pathW)
  if (hasN) ctx.fillRect(cx - half, py, pathW, CELL / 2)
  if (hasS) ctx.fillRect(cx - half, cy, pathW, CELL / 2)
  if (hasE) ctx.fillRect(cx, cy - half, CELL / 2, pathW)
  if (hasW) ctx.fillRect(px, cy - half, CELL / 2, pathW)

  // Subtle edge
  ctx.fillStyle = "rgba(100,85,60,0.2)"
  const ew = 1
  if (hasN || hasS) {
    ctx.fillRect(cx - half - ew, py, ew, CELL)
    ctx.fillRect(cx + half, py, ew, CELL)
  }
  if (hasE || hasW) {
    ctx.fillRect(px, cy - half - ew, CELL, ew)
    ctx.fillRect(px, cy + half, CELL, ew)
  }
}

// ===== AGENTS =====
// Age-based colors
function getAgentColor(agent: Agent): string {
  switch (agent.ageGroup) {
    case "child": return "#ffca28"   // Gold/yellow for kids
    case "teen": return "#42a5f5"    // Blue for teens
    case "elder": return "#ab47bc"   // Purple for elders
    default: {
      // Adults colored by role category
      if (["Doctor", "Nurse", "Healer", "Herbalist"].includes(agent.archetype)) return "#ef5350"    // Red for medical
      if (["Guard", "Scout", "Warrior"].includes(agent.archetype)) return "#ffa726"                  // Orange for security
      if (["Farmer", "Fisher", "Hunter"].includes(agent.archetype)) return "#66bb6a"                 // Green for food
      if (["Teacher", "Professor", "Librarian"].includes(agent.archetype)) return "#26c6da"          // Cyan for education
      if (["Shopkeeper", "Merchant", "Baker", "Tailor"].includes(agent.archetype)) return "#ec407a"  // Pink for commerce
      if (["Builder", "Blacksmith", "Carpenter", "Mason"].includes(agent.archetype)) return "#8d6e63" // Brown for trades
      return "#78909c"
    }
  }
}

function getAgentSize(agent: Agent): number {
  switch (agent.ageGroup) {
    case "child": return 3
    case "teen": return 4
    case "elder": return 4.5
    default: return 5
  }
}

function drawAgent(ctx: CanvasRenderingContext2D, px: number, py: number, agent: Agent, index: number, tick: number, currentZoom: number) {
  const cx = px + CELL / 2
  const cy = py + CELL / 2
  const color = getAgentColor(agent)
  const size = getAgentSize(agent)
  const pulse = 0.9 + Math.sin(tick * 0.04 + index * 0.8) * 0.1

  // Sleeping agents are dimmed
  const isSleeping = agent.status === "sleeping"
  const alpha = isSleeping ? "50" : "cc"

  // Small glow
  ctx.fillStyle = color + "15"
  ctx.beginPath()
  ctx.arc(cx, cy, (size + 4) * pulse, 0, Math.PI * 2)
  ctx.fill()

  // Ring
  ctx.strokeStyle = color + (isSleeping ? "40" : "")
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, size + 1, 0, Math.PI * 2)
  ctx.stroke()

  // Fill
  ctx.fillStyle = color + alpha
  ctx.beginPath()
  ctx.arc(cx, cy, size, 0, Math.PI * 2)
  ctx.fill()

  // Center dot
  ctx.fillStyle = isSleeping ? "rgba(255,255,255,0.3)" : "#fff"
  ctx.beginPath()
  ctx.arc(cx, cy, 1.2, 0, Math.PI * 2)
  ctx.fill()

  // Name label (only when zoomed in enough, skip for sleeping at night)
  if (currentZoom > 0.7 && !isSleeping) {
    const label = agent.ageGroup === "child" ? agent.name : `${agent.name}`
    ctx.font = "bold 7px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    const tw = ctx.measureText(label).width
    ctx.fillStyle = "rgba(0,0,0,0.55)"
    roundRect(ctx, cx - tw / 2 - 2, cy - 14, tw + 4, 10, 2)
    ctx.fill()
    ctx.fillStyle = "#fff"
    ctx.fillText(label, cx, cy - 5.5)
  }

  // Status dot
  const sc =
    agent.status === "working" ? "#4caf50" :
    agent.status === "sleeping" ? "#455a64" :
    agent.status === "in_council" ? "#26c6da" :
    agent.status === "on_watch" ? "#ffa726" :
    agent.status === "studying" ? "#42a5f5" :
    agent.status === "shopping" ? "#ec407a" :
    agent.status === "socializing" ? "#ffca28" :
    agent.status === "commuting" ? "#78909c" :
    agent.status === "exploring" ? "#ab47bc" : "#757575"
  if (!isSleeping) {
    ctx.fillStyle = "#000"
    ctx.beginPath()
    ctx.arc(cx + size + 1, cy + size, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = sc
    ctx.beginPath()
    ctx.arc(cx + size + 1, cy + size, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ===== PHASE TINT =====
const PHASE_TINT: Record<Phase, { r: number; g: number; b: number; a: number }> = {
  morning: { r: 255, g: 220, b: 160, a: 0.05 },
  day: { r: 0, g: 0, b: 0, a: 0 },
  evening: { r: 100, g: 60, b: 140, a: 0.1 },
  night: { r: 8, g: 12, b: 40, a: 0.3 },
}

// ===== METRIC PILL =====
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

// ===== MAIN COMPONENT =====
const MAP_SIZE = 60

export function MapStage({ map, agents, phase, metrics, cameraMode }: MapStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 960, h: 640 })
  const [zoom, setZoom] = useState(1)
  const [camera, setCamera] = useState({ x: 30, y: 30 })
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const animTick = useRef(0)
  const rafRef = useRef<number>(0)

  // Pre-rendered tile bitmaps
  const tileBitmapCache = useRef(new Map<string, ImageBitmap | "pending">())

  const windowGlow = phase === "night" ? 1.0 : phase === "evening" ? 0.8 : phase === "morning" ? 0.3 : 0.1
  const tint = PHASE_TINT[phase]

  // Resize observer
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

  // Agent positions (supports multiple agents per tile)
  const agentPositions = useMemo(() => {
    const positions = new Map<string, { agent: Agent; index: number }[]>()
    for (let i = 0; i < agents.length; i++) {
      const key = `${agents[i].position.x},${agents[i].position.y}`
      const existing = positions.get(key) ?? []
      existing.push({ agent: agents[i], index: i })
      positions.set(key, existing)
    }
    return positions
  }, [agents])

  // Clear cache when phase changes (lighting changes ground colors)
  useEffect(() => {
    tileBitmapCache.current.clear()
  }, [phase])

  // ===== RENDER =====
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

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

    const cellZ = CELL * zoom
    const tilesW = Math.ceil(cw / cellZ) + 2
    const tilesH = Math.ceil(ch / cellZ) + 2
    const startWX = camera.x - Math.floor(tilesW / 2)
    const startWY = camera.y - Math.floor(tilesH / 2)
    const offsetPx = {
      x: cw / 2 - (camera.x - startWX) * cellZ,
      y: ch / 2 - (camera.y - startWY) * cellZ,
    }

    const cache = tileBitmapCache.current

    // ── Ground pass: use cached bitmaps or draw fallback ──
    for (let dy = 0; dy < tilesH; dy++) {
      const wy = startWY + dy
      for (let dx = 0; dx < tilesW; dx++) {
        const wx = startWX + dx
        const px = offsetPx.x + dx * cellZ
        const py = offsetPx.y + dy * cellZ
        if (px + cellZ < 0 || py + cellZ < 0 || px > cw || py > ch) continue

        const key = getTileCacheKey(wx, wy, phase)
        const cached = cache.get(key)

        if (cached && cached !== "pending") {
          // Draw cached hi-res tile
          ctx.drawImage(cached, px, py, cellZ, cellZ)
        } else {
          // Fallback: draw a simple color fill while bitmap renders in background
          const inVillage = wx >= 0 && wx < MAP_SIZE && wy >= 0 && wy < MAP_SIZE
          const biome = inVillage
            ? (map[wy]?.[wx]?.biome ?? "plains")
            : getProceduralTile(wx, wy).biome
          const fallbackColors: Record<string, string> = {
            plains: "#5a8a3a",
            forest: "#2d5a27",
            water: "#2a5a7a",
            mountain: "#7a7570",
            desert: "#c4a870",
          }
          ctx.fillStyle = fallbackColors[biome] ?? "#5a8a3a"
          ctx.fillRect(px, py, cellZ, cellZ)

          // Request async bitmap render
          if (!cached) {
            cache.set(key, "pending")
            renderTileBitmap(wx, wy, map, phase).then(bmp => {
              cache.set(key, bmp)
              // Evict old entries if cache is too large
              if (cache.size > CACHE_MAX) {
                const iter = cache.keys()
                for (let i = 0; i < 500; i++) {
                  const k = iter.next().value
                  if (k) cache.delete(k)
                }
              }
            })
          }
        }
      }
    }

    // ── Paths & buildings (village only) ──
    for (let dy = 0; dy < tilesH; dy++) {
      const wy = startWY + dy
      for (let dx = 0; dx < tilesW; dx++) {
        const wx = startWX + dx
        if (wx < 0 || wx >= MAP_SIZE || wy < 0 || wy >= MAP_SIZE) continue
        const tile = map[wy]?.[wx]
        if (!tile) continue
        const px = offsetPx.x + dx * cellZ
        const py = offsetPx.y + dy * cellZ
        if (px + cellZ < 0 || py + cellZ < 0 || px > cw || py > ch) continue

        ctx.save()
        ctx.translate(px, py)
        ctx.scale(zoom, zoom)

        if (tile.hasPath) drawPath(ctx, 0, 0, map, wx, wy)

        if (tile.building === "house") drawHouse(ctx, 0, 0, windowGlow, wx, wy)
        else if (tile.building === "farm") drawFarm(ctx, 0, 0, wx, wy)
        else if (tile.building === "council") drawCouncil(ctx, 0, 0, windowGlow)
        else if (tile.building === "watchtower") drawWatchtower(ctx, 0, 0, windowGlow)
        else if (tile.building === "storehouse") drawStorehouse(ctx, 0, 0, wx, wy)
        else if (tile.building === "well") drawWell(ctx, 0, 0)
        else if (tile.building === "wall") drawWall(ctx, 0, 0, wx, wy)
        else if (tile.building === "shop") drawShop(ctx, 0, 0, windowGlow, wx, wy)
        else if (tile.building === "market") drawMarket(ctx, 0, 0, wx, wy)
        else if (tile.building === "hospital") drawHospital(ctx, 0, 0, windowGlow)
        else if (tile.building === "school") drawSchool(ctx, 0, 0, windowGlow)
        else if (tile.building === "college") drawCollege(ctx, 0, 0, windowGlow)
        else if (tile.building === "inn") drawInn(ctx, 0, 0, windowGlow, wx, wy)
        else if (tile.building === "workshop") drawWorkshop(ctx, 0, 0, wx, wy)

        ctx.restore()
      }
    }

    // ── Agents ──
    for (let dy = 0; dy < tilesH; dy++) {
      const wy = startWY + dy
      for (let dx = 0; dx < tilesW; dx++) {
        const wx = startWX + dx
        const agentList = agentPositions.get(`${wx},${wy}`)
        if (!agentList || agentList.length === 0) continue
        const px = offsetPx.x + dx * cellZ
        const py = offsetPx.y + dy * cellZ
        if (px + cellZ < 0 || py + cellZ < 0 || px > cw || py > ch) continue

        // Draw up to 3 agents per tile; offset slightly so they don't fully overlap
        const toDraw = agentList.slice(0, 3)
        for (let ai = 0; ai < toDraw.length; ai++) {
          ctx.save()
          const offsetX = ai * 4 - (toDraw.length - 1) * 2
          const offsetY = ai * 3
          ctx.translate(px + offsetX * zoom, py + offsetY * zoom)
          ctx.scale(zoom, zoom)
          drawAgent(ctx, 0, 0, toDraw[ai].agent, toDraw[ai].index, tick, zoom)
          ctx.restore()
        }

        // If more than 3, show count
        if (agentList.length > 3) {
          ctx.font = `bold ${8 * zoom}px system-ui, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "top"
          ctx.fillStyle = "rgba(0,0,0,0.6)"
          ctx.fillText(`+${agentList.length - 3}`, px + cellZ / 2, py + cellZ - 10 * zoom)
        }
      }
    }

    // ── Phase tint ──
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

  // ── Pan ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      setCamera(prev => ({
        x: prev.x - dx / (CELL * zoom),
        y: prev.y - dy / (CELL * zoom),
      }))
      lastPos.current = { x: e.clientX, y: e.clientY }
    }

    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const cellZ = CELL * zoom
      const tilesW = Math.ceil(containerSize.w / cellZ) + 2
      const tilesH = Math.ceil(containerSize.h / cellZ) + 2
      const startWX = camera.x - Math.floor(tilesW / 2)
      const startWY = camera.y - Math.floor(tilesH / 2)
      const oX = containerSize.w / 2 - (camera.x - startWX) * cellZ
      const oY = containerSize.h / 2 - (camera.y - startWY) * cellZ
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setHoveredTile({
        x: Math.floor((mx - oX) / cellZ) + startWX,
        y: Math.floor((my - oY) / cellZ) + startWY,
      })
    }
  }, [zoom, camera, containerSize])

  const handleMouseUp = useCallback(() => { isDragging.current = false }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(5, z + (e.deltaY > 0 ? -0.12 : 0.12))))
  }, [])

  // Touch
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
      setCamera(prev => ({
        x: prev.x - dx / (CELL * zoom),
        y: prev.y - dy / (CELL * zoom),
      }))
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }, [zoom])

  const handleTouchEnd = useCallback(() => { isDragging.current = false }, [])

  // Hover info
  const ht = hoveredTile
  const inVH = ht ? ht.x >= 0 && ht.x < MAP_SIZE && ht.y >= 0 && ht.y < MAP_SIZE : false
  const hovInfo = inVH && ht ? map[ht.y]?.[ht.x] : null
  const hovAgents = ht ? agentPositions.get(`${ht.x},${ht.y}`) : null
  const procHov = !inVH && ht ? getProceduralTile(ht.x, ht.y) : null

  return (
    <div className="relative w-full h-full overflow-hidden" ref={containerRef}>
      <div className="absolute inset-0 pointer-events-none z-20 bg-[radial-gradient(ellipse_at_center,transparent_65%,hsl(var(--background))_100%)] opacity-20" />

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
      {ht && (hovInfo || procHov) && (
        <div className="absolute top-3 left-3 z-30 bg-background/80 backdrop-blur-xl border border-border/50 rounded-lg px-3 py-2 text-xs shadow-lg">
          <p className="font-mono font-bold capitalize text-foreground">
            {hovInfo?.biome ?? procHov?.biome ?? "unknown"}
          </p>
          {hovInfo?.building && (
            <p className="text-muted-foreground capitalize">
              Building: <span className="text-foreground">{hovInfo.building}</span>
            </p>
          )}
          {hovAgents && hovAgents.length > 0 && (
            <div className="mt-0.5">
              {hovAgents.slice(0, 5).map((ha) => (
                <p key={ha.agent.id} className="text-primary font-semibold text-[10px]">
                  {ha.agent.name} ({ha.agent.archetype}, {ha.agent.age}y) - {ha.agent.status}
                </p>
              ))}
              {hovAgents.length > 5 && (
                <p className="text-muted-foreground text-[9px]">+{hovAgents.length - 5} more</p>
              )}
            </div>
          )}
          <span className={`font-mono text-[9px] ${inVH ? "text-primary/50" : "text-muted-foreground/50"}`}>
            {inVH ? "Village" : "Wilderness"} [{ht.x}, {ht.y}]
          </span>
        </div>
      )}

      {/* Zoom info */}
      <div className="absolute top-3 right-3 z-30 bg-background/60 backdrop-blur-md border border-border/40 rounded-md px-2 py-1 flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground capitalize">{cameraMode.replace("_", " ")}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Center village */}
      <button
        type="button"
        onClick={() => { setCamera({ x: 30, y: 30 }); setZoom(1) }}
        className="absolute bottom-14 right-3 z-30 bg-background/60 hover:bg-background/80 backdrop-blur-md border border-border/40 rounded-md px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Center Village
      </button>

      {/* Legend */}
      <div className="absolute bottom-28 right-3 z-30 bg-background/60 backdrop-blur-md border border-border/40 rounded-md px-2 py-1.5 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#2d5a27" },
          { label: "Plains", color: "#5a8a3a" },
          { label: "Water", color: "#2a5a7a" },
          { label: "Mountain", color: "#7a7570" },
          { label: "Desert", color: "#c4a870" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="font-mono text-[9px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Metrics */}
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
