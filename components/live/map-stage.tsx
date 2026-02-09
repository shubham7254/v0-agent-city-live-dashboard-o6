"use client"

import { useRef, useEffect } from "react"
import * as THREE from "three"
import type { Agent, MapTile, Phase, WorldMetrics, CameraMode } from "@/lib/types"

// ─── CONSTANTS ────────────────────────────────────
const MAP = 60
const HALF = MAP / 2

// ─── DETERMINISTIC HASH ───────────────────────────
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0
  h = ((h ^ (h >> 13)) * 1274126177) | 0
  return (h >>> 0) / 4294967296
}

// Rolling hills heightmap
function hillH(x: number, z: number): number {
  return (
    Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.35 +
    Math.sin(x * 0.15 + 2.7) * Math.cos(z * 0.12 + 1.3) * 0.15 +
    Math.sin(x * 0.04 + 5.1) * Math.sin(z * 0.035 + 3.8) * 0.5
  )
}

// Phase lighting config
function phaseLight(p: Phase) {
  switch (p) {
    case "morning": return { sun: 0.75, color: 0xffecd2, amb: 0.45, sky: 0x9cb8cf, fog: 0xc8d8e4, fogN: 20, fogF: 55 }
    case "day":     return { sun: 1.0, color: 0xfff5e8, amb: 0.55, sky: 0x8aaccc, fog: 0xb8ccd8, fogN: 25, fogF: 65 }
    case "evening": return { sun: 0.5, color: 0xe07848, amb: 0.35, sky: 0x2a2040, fog: 0x3a2840, fogN: 18, fogF: 50 }
    case "night":   return { sun: 0.15, color: 0x4466aa, amb: 0.25, sky: 0x0a1020, fog: 0x101828, fogN: 12, fogF: 45 }
  }
}

// Michigan season from real date
type Season = "spring" | "summer" | "autumn" | "winter"
function getMichiganSeason(): Season {
  const month = parseInt(new Date().toLocaleString("en-US", { timeZone: "America/Detroit", month: "numeric" }), 10)
  if (month >= 3 && month <= 5) return "spring"
  if (month >= 6 && month <= 8) return "summer"
  if (month >= 9 && month <= 11) return "autumn"
  return "winter"
}

// Season-aware biome colors
const SEASON_TINT: Record<Season, Record<string, [number, number, number]>> = {
  spring: {
    plains: [0.30, 0.50, 0.24], forest: [0.22, 0.42, 0.18], water: [0.20, 0.40, 0.50],
    mountain: [0.42, 0.40, 0.38], desert: [0.55, 0.50, 0.36],
  },
  summer: {
    plains: [0.32, 0.42, 0.22], forest: [0.22, 0.35, 0.16], water: [0.22, 0.38, 0.48],
    mountain: [0.42, 0.40, 0.38], desert: [0.58, 0.50, 0.35],
  },
  autumn: {
    plains: [0.45, 0.38, 0.20], forest: [0.40, 0.30, 0.14], water: [0.22, 0.36, 0.44],
    mountain: [0.44, 0.40, 0.36], desert: [0.56, 0.48, 0.32],
  },
  winter: {
    plains: [0.55, 0.56, 0.54], forest: [0.48, 0.50, 0.48], water: [0.30, 0.42, 0.50],
    mountain: [0.60, 0.60, 0.58], desert: [0.58, 0.55, 0.48],
  },
}

const BIOME_BASE: Record<string, [number, number, number]> = {
  plains: [0.32, 0.42, 0.22], forest: [0.22, 0.35, 0.16], water: [0.22, 0.38, 0.48],
  mountain: [0.42, 0.40, 0.38], desert: [0.58, 0.50, 0.35],
}

const TREE_COLORS: Record<Season, number[]> = {
  spring: [0x4a8a3a, 0x5a9a48, 0x3a7830, 0x68a858, 0x88bb55],
  summer: [0x3a6830, 0x4a7838, 0x2a5820, 0x5a8a40, 0x688a4a],
  autumn: [0xc86830, 0xd8a040, 0xb84820, 0xe8b848, 0xa04018, 0xd87830],
  winter: [0x5a6058, 0x485048, 0x404840, 0x586058, 0x3a4038],
}

function getBiomeColor(biome: string, season: Season): [number, number, number] {
  return SEASON_TINT[season][biome] ?? BIOME_BASE[biome] ?? [0.4, 0.4, 0.4]
}

// Building configs
interface BC { wall: number; roof: number; h: number; fx: number; fz: number; flat: boolean; modern: boolean; win: boolean; door: boolean }
const B: Record<string, BC> = {
  house:      { wall: 0xe8e2d8, roof: 0x4a5058, h: 1.1, fx: 0.52, fz: 0.44, flat: false, modern: true, win: true, door: true },
  farm:       { wall: 0x7a9838, roof: 0x5a7828, h: 0.06, fx: 0.86, fz: 0.86, flat: true, modern: false, win: false, door: false },
  council:    { wall: 0xf0ece4, roof: 0x3a4248, h: 2.2, fx: 0.76, fz: 0.66, flat: true, modern: true, win: true, door: true },
  watchtower: { wall: 0x706860, roof: 0x4a4440, h: 2.5, fx: 0.28, fz: 0.28, flat: true, modern: false, win: true, door: false },
  storehouse: { wall: 0xd0c8b8, roof: 0x585048, h: 1.3, fx: 0.64, fz: 0.48, flat: false, modern: false, win: false, door: true },
  well:       { wall: 0x8a9090, roof: 0x607080, h: 0.3, fx: 0.26, fz: 0.26, flat: true, modern: false, win: false, door: false },
  wall:       { wall: 0x686060, roof: 0x585050, h: 1.0, fx: 0.88, fz: 0.2, flat: true, modern: false, win: false, door: false },
  shop:       { wall: 0xf2ece2, roof: 0xc06030, h: 1.3, fx: 0.52, fz: 0.46, flat: true, modern: true, win: true, door: true },
  market:     { wall: 0xe8dcc8, roof: 0xb04820, h: 0.85, fx: 0.68, fz: 0.56, flat: true, modern: false, win: false, door: false },
  hospital:   { wall: 0xf5f2ee, roof: 0x505860, h: 2.0, fx: 0.72, fz: 0.62, flat: true, modern: true, win: true, door: true },
  school:     { wall: 0xe0d0b8, roof: 0x4a3828, h: 1.5, fx: 0.66, fz: 0.54, flat: false, modern: false, win: true, door: true },
  college:    { wall: 0xd8d4cc, roof: 0x3a4048, h: 2.4, fx: 0.78, fz: 0.68, flat: true, modern: true, win: true, door: true },
  inn:        { wall: 0xc8a878, roof: 0x3a3028, h: 1.4, fx: 0.56, fz: 0.48, flat: false, modern: false, win: true, door: true },
  workshop:   { wall: 0x686460, roof: 0x3a3835, h: 1.5, fx: 0.58, fz: 0.48, flat: true, modern: false, win: true, door: true },
}

// ═══════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════
interface MapStageProps {
  map: MapTile[][]
  agents: Agent[]
  phase: Phase
  metrics: WorldMetrics | null
  cameraMode: CameraMode
  onAgentClick?: (agentId: string) => void
}

export function MapStage({ map, agents, phase, onAgentClick }: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    animId: number
  } | null>(null)

  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  const onAgentClickRef = useRef(onAgentClick)
  onAgentClickRef.current = onAgentClick

  // Build scene once
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // ─── RENDERER ───
    const dpr = Math.min(window.devicePixelRatio, 1.5)
    const renderer = new THREE.WebGLRenderer({ antialias: dpr <= 1, alpha: false, powerPreference: "high-performance" })
    renderer.setPixelRatio(dpr)
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.BasicShadowMap // Much faster than PCFSoft
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    // ─── SCENE ───
    const scene = new THREE.Scene()
    const fog = new THREE.Fog(0xb8ccd8, 25, 65)
    scene.fog = fog

    // ─── CAMERA (orthographic isometric) ───
    const aspect = el.clientWidth / el.clientHeight
    const frustum = 18
    const camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 300
    )
    camera.position.set(20, 24, 20)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()

    // Orbit state
    const target = new THREE.Vector3(0, 0, 0)
    const offset = new THREE.Vector3().subVectors(camera.position, target)
    const spherical = new THREE.Spherical().setFromVector3(offset)

    // ─── LIGHTS (minimal for perf) ───
    const ambLight = new THREE.AmbientLight(0xc0c8d0, 0.55)
    scene.add(ambLight)

    const sunLight = new THREE.DirectionalLight(0xfff5e8, 1.0)
    sunLight.position.set(18, 30, 14)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(512, 512) // Halved from 1024
    sunLight.shadow.camera.far = 80
    sunLight.shadow.camera.left = -35
    sunLight.shadow.camera.right = 35
    sunLight.shadow.camera.top = 35
    sunLight.shadow.camera.bottom = -35
    sunLight.shadow.bias = -0.0004
    sunLight.shadow.normalBias = 0.02
    scene.add(sunLight)

    const hemiLight = new THREE.HemisphereLight(0xa8c0d8, 0x607040, 0.2)
    scene.add(hemiLight)

    // Moonlight
    const moonLight = new THREE.DirectionalLight(0x6688cc, 0)
    moonLight.position.set(-10, 25, -8)
    scene.add(moonLight)

    // ─── BASE PLANE ───
    const basePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x4a6830 })
    )
    basePlane.rotation.x = -Math.PI / 2
    basePlane.position.y = -0.2
    basePlane.receiveShadow = true
    scene.add(basePlane)

    // ─── TERRAIN (InstancedMesh) ───
    const season = getMichiganSeason()
    const tileCount = MAP * MAP
    const tileGeo = new THREE.BoxGeometry(1, 0.12, 1)
    const tileMat = new THREE.MeshLambertMaterial({ vertexColors: true })
    const tileMesh = new THREE.InstancedMesh(tileGeo, tileMat, tileCount)
    tileMesh.receiveShadow = true
    const dummy = new THREE.Object3D()
    const tileColors = new Float32Array(tileCount * 3)
    const c = new THREE.Color()
    let idx = 0
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (!tile) { idx++; continue }
        const wx = x - HALF + 0.5
        const wz = y - HALF + 0.5
        const rng = hash(x * 11, y * 23)
        const rng2 = hash(x * 37, y * 53)
        let h = 0
        if (tile.biome === "water") h = -0.12
        else if (tile.hasPath || tile.building) h = hillH(wx, wz) * 0.1
        else h = hillH(wx, wz)
        dummy.position.set(wx, h - 0.06, wz)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1.005, 1, 1.005)
        dummy.updateMatrix()
        tileMesh.setMatrixAt(idx, dummy.matrix)
        const base = tile.hasPath
          ? [0.28 + rng * 0.02, 0.28 + rng * 0.02, 0.27 + rng * 0.02] as [number, number, number]
          : getBiomeColor(tile.biome, season)
        c.setRGB(base[0] + (rng - 0.5) * 0.04, base[1] + (rng2 - 0.5) * 0.04, base[2] + (rng - 0.5) * 0.03, THREE.SRGBColorSpace)
        tileColors[idx * 3] = c.r
        tileColors[idx * 3 + 1] = c.g
        tileColors[idx * 3 + 2] = c.b
        idx++
      }
    }
    tileMesh.instanceMatrix.needsUpdate = true
    tileGeo.setAttribute("color", new THREE.InstancedBufferAttribute(tileColors, 3))
    scene.add(tileMesh)

    // ─── ROADS (InstancedMesh batched) ───
    // Count road tiles first
    const roadTiles: { x: number; z: number; hasN: boolean; hasS: boolean; hasE: boolean; hasW: boolean }[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (!map[y]?.[x]?.hasPath) continue
        roadTiles.push({
          x, z: y,
          hasN: !!(map[y - 1]?.[x]?.hasPath),
          hasS: !!(map[y + 1]?.[x]?.hasPath),
          hasE: !!(map[y]?.[x + 1]?.hasPath),
          hasW: !!(map[y]?.[x - 1]?.hasPath),
        })
      }
    }

    // Road asphalt - instanced
    const roadGeo = new THREE.BoxGeometry(0.96, 0.05, 0.96)
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 })
    const roadIM = new THREE.InstancedMesh(roadGeo, roadMat, roadTiles.length)
    roadIM.receiveShadow = true
    roadTiles.forEach((rt, i) => {
      const wx = rt.x - HALF + 0.5
      const wz = rt.z - HALF + 0.5
      const rh = hillH(wx, wz) * 0.1
      dummy.position.set(wx, rh + 0.01, wz)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      roadIM.setMatrixAt(i, dummy.matrix)
    })
    roadIM.instanceMatrix.needsUpdate = true
    scene.add(roadIM)

    // Sidewalks - instanced (count edges without neighbors)
    const sidewalkData: { wx: number; wz: number; rh: number; rotY: number }[] = []
    for (const rt of roadTiles) {
      const wx = rt.x - HALF + 0.5
      const wz = rt.z - HALF + 0.5
      const rh = hillH(wx, wz) * 0.1
      if (!rt.hasN) sidewalkData.push({ wx, wz: wz - 0.46, rh: rh + 0.03, rotY: 0 })
      if (!rt.hasS) sidewalkData.push({ wx, wz: wz + 0.46, rh: rh + 0.03, rotY: 0 })
      if (!rt.hasE) sidewalkData.push({ wx: wx + 0.46, wz, rh: rh + 0.03, rotY: Math.PI / 2 })
      if (!rt.hasW) sidewalkData.push({ wx: wx - 0.46, wz, rh: rh + 0.03, rotY: Math.PI / 2 })
    }
    if (sidewalkData.length > 0) {
      const sideGeo = new THREE.BoxGeometry(1, 0.06, 0.08)
      const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xb8b4aa })
      const sidewalkIM = new THREE.InstancedMesh(sideGeo, sidewalkMat, sidewalkData.length)
      sidewalkData.forEach((s, i) => {
        dummy.position.set(s.wx, s.rh, s.wz)
        dummy.rotation.set(0, s.rotY, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        sidewalkIM.setMatrixAt(i, dummy.matrix)
      })
      sidewalkIM.instanceMatrix.needsUpdate = true
      scene.add(sidewalkIM)
    }

    // Center yellow lines - instanced
    const lineData: { wx: number; wz: number; rh: number; rotY: number }[] = []
    for (const rt of roadTiles) {
      const isNS = rt.hasN && rt.hasS && !rt.hasE && !rt.hasW
      const isEW = rt.hasE && rt.hasW && !rt.hasN && !rt.hasS
      if (isNS || isEW) {
        const wx = rt.x - HALF + 0.5
        const wz = rt.z - HALF + 0.5
        const rh = hillH(wx, wz) * 0.1
        lineData.push({ wx, wz, rh: rh + 0.02, rotY: isEW ? Math.PI / 2 : 0 })
      }
    }
    if (lineData.length > 0) {
      const lineGeo = new THREE.BoxGeometry(0.015, 0.003, 0.3)
      const yellowMat = new THREE.MeshLambertMaterial({ color: 0xd4c840 })
      const lineIM = new THREE.InstancedMesh(lineGeo, yellowMat, lineData.length)
      lineData.forEach((l, i) => {
        dummy.position.set(l.wx, l.rh, l.wz)
        dummy.rotation.set(0, l.rotY, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        lineIM.setMatrixAt(i, dummy.matrix)
      })
      lineIM.instanceMatrix.needsUpdate = true
      scene.add(lineIM)
    }

    // ─── BUILDINGS (merged geometry approach) ───
    // Use shared geometries + a single merged group with castShadow on the group
    const bldGroup = new THREE.Group()
    scene.add(bldGroup)
    const windowGlassMats: THREE.MeshLambertMaterial[] = []

    // Shared geometries cache
    const geoCache = new Map<string, THREE.BoxGeometry>()
    function getBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
      const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`
      let g = geoCache.get(key)
      if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(key, g) }
      return g
    }

    // Shared materials cache
    const matCache = new Map<number, THREE.MeshLambertMaterial>()
    function getLambertMat(color: number): THREE.MeshLambertMaterial {
      let m = matCache.get(color)
      if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(color, m) }
      return m
    }

    // Night glow (shared for all windows)
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x6080a0, transparent: true, opacity: 0.65, emissive: 0xffcc44, emissiveIntensity: 0 })
    windowGlassMats.push(glassMat)

    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (!tile?.building || tile.building === "road") continue
        const cfg = B[tile.building]
        if (!cfg) continue
        const wx = x - HALF + 0.5
        const wz = y - HALF + 0.5
        const rng = hash(x * 13 + 3, y * 7 + 11)
        const rng2 = hash(x * 37 + 1, y * 19 + 5)
        const h = cfg.h * (0.9 + rng * 0.2)
        const fx = cfg.fx * (0.94 + rng2 * 0.1)
        const fz = cfg.fz * (0.94 + rng * 0.1)
        const baseY = hillH(wx, wz) * 0.1

        const grp = new THREE.Group()
        grp.position.set(wx, baseY, wz)

        // Foundation
        const found = new THREE.Mesh(getBoxGeo(fx + 0.06, 0.03, fz + 0.06), getLambertMat(0xb0aaa0))
        found.position.y = 0.015
        grp.add(found)

        // Main walls
        const walls = new THREE.Mesh(getBoxGeo(fx, h, fz), getLambertMat(cfg.wall))
        walls.position.y = h / 2 + 0.03
        walls.castShadow = true
        grp.add(walls)

        // Roof
        if (cfg.flat) {
          const roofM = new THREE.Mesh(getBoxGeo(fx + 0.04, 0.04, fz + 0.04), getLambertMat(cfg.roof))
          roofM.position.y = h + 0.05
          grp.add(roofM)
        } else if (h > 0.2) {
          const roofMat = getLambertMat(cfg.roof)
          const halfRoof = getBoxGeo(fx + 0.04, 0.025, fz * 0.52)
          const r1 = new THREE.Mesh(halfRoof, roofMat)
          r1.position.set(0, h + 0.15, -fz * 0.22)
          r1.rotation.x = 0.45
          grp.add(r1)
          const r2 = new THREE.Mesh(halfRoof, roofMat)
          r2.position.set(0, h + 0.15, fz * 0.22)
          r2.rotation.x = -0.45
          grp.add(r2)
        }

        // Windows (simplified - fewer, use shared material)
        if (cfg.win && h > 0.6) {
          const nw = Math.max(1, Math.floor(fx / 0.25)) // fewer windows
          const spacing = fx / (nw + 1)
          const winGeo = getBoxGeo(0.08, 0.1, 0.008)
          for (let wi = 0; wi < nw; wi++) {
            const wxp = -fx / 2 + spacing * (wi + 1)
            const wyp = h * 0.55 + 0.03
            const glass = new THREE.Mesh(winGeo, glassMat)
            glass.position.set(wxp, wyp, fz / 2 + 0.001)
            grp.add(glass)
          }
        }

        // Door
        if (cfg.door && h > 0.4) {
          const doorM = new THREE.Mesh(
            getBoxGeo(0.1, 0.2, 0.01),
            getLambertMat(cfg.modern ? 0x605850 : 0x3a2010)
          )
          doorM.position.set(rng > 0.5 ? 0.06 : -0.06, 0.13, fz / 2 + 0.001)
          grp.add(doorM)
        }

        bldGroup.add(grp)
      }
    }

    // ─── TREES (InstancedMesh - same as before but with Lambert) ───
    const treeData: { x: number; z: number; rng: number; rng2: number }[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (tile?.biome === "forest" && !tile.building && !tile.hasPath) {
          const r = hash(x * 7, y * 13)
          if (r > 0.35) treeData.push({ x, z: y, rng: r, rng2: hash(x * 31, y * 47) }) // slightly fewer trees
        }
        if (tile?.hasPath) {
          const r = hash(x * 53, y * 67)
          if (r > 0.9) treeData.push({ x, z: y, rng: r, rng2: hash(x * 71, y * 83) })
        }
      }
    }
    if (treeData.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.018, 0.03, 0.5, 4) // 4 sides instead of 5
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 })
      const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, treeData.length)
      trunkIM.castShadow = true

      const canopyGeo = new THREE.DodecahedronGeometry(0.5, 0) // LOD 0 instead of 1
      const canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true })
      const canopyIM = new THREE.InstancedMesh(canopyGeo, canopyMat, treeData.length)
      canopyIM.castShadow = true

      const canopyColors = new Float32Array(treeData.length * 3)
      treeData.forEach((t, i) => {
        const wx = t.x - HALF + 0.5 + (t.rng - 0.5) * 0.2
        const wz = t.z - HALF + 0.5 + (t.rng2 - 0.5) * 0.2
        const baseY = hillH(wx, wz)
        const trunkH = 0.3 + t.rng * 0.35

        dummy.position.set(wx, baseY + trunkH / 2, wz)
        dummy.rotation.set(0, t.rng * Math.PI * 2, (t.rng2 - 0.5) * 0.12)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        trunkIM.setMatrixAt(i, dummy.matrix)

        const cw = 0.18 + t.rng2 * 0.15
        dummy.position.set(wx + (t.rng - 0.5) * 0.06, baseY + trunkH + cw * 0.4, wz + (t.rng2 - 0.5) * 0.06)
        dummy.scale.set(cw * (1.4 + t.rng * 0.8), cw * (0.8 + t.rng2 * 0.6), cw * (1.4 + t.rng2 * 0.8))
        dummy.rotation.set(0, t.rng * Math.PI, 0)
        dummy.updateMatrix()
        canopyIM.setMatrixAt(i, dummy.matrix)

        const seasonColors = TREE_COLORS[season]
        const treeC = seasonColors[Math.floor(t.rng * seasonColors.length) % seasonColors.length]
        c.setHex(treeC)
        canopyColors[i * 3] = c.r
        canopyColors[i * 3 + 1] = c.g
        canopyColors[i * 3 + 2] = c.b
      })
      trunkIM.instanceMatrix.needsUpdate = true
      canopyIM.instanceMatrix.needsUpdate = true
      canopyGeo.setAttribute("color", new THREE.InstancedBufferAttribute(canopyColors, 3))
      scene.add(trunkIM)
      scene.add(canopyIM)
    }

    // ─── WATER (InstancedMesh instead of individual meshes) ───
    const waterTiles: { x: number; z: number }[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (map[y]?.[x]?.biome === "water") waterTiles.push({ x, z: y })
      }
    }
    let waterIM: THREE.InstancedMesh | null = null
    if (waterTiles.length > 0) {
      const waterGeo = new THREE.BoxGeometry(1.01, 0.08, 1.01)
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x2a5878, transparent: true, opacity: 0.82 })
      waterIM = new THREE.InstancedMesh(waterGeo, waterMat, waterTiles.length)
      waterTiles.forEach((wt, i) => {
        dummy.position.set(wt.x - HALF + 0.5, -0.06, wt.z - HALF + 0.5)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        waterIM!.setMatrixAt(i, dummy.matrix)
      })
      waterIM.instanceMatrix.needsUpdate = true
      scene.add(waterIM)
    }

    // ─── STREETLIGHTS (InstancedMesh, no PointLights) ───
    const slData: { wx: number; wz: number; baseY: number }[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (map[y]?.[x]?.hasPath && hash(x * 41, y * 59) > 0.82) {
          const wx = x - HALF + 0.5 + 0.38
          const wz = y - HALF + 0.5
          slData.push({ wx, wz, baseY: hillH(wx, wz) * 0.1 })
        }
      }
    }
    if (slData.length > 0) {
      const poleGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.8, 4)
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x505558 })
      const poleIM = new THREE.InstancedMesh(poleGeo, poleMat, slData.length)
      const lampGeo = new THREE.BoxGeometry(0.06, 0.02, 0.035)
      const lampMat = new THREE.MeshLambertMaterial({ color: 0xe0ddd5, emissive: 0xffd888, emissiveIntensity: 0 })
      windowGlassMats.push(lampMat)
      const lampIM = new THREE.InstancedMesh(lampGeo, lampMat, slData.length)
      slData.forEach((sl, i) => {
        dummy.position.set(sl.wx, sl.baseY, sl.wz)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        poleIM.setMatrixAt(i, dummy.matrix)
        dummy.position.set(sl.wx - 0.1, sl.baseY + 0.42, sl.wz)
        dummy.updateMatrix()
        lampIM.setMatrixAt(i, dummy.matrix)
      })
      poleIM.instanceMatrix.needsUpdate = true
      lampIM.instanceMatrix.needsUpdate = true
      scene.add(poleIM)
      scene.add(lampIM)
    }

    // ─── PARKED CARS (InstancedMesh) ───
    const carColors = [0x8a3020, 0x1a4a78, 0x2a6838, 0xe0d0b8, 0x484848, 0xb8a888, 0x6a2838]
    const parkedData: { wx: number; wz: number; baseY: number; rotY: number; colorIdx: number }[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (tile?.building && ["shop", "hospital", "college", "market", "inn"].includes(tile.building)) {
          const r = hash(x * 23, y * 41)
          if (r > 0.4 && parkedData.length < 24) {
            const wx = x - HALF + 0.5 + (r - 0.5) * 0.3
            const wz = y - HALF + 0.5 + 0.55
            parkedData.push({ wx, wz, baseY: hillH(wx, wz) * 0.1 + 0.06, rotY: r > 0.7 ? 0 : Math.PI / 2, colorIdx: Math.floor(r * carColors.length) })
          }
        }
      }
    }
    if (parkedData.length > 0) {
      const carBodyGeo = new THREE.BoxGeometry(0.3, 0.09, 0.15)
      const carBodyMat = new THREE.MeshLambertMaterial({ vertexColors: true })
      const carBodyIM = new THREE.InstancedMesh(carBodyGeo, carBodyMat, parkedData.length)
      carBodyIM.castShadow = true
      const carBodyColors = new Float32Array(parkedData.length * 3)
      const cabinGeo = new THREE.BoxGeometry(0.16, 0.06, 0.12)
      const cabinMat = new THREE.MeshLambertMaterial({ color: 0x6a8ca8, transparent: true, opacity: 0.7 })
      const cabinIM = new THREE.InstancedMesh(cabinGeo, cabinMat, parkedData.length)
      parkedData.forEach((cd, i) => {
        dummy.position.set(cd.wx, cd.baseY, cd.wz)
        dummy.rotation.set(0, cd.rotY, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        carBodyIM.setMatrixAt(i, dummy.matrix)
        dummy.position.y += 0.065
        dummy.updateMatrix()
        cabinIM.setMatrixAt(i, dummy.matrix)
        c.setHex(carColors[cd.colorIdx])
        carBodyColors[i * 3] = c.r
        carBodyColors[i * 3 + 1] = c.g
        carBodyColors[i * 3 + 2] = c.b
      })
      carBodyIM.instanceMatrix.needsUpdate = true
      cabinIM.instanceMatrix.needsUpdate = true
      carBodyGeo.setAttribute("color", new THREE.InstancedBufferAttribute(carBodyColors, 3))
      scene.add(carBodyIM)
      scene.add(cabinIM)
    }

    // ─── MOVING CARS (road-constrained, limited to 6) ───
    const roadSet = new Set<string>()
    const roadList: { x: number; z: number }[] = []
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++)
        if (map[y]?.[x]?.hasPath) { roadSet.add(`${x},${y}`); roadList.push({ x, z: y }) }

    function getRoadNeighbors(rx: number, rz: number) {
      const nb: { x: number; z: number }[] = []
      if (roadSet.has(`${rx},${rz - 1}`)) nb.push({ x: rx, z: rz - 1 })
      if (roadSet.has(`${rx},${rz + 1}`)) nb.push({ x: rx, z: rz + 1 })
      if (roadSet.has(`${rx + 1},${rz}`)) nb.push({ x: rx + 1, z: rz })
      if (roadSet.has(`${rx - 1},${rz}`)) nb.push({ x: rx - 1, z: rz })
      return nb
    }

    function buildCarPath(startIdx: number, length: number) {
      const start = roadList[startIdx % roadList.length]
      if (!start) return []
      const path = [start]
      let cur = start, prev = { x: -1, z: -1 }
      for (let step = 0; step < length; step++) {
        const nb = getRoadNeighbors(cur.x, cur.z).filter(n => !(n.x === prev.x && n.z === prev.z))
        if (nb.length === 0) break
        const r = hash(startIdx * 71 + step * 13, step * 37 + startIdx * 53)
        prev = cur; cur = nb[Math.floor(r * nb.length)]; path.push(cur)
      }
      return path
    }

    const numCars = Math.min(6, Math.floor(roadList.length / 12))
    const movingCarGroups: THREE.Group[] = []
    const mvCarColors = [0x8a2e20, 0x1e4e7a, 0x1e6e38, 0xd8c0a0, 0x383838, 0xc02020]
    for (let i = 0; i < numCars; i++) {
      const pathLen = 30 + Math.floor(hash(i * 19, i * 41) * 40)
      const startIdx = Math.floor(hash(i * 29, i * 43) * roadList.length)
      const path = buildCarPath(startIdx, pathLen)
      if (path.length < 4) continue
      const cg = new THREE.Group()
      const bd = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.16), getLambertMat(mvCarColors[i % mvCarColors.length]))
      bd.castShadow = true
      cg.add(bd)
      const cb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.065, 0.13), new THREE.MeshLambertMaterial({ color: 0x6890b0, transparent: true, opacity: 0.7 }))
      cb.position.y = 0.075
      cg.add(cb)
      cg.userData = { path, speed: 0.3 + hash(i * 17, i * 31) * 0.4, idx: i }
      scene.add(cg)
      movingCarGroups.push(cg)
    }

    // ─── AGENT MESHES ───
    const agentMeshes = new Map<string, THREE.Group>()
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe0c0a0 })
    const capsuleGeo = new THREE.CapsuleGeometry(0.04, 0.08, 2, 6)
    const headGeo = new THREE.SphereGeometry(0.05, 6, 6)

    function getOrCreateAgent(agent: Agent): THREE.Group {
      let ag = agentMeshes.get(agent.id)
      if (ag) return ag
      ag = new THREE.Group()
      const body = new THREE.Mesh(capsuleGeo, bodyMat)
      body.castShadow = true
      ag.add(body)
      const head = new THREE.Mesh(headGeo, bodyMat)
      head.position.y = 0.1
      ag.add(head)
      ag.userData = { agentId: agent.id }
      scene.add(ag)
      agentMeshes.set(agent.id, ag)
      return ag
    }

    // ─── ORBIT CONTROLS ───
    let isDragging = false
    let isRightDrag = false
    let lastMouse = { x: 0, y: 0 }

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true; isRightDrag = e.button === 2; lastMouse = { x: e.clientX, y: e.clientY }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return
      const dx = e.clientX - lastMouse.x
      const dy = e.clientY - lastMouse.y
      lastMouse = { x: e.clientX, y: e.clientY }
      if (isRightDrag) {
        spherical.theta -= dx * 0.005
        spherical.phi -= dy * 0.005
        spherical.phi = Math.max(0.3, Math.min(Math.PI / 2.5, spherical.phi))
      } else {
        const panSpeed = 0.04 / (camera.zoom * 0.05)
        const right = new THREE.Vector3()
        right.crossVectors(camera.up, new THREE.Vector3().subVectors(camera.position, target).normalize()).normalize()
        const forward = new THREE.Vector3().crossVectors(right, new THREE.Vector3(0, 1, 0)).normalize()
        target.addScaledVector(right, -dx * panSpeed)
        target.addScaledVector(forward, dy * panSpeed)
      }
      updateCamera()
    }
    const onPointerUp = () => { isDragging = false }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.zoom = Math.max(3, Math.min(80, camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08)))
      camera.updateProjectionMatrix()
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    function updateCamera() {
      const off = new THREE.Vector3().setFromSpherical(spherical)
      camera.position.copy(target).add(off)
      camera.lookAt(target)
      camera.updateProjectionMatrix()
    }

    const domEl = renderer.domElement
    domEl.addEventListener("pointerdown", onPointerDown)
    domEl.addEventListener("pointermove", onPointerMove)
    domEl.addEventListener("pointerup", onPointerUp)
    domEl.addEventListener("pointerleave", onPointerUp)
    domEl.addEventListener("wheel", onWheel, { passive: false })
    domEl.addEventListener("contextmenu", onContextMenu)

    // Agent click detection
    const raycaster = new THREE.Raycaster()
    const clickMouse = new THREE.Vector2()
    let clickStart = { x: 0, y: 0 }
    domEl.addEventListener("pointerdown", (e) => { clickStart = { x: e.clientX, y: e.clientY } })
    const onClickForAgent = (e: MouseEvent) => {
      const dx = e.clientX - clickStart.x, dy = e.clientY - clickStart.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) return
      if (!onAgentClickRef.current) return
      const rect = domEl.getBoundingClientRect()
      clickMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      clickMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(clickMouse, camera)
      const allChildren: THREE.Object3D[] = []
      for (const grp of agentMeshes.values()) grp.traverse((child) => allChildren.push(child))
      const intersects = raycaster.intersectObjects(allChildren, false)
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object
        while (obj) {
          if (obj.userData?.agentId) { onAgentClickRef.current(obj.userData.agentId); return }
          obj = obj.parent
        }
      }
    }
    domEl.addEventListener("click", onClickForAgent)

    // Throttled hover
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null
    const onHoverCheck = (e: MouseEvent) => {
      if (hoverTimeout) return
      hoverTimeout = setTimeout(() => {
        hoverTimeout = null
        const rect = domEl.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        let found = false
        for (const [, grp] of agentMeshes) {
          if (!grp.visible) continue
          const pos = grp.position.clone().project(camera)
          const sx = (pos.x * 0.5 + 0.5) * rect.width
          const sy = (-pos.y * 0.5 + 0.5) * rect.height
          if (Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) < 20) { found = true; break }
        }
        domEl.style.cursor = found ? "pointer" : ""
      }, 150) // Increased from 100ms
    }
    domEl.addEventListener("mousemove", onHoverCheck)

    // ─── RESIZE ───
    const onResize = () => {
      if (!el) return
      const w = el.clientWidth, h2 = el.clientHeight, a = w / h2
      camera.left = -frustum * a; camera.right = frustum * a
      camera.top = frustum; camera.bottom = -frustum
      camera.updateProjectionMatrix()
      renderer.setSize(w, h2)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(el)

    // ─── WEATHER PARTICLES (reduced count) ───
    const particleCount = season === "winter" ? 300 : season === "autumn" ? 150 : 0
    let particleSystem: THREE.Points | null = null
    let particlePositions: Float32Array | null = null
    let particleSpeeds: Float32Array | null = null

    if (particleCount > 0) {
      const pGeo = new THREE.BufferGeometry()
      particlePositions = new Float32Array(particleCount * 3)
      particleSpeeds = new Float32Array(particleCount)
      for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = (Math.random() - 0.5) * MAP
        particlePositions[i * 3 + 1] = Math.random() * 15
        particlePositions[i * 3 + 2] = (Math.random() - 0.5) * MAP
        particleSpeeds[i] = 0.3 + Math.random() * 0.7
      }
      pGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3))
      const pMat = new THREE.PointsMaterial({
        color: season === "winter" ? 0xffffff : 0xc86830,
        size: season === "winter" ? 0.06 : 0.08,
        transparent: true, opacity: season === "winter" ? 0.8 : 0.6, depthWrite: false,
      })
      particleSystem = new THREE.Points(pGeo, pMat)
      scene.add(particleSystem)
    }

    // ─── ANIMATION LOOP (throttled to ~30fps) ───
    const clock = new THREE.Clock()
    let animId = 0
    let lastPhase = ""
    let frameCount = 0

    function animate() {
      animId = requestAnimationFrame(animate)
      frameCount++

      // Skip every other frame for ~30fps
      if (frameCount % 2 !== 0) return

      const t = clock.getElapsedTime()
      const ph = phaseRef.current
      const light = phaseLight(ph)
      const isNight = ph === "night" || ph === "evening"
      const phaseChanged = ph !== lastPhase
      lastPhase = ph

      // Update lighting
      sunLight.intensity = light.sun
      sunLight.color.set(light.color)
      ambLight.intensity = light.amb
      hemiLight.intensity = ph === "night" ? 0.12 : 0.2
      hemiLight.color.set(ph === "night" ? 0x283858 : 0xa8c0d8)
      hemiLight.groundColor.set(ph === "night" ? 0x141c28 : 0x607040)
      moonLight.intensity = ph === "night" ? 0.4 : ph === "evening" ? 0.2 : 0

      if (phaseChanged) {
        fog.color.set(light.fog)
        fog.near = light.fogN
        fog.far = light.fogF
        scene.background = new THREE.Color(light.sky)
        renderer.toneMappingExposure = ph === "night" ? 1.6 : ph === "evening" ? 1.3 : 1.1
        // Window glow
        for (const gm of windowGlassMats) {
          gm.emissiveIntensity = isNight ? 0.8 : ph === "evening" ? 0.4 : 0
          gm.opacity = isNight ? 0.9 : 0.65
        }
      }

      // Animate water (every 6th rendered frame)
      if (waterIM && frameCount % 6 === 0) {
        waterTiles.forEach((wt, i) => {
          dummy.position.set(wt.x - HALF + 0.5, -0.06 + Math.sin(t * 0.4 + wt.x * 0.25 + wt.z * 0.2) * 0.01, wt.z - HALF + 0.5)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          waterIM!.setMatrixAt(i, dummy.matrix)
        })
        waterIM.instanceMatrix.needsUpdate = true
      }

      // Animate moving cars
      for (const cg of movingCarGroups) {
        const d = cg.userData as { path: { x: number; z: number }[]; speed: number; idx: number }
        const pathLen = d.path.length
        if (pathLen < 2) continue
        const totalDist = pathLen - 1
        const ct = (t * d.speed + d.idx * 3.7) % (totalDist * 2)
        const progress = ct <= totalDist ? ct : totalDist * 2 - ct
        const segIdx = Math.min(Math.floor(progress), pathLen - 2)
        const frac = progress - segIdx
        const a = d.path[segIdx], b = d.path[segIdx + 1]
        const wx = (a.x + (b.x - a.x) * frac) - HALF + 0.5
        const wz = (a.z + (b.z - a.z) * frac) - HALF + 0.5
        cg.position.set(wx, hillH(wx, wz) * 0.1 + 0.08, wz)
        const ddx = b.x - a.x, ddz = b.z - a.z
        if (ddx !== 0 || ddz !== 0) cg.rotation.y = Math.atan2(ddx, ddz)
      }

      // Update agents
      const currentAgents = agentsRef.current
      const activeIds = new Set<string>()
      for (const agent of currentAgents) {
        activeIds.add(agent.id)
        const ag = getOrCreateAgent(agent)
        if (agent.status === "sleeping" && isNight) { ag.visible = false; continue }
        ag.visible = true
        const wx = agent.position.x - HALF + 0.5
        const wz = agent.position.y - HALF + 0.5
        const baseY = hillH(wx, wz)
        const idxN = parseInt(agent.id.replace(/\D/g, ""), 10) || 0
        ag.position.set(wx, baseY + 0.12 + Math.abs(Math.sin(t * 3 + idxN * 1.1)) * 0.015, wz)
      }
      for (const [id, mesh] of agentMeshes) {
        if (!activeIds.has(id)) { scene.remove(mesh); agentMeshes.delete(id) }
      }

      // Particles (every 4th rendered frame)
      if (particleSystem && particlePositions && particleSpeeds && frameCount % 4 === 0) {
        for (let i = 0; i < particleCount; i++) {
          particlePositions[i * 3 + 1] -= particleSpeeds[i] * 0.04
          if (season === "autumn") {
            particlePositions[i * 3] += Math.sin(t * 2 + i) * 0.01
            particlePositions[i * 3 + 2] += Math.cos(t * 1.5 + i * 0.7) * 0.006
          } else {
            particlePositions[i * 3] += Math.sin(t + i * 0.1) * 0.004
          }
          if (particlePositions[i * 3 + 1] < 0) {
            particlePositions[i * 3 + 1] = 12 + Math.random() * 3
            particlePositions[i * 3] = (Math.random() - 0.5) * MAP
            particlePositions[i * 3 + 2] = (Math.random() - 0.5) * MAP
          }
        }
        ;(particleSystem.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
      }

      renderer.render(scene, camera)
    }
    animate()

    sceneRef.current = { renderer, scene, camera, animId }

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      domEl.removeEventListener("pointerdown", onPointerDown)
      domEl.removeEventListener("pointermove", onPointerMove)
      domEl.removeEventListener("pointerup", onPointerUp)
      domEl.removeEventListener("pointerleave", onPointerUp)
      domEl.removeEventListener("wheel", onWheel)
      domEl.removeEventListener("contextmenu", onContextMenu)
      domEl.removeEventListener("click", onClickForAgent)
      domEl.removeEventListener("mousemove", onHoverCheck)
      if (hoverTimeout) clearTimeout(hoverTimeout)
      // Dispose all geometries and materials
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material?.dispose()
        }
        if (obj instanceof THREE.InstancedMesh) {
          obj.geometry?.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material?.dispose()
        }
      })
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [map])

  return (
    <div className="relative flex-1 w-full h-full" style={{ minHeight: 400 }}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-20 glass-panel rounded-md px-3 py-2 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#3a5828" },
          { label: "Plains", color: "#5a7838" },
          { label: "Water", color: "#2a5878" },
          { label: "Mountain", color: "#787470" },
          { label: "Desert", color: "#a89058" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="font-mono text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="absolute bottom-3 right-28 z-20 glass-panel rounded-md px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => window.location.reload()}
      >
        Center Village
      </button>
    </div>
  )
}
