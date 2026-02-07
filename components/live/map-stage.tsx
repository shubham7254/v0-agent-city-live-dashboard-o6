"use client"

import { useRef, useMemo, useEffect, useCallback } from "react"
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
    case "morning": return { sun: 0.75, color: 0xffecd2, amb: 0.45, sky: 0x9cb8cf, fog: 0xc8d8e4, fogN: 20, fogF: 55, sh: 0.3 }
    case "day":     return { sun: 1.0, color: 0xfff5e8, amb: 0.55, sky: 0x8aaccc, fog: 0xb8ccd8, fogN: 25, fogF: 65, sh: 0.35 }
    case "evening": return { sun: 0.5, color: 0xe07848, amb: 0.35, sky: 0x2a2040, fog: 0x3a2840, fogN: 18, fogF: 50, sh: 0.2 }
    case "night":   return { sun: 0.15, color: 0x4466aa, amb: 0.25, sky: 0x0a1020, fog: 0x101828, fogN: 12, fogF: 45, sh: 0.1 }
  }
}

// Bay Area biome colors
const BIOME_C: Record<string, [number, number, number]> = {
  plains:   [0.32, 0.42, 0.22],
  forest:   [0.22, 0.35, 0.16],
  water:    [0.22, 0.38, 0.48],
  mountain: [0.42, 0.40, 0.38],
  desert:   [0.58, 0.50, 0.35],
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
}

export function MapStage({ map, agents, phase }: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    animId: number
    sunLight: THREE.DirectionalLight
    ambLight: THREE.AmbientLight
    hemiLight: THREE.HemisphereLight
    fog: THREE.Fog
    agentMeshes: Map<string, THREE.Group>
    carGroups: THREE.Group[]
    waterMeshes: THREE.Mesh[]
    nightLights: THREE.PointLight[]
    clock: THREE.Clock
    isDragging: boolean
    lastMouse: { x: number; y: number }
    isRightDrag: boolean
    spherical: THREE.Spherical
    target: THREE.Vector3
    orbitRadius: number
  } | null>(null)

  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const agentsRef = useRef(agents)
  agentsRef.current = agents

  // Build scene once
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // ─── RENDERER ───
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
    const orbitRadius = offset.length()

    // ─── LIGHTS ───
    const ambLight = new THREE.AmbientLight(0xc0c8d0, 0.55)
    scene.add(ambLight)

    const sunLight = new THREE.DirectionalLight(0xfff5e8, 1.0)
    sunLight.position.set(18, 30, 14)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(2048, 2048)
    sunLight.shadow.camera.far = 80
    sunLight.shadow.camera.left = -35
    sunLight.shadow.camera.right = 35
    sunLight.shadow.camera.top = 35
    sunLight.shadow.camera.bottom = -35
    sunLight.shadow.bias = -0.0004
    sunLight.shadow.normalBias = 0.02
    scene.add(sunLight)

    const fillLight = new THREE.DirectionalLight(0x88a8cc, 0.12)
    fillLight.position.set(-12, 8, -10)
    scene.add(fillLight)

    const hemiLight = new THREE.HemisphereLight(0xa8c0d8, 0x607040, 0.2)
    scene.add(hemiLight)

    // Moonlight (cool blue, from upper-right, always present but only visible at night)
    const moonLight = new THREE.DirectionalLight(0x6688cc, 0)
    moonLight.position.set(-10, 25, -8)
    scene.add(moonLight)

    // ─── BASE PLANE ───
    const basePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x4a6830, roughness: 0.95 })
    )
    basePlane.rotation.x = -Math.PI / 2
    basePlane.position.y = -0.2
    basePlane.receiveShadow = true
    scene.add(basePlane)

    // ─── TERRAIN ───
    const tileCount = MAP * MAP
    const tileGeo = new THREE.BoxGeometry(1, 0.12, 1)
    const tileMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
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
          ? [0.28 + rng * 0.02, 0.28 + rng * 0.02, 0.27 + rng * 0.02]
          : (BIOME_C[tile.biome] ?? BIOME_C.plains)
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

    // ─── ROADS (asphalt + sidewalks + crosswalk + centerline) ───
    const roadGroup = new THREE.Group()
    scene.add(roadGroup)
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.88 })
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 0.82 })
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe0ddd5, roughness: 0.7 })
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xd4c840, roughness: 0.6 })
    const roadGeo = new THREE.BoxGeometry(0.96, 0.05, 0.96)
    const sideGeo = new THREE.BoxGeometry(1, 0.06, 0.08)
    const stripeGeo = new THREE.BoxGeometry(0.06, 0.005, 0.22)
    const lineGeo = new THREE.BoxGeometry(0.015, 0.003, 0.3)

    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (!tile?.hasPath) continue
        const wx = x - HALF + 0.5
        const wz = y - HALF + 0.5
        const rh = hillH(wx, wz) * 0.1

        // Asphalt
        const road = new THREE.Mesh(roadGeo, roadMat)
        road.position.set(wx, rh + 0.01, wz)
        road.receiveShadow = true
        roadGroup.add(road)

        // Check neighbors
        const hasN = !!(map[y - 1]?.[x]?.hasPath)
        const hasS = !!(map[y + 1]?.[x]?.hasPath)
        const hasE = !!(map[y]?.[x + 1]?.hasPath)
        const hasW = !!(map[y]?.[x - 1]?.hasPath)

        // Sidewalks on non-connected edges
        if (!hasN) { const s = new THREE.Mesh(sideGeo, sidewalkMat); s.position.set(wx, rh + 0.03, wz - 0.46); s.castShadow = true; roadGroup.add(s) }
        if (!hasS) { const s = new THREE.Mesh(sideGeo, sidewalkMat); s.position.set(wx, rh + 0.03, wz + 0.46); s.castShadow = true; roadGroup.add(s) }
        if (!hasE) { const s = new THREE.Mesh(sideGeo, sidewalkMat); s.position.set(wx + 0.46, rh + 0.03, wz); s.rotation.y = Math.PI / 2; s.castShadow = true; roadGroup.add(s) }
        if (!hasW) { const s = new THREE.Mesh(sideGeo, sidewalkMat); s.position.set(wx - 0.46, rh + 0.03, wz); s.rotation.y = Math.PI / 2; s.castShadow = true; roadGroup.add(s) }

        // Crosswalk stripes at intersections
        const dirs = [hasN, hasS, hasE, hasW].filter(Boolean).length
        if (dirs >= 3) {
          for (let i = 0; i < 5; i++) {
            if (hasN) { const st = new THREE.Mesh(stripeGeo, stripeMat); st.position.set(wx - 0.35 + i * 0.18, rh + 0.025, wz - 0.35); roadGroup.add(st) }
            if (hasE) { const st = new THREE.Mesh(stripeGeo, stripeMat); st.position.set(wx + 0.35, rh + 0.025, wz - 0.35 + i * 0.18); st.rotation.y = Math.PI / 2; roadGroup.add(st) }
          }
        }

        // Center yellow line on straight roads
        const isNS = hasN && hasS && !hasE && !hasW
        const isEW = hasE && hasW && !hasN && !hasS
        if (isNS || isEW) {
          const ln = new THREE.Mesh(lineGeo, yellowMat)
          ln.position.set(wx, rh + 0.02, wz)
          if (isEW) ln.rotation.y = Math.PI / 2
          roadGroup.add(ln)
        }
      }
    }

    // ─── BUILDINGS ───
    const bldGroup = new THREE.Group()
    scene.add(bldGroup)
    const nightLights: THREE.PointLight[] = []
    const windowGlassMats: THREE.MeshStandardMaterial[] = []

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
        const found = new THREE.Mesh(
          new THREE.BoxGeometry(fx + 0.06, 0.03, fz + 0.06),
          new THREE.MeshStandardMaterial({ color: 0xb0aaa0, roughness: 0.9 })
        )
        found.position.y = 0.015
        found.receiveShadow = true
        grp.add(found)

        // Main walls
        const walls = new THREE.Mesh(
          new THREE.BoxGeometry(fx, h, fz),
          new THREE.MeshStandardMaterial({ color: cfg.wall, roughness: cfg.modern ? 0.5 : 0.78 })
        )
        walls.position.y = h / 2 + 0.03
        walls.castShadow = true
        walls.receiveShadow = true
        grp.add(walls)

        // Roof
        if (cfg.flat) {
          const roofM = new THREE.Mesh(
            new THREE.BoxGeometry(fx + 0.04, 0.04, fz + 0.04),
            new THREE.MeshStandardMaterial({ color: cfg.roof, roughness: 0.82 })
          )
          roofM.position.y = h + 0.05
          roofM.castShadow = true
          grp.add(roofM)

          // Solar panels on modern flat roofs
          if (cfg.modern && rng > 0.4) {
            for (let i = 0; i < 2; i++) {
              const sp = new THREE.Mesh(
                new THREE.BoxGeometry(fx * 0.32, 0.008, fz * 0.28),
                new THREE.MeshStandardMaterial({ color: 0x1a2444, roughness: 0.2, metalness: 0.6 })
              )
              sp.position.set((i - 0.5) * fx * 0.45, h + 0.08, 0)
              sp.rotation.x = -0.2
              grp.add(sp)
            }
          }
        } else if (h > 0.2) {
          // Gable roof
          const halfRoof = new THREE.BoxGeometry(fx + 0.04, 0.025, fz * 0.52)
          const roofMatL = new THREE.MeshStandardMaterial({ color: cfg.roof, roughness: 0.7 })
          const r1 = new THREE.Mesh(halfRoof, roofMatL)
          r1.position.set(0, h + 0.15, -fz * 0.22)
          r1.rotation.x = 0.45
          r1.castShadow = true
          grp.add(r1)
          const r2 = new THREE.Mesh(halfRoof, roofMatL)
          r2.position.set(0, h + 0.15, fz * 0.22)
          r2.rotation.x = -0.45
          r2.castShadow = true
          grp.add(r2)
          // Ridge
          const ridge = new THREE.Mesh(
            new THREE.BoxGeometry(fx + 0.05, 0.018, 0.018),
            new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.8 })
          )
          ridge.position.y = h + 0.23
          grp.add(ridge)
        }

        // Windows
        if (cfg.win && h > 0.6) {
          const nw = Math.max(1, Math.floor(fx / 0.2))
          const spacing = fx / (nw + 1)
          const winGeo = new THREE.BoxGeometry(0.08, 0.1, 0.008)
          const winFrameGeo = new THREE.BoxGeometry(0.095, 0.115, 0.004)
          const frameMat = new THREE.MeshStandardMaterial({ color: cfg.modern ? 0xe0dcd6 : 0xc8c2b8, roughness: 0.75 })
          const glassMat = new THREE.MeshStandardMaterial({ color: 0x6080a0, roughness: 0.08, metalness: 0.12, transparent: true, opacity: 0.65, emissive: 0xffcc44, emissiveIntensity: 0 })
          windowGlassMats.push(glassMat)
          for (let wi = 0; wi < nw; wi++) {
            const wxp = -fx / 2 + spacing * (wi + 1)
            const wyp = h * 0.55 + 0.03
            // Front
            const frame = new THREE.Mesh(winFrameGeo, frameMat)
            frame.position.set(wxp, wyp, fz / 2 + 0.005)
            grp.add(frame)
            const glass = new THREE.Mesh(winGeo, glassMat)
            glass.position.set(wxp, wyp, fz / 2 + 0.001)
            grp.add(glass)
            // Back
            const bk = new THREE.Mesh(winGeo, glassMat)
            bk.position.set(wxp, wyp, -fz / 2 - 0.001)
            grp.add(bk)
          }
        }

        // Door
        if (cfg.door && h > 0.4) {
          const doorM = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.2, 0.01),
            new THREE.MeshStandardMaterial({ color: cfg.modern ? 0x605850 : 0x3a2010, roughness: 0.8 })
          )
          doorM.position.set(rng > 0.5 ? 0.06 : -0.06, 0.13, fz / 2 + 0.001)
          grp.add(doorM)
        }

        // Night interior glow -- warm window light
        if (cfg.win && h > 0.6) {
          const pl = new THREE.PointLight(0xffcc55, 0, 4, 1.5)
          pl.position.set(0, h * 0.5, fz / 2 + 0.1)
          grp.add(pl)
          nightLights.push(pl)
          // Also add a back-facing glow
          const pl2 = new THREE.PointLight(0xffcc55, 0, 3, 1.5)
          pl2.position.set(0, h * 0.5, -fz / 2 - 0.1)
          grp.add(pl2)
          nightLights.push(pl2)
        }

        bldGroup.add(grp)
      }
    }

    // ─── TREES (eucalyptus/oak) ───
    const treeData: { x: number; z: number; rng: number; rng2: number }[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (tile?.biome === "forest" && !tile.building && !tile.hasPath) {
          const r = hash(x * 7, y * 13)
          if (r > 0.25) treeData.push({ x, z: y, rng: r, rng2: hash(x * 31, y * 47) })
        }
        if (tile?.hasPath) {
          const r = hash(x * 53, y * 67)
          if (r > 0.88) treeData.push({ x, z: y, rng: r, rng2: hash(x * 71, y * 83) })
        }
      }
    }
    if (treeData.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.018, 0.03, 0.5, 5)
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.92 })
      const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, treeData.length)
      trunkIM.castShadow = true

      const canopyGeo = new THREE.DodecahedronGeometry(0.5, 1)
      const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
      const canopyIM = new THREE.InstancedMesh(canopyGeo, canopyMat, treeData.length)
      canopyIM.castShadow = true
      canopyIM.receiveShadow = true

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

        c.setHSL(0.24 + t.rng * 0.08, 0.3 + t.rng2 * 0.15, 0.22 + t.rng * 0.08)
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

    // ─── WATER ───
    const waterMeshes: THREE.Mesh[] = []
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a5878, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.82 })
    const waterGeo = new THREE.BoxGeometry(1.01, 0.08, 1.01)
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (map[y]?.[x]?.biome === "water") {
          const wm = new THREE.Mesh(waterGeo, waterMat)
          wm.position.set(x - HALF + 0.5, -0.06, y - HALF + 0.5)
          wm.receiveShadow = true
          wm.userData = { ox: x, oz: y }
          scene.add(wm)
          waterMeshes.push(wm)
        }
      }
    }

    // ─── STREETLIGHTS ───
    const slGroup = new THREE.Group()
    scene.add(slGroup)
    const slLights: THREE.PointLight[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (map[y]?.[x]?.hasPath && hash(x * 41, y * 59) > 0.82) {
          const wx = x - HALF + 0.5 + 0.38
          const wz = y - HALF + 0.5
          const baseY = hillH(wx, wz) * 0.1
          const sg = new THREE.Group()
          sg.position.set(wx, baseY, wz)

          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.015, 0.8, 5),
            new THREE.MeshStandardMaterial({ color: 0x505558, metalness: 0.3, roughness: 0.5 })
          )
          pole.castShadow = true
          sg.add(pole)

          const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4),
            new THREE.MeshStandardMaterial({ color: 0x505558, metalness: 0.3, roughness: 0.5 })
          )
          arm.position.set(-0.06, 0.38, 0)
          arm.rotation.z = -0.4
          sg.add(arm)

          const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.02, 0.035),
            new THREE.MeshStandardMaterial({ color: 0xe0ddd5, roughness: 0.3 })
          )
          lamp.position.set(-0.1, 0.42, 0)
          sg.add(lamp)

          const pl = new THREE.PointLight(0xffd888, 0, 5, 1.5)
          pl.position.set(-0.1, 0.4, 0)
          sg.add(pl)
          slLights.push(pl)
          nightLights.push(pl)

          slGroup.add(sg)
        }
      }
    }

    // ─── PARKED CARS ───
    const carColors = [0x8a3020, 0x1a4a78, 0x2a6838, 0xe0d0b8, 0x484848, 0xb8a888, 0x6a2838]
    let parkedCount = 0
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (tile?.building && ["shop", "hospital", "college", "market", "inn"].includes(tile.building)) {
          const r = hash(x * 23, y * 41)
          if (r > 0.4 && parkedCount < 24) {
            const wx = x - HALF + 0.5 + (r - 0.5) * 0.3
            const wz = y - HALF + 0.5 + 0.55
            const baseY = hillH(wx, wz) * 0.1
            const cg = new THREE.Group()
            cg.position.set(wx, baseY + 0.06, wz)
            cg.rotation.y = r > 0.7 ? 0 : Math.PI / 2
            const body = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.09, 0.15),
              new THREE.MeshStandardMaterial({ color: carColors[Math.floor(r * carColors.length)], roughness: 0.35, metalness: 0.4 })
            )
            body.castShadow = true
            cg.add(body)
            const cabin = new THREE.Mesh(
              new THREE.BoxGeometry(0.16, 0.06, 0.12),
              new THREE.MeshStandardMaterial({ color: 0x6a8ca8, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.7 })
            )
            cabin.position.y = 0.065
            cabin.castShadow = true
            cg.add(cabin)
            scene.add(cg)
            parkedCount++
          }
        }
      }
    }

    // ─── MOVING CARS (road-constrained paths) ───
    const movingCarGroup: THREE.Group[] = []

    // Build adjacency list for road tiles
    const roadSet = new Set<string>()
    const roadList: { x: number; z: number }[] = []
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++)
        if (map[y]?.[x]?.hasPath) {
          roadSet.add(`${x},${y}`)
          roadList.push({ x, z: y })
        }

    function getRoadNeighbors(rx: number, rz: number): { x: number; z: number }[] {
      const nb: { x: number; z: number }[] = []
      if (roadSet.has(`${rx},${rz - 1}`)) nb.push({ x: rx, z: rz - 1 })
      if (roadSet.has(`${rx},${rz + 1}`)) nb.push({ x: rx, z: rz + 1 })
      if (roadSet.has(`${rx + 1},${rz}`)) nb.push({ x: rx + 1, z: rz })
      if (roadSet.has(`${rx - 1},${rz}`)) nb.push({ x: rx - 1, z: rz })
      return nb
    }

    // Build looping paths for each car by random-walking on the road graph
    function buildCarPath(startIdx: number, length: number): { x: number; z: number }[] {
      const start = roadList[startIdx % roadList.length]
      if (!start) return []
      const path = [start]
      let cur = start
      let prev = { x: -1, z: -1 }
      for (let step = 0; step < length; step++) {
        const nb = getRoadNeighbors(cur.x, cur.z).filter(n => !(n.x === prev.x && n.z === prev.z))
        if (nb.length === 0) break
        const rng = hash(startIdx * 71 + step * 13, step * 37 + startIdx * 53)
        const next = nb[Math.floor(rng * nb.length)]
        prev = cur
        cur = next
        path.push(cur)
      }
      return path
    }

    const numCars = Math.min(10, Math.floor(roadList.length / 8))
    const mvCarColors = [0x8a2e20, 0x1e4e7a, 0x1e6e38, 0xd8c0a0, 0x383838, 0xc02020, 0x1a7878, 0xf0e0c0, 0x2a2a2a, 0x884422]
    for (let i = 0; i < numCars; i++) {
      const pathLen = 30 + Math.floor(hash(i * 19, i * 41) * 40)
      const startIdx = Math.floor(hash(i * 29, i * 43) * roadList.length)
      const path = buildCarPath(startIdx, pathLen)
      if (path.length < 4) continue

      const cg = new THREE.Group()
      // Car body
      const bd = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.1, 0.16),
        new THREE.MeshStandardMaterial({ color: mvCarColors[i % mvCarColors.length], roughness: 0.3, metalness: 0.45 })
      )
      bd.castShadow = true
      cg.add(bd)
      // Cabin glass
      const cb = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.065, 0.13),
        new THREE.MeshStandardMaterial({ color: 0x6890b0, roughness: 0.08, metalness: 0.12, transparent: true, opacity: 0.7 })
      )
      cb.position.y = 0.075
      cb.castShadow = true
      cg.add(cb)
      // Headlights (emissive, visible at night)
      const hlGeo = new THREE.BoxGeometry(0.02, 0.025, 0.04)
      const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xffffaa, emissiveIntensity: 0.3 })
      windowGlassMats.push(hlMat) // Reuse the glow toggle for headlights too
      const hl1 = new THREE.Mesh(hlGeo, hlMat); hl1.position.set(0.17, -0.01, 0.05); cg.add(hl1)
      const hl2 = new THREE.Mesh(hlGeo, hlMat); hl2.position.set(0.17, -0.01, -0.05); cg.add(hl2)
      // Tail lights
      const tlMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.2 })
      const tl1 = new THREE.Mesh(hlGeo, tlMat); tl1.position.set(-0.17, -0.01, 0.05); cg.add(tl1)
      const tl2 = new THREE.Mesh(hlGeo, tlMat); tl2.position.set(-0.17, -0.01, -0.05); cg.add(tl2)

      cg.userData = { path, speed: 0.3 + hash(i * 17, i * 31) * 0.4, idx: i }
      scene.add(cg)
      movingCarGroup.push(cg)
    }

    // ─── AGENT MESHES ───
    const agentMeshes = new Map<string, THREE.Group>()
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe0c0a0, roughness: 0.6 })
    const capsuleGeo = new THREE.CapsuleGeometry(0.04, 0.08, 4, 8)
    const headGeo = new THREE.SphereGeometry(0.05, 8, 8)

    function getOrCreateAgent(agent: Agent): THREE.Group {
      let ag = agentMeshes.get(agent.id)
      if (ag) return ag
      ag = new THREE.Group()
      const body = new THREE.Mesh(capsuleGeo, bodyMat)
      body.castShadow = true
      ag.add(body)
      const head = new THREE.Mesh(headGeo, bodyMat)
      head.position.y = 0.1
      head.castShadow = true
      ag.add(head)
      scene.add(ag)
      agentMeshes.set(agent.id, ag)
      return ag
    }

    // ─── ORBIT CONTROLS (manual) ───
    let isDragging = false
    let isRightDrag = false
    let lastMouse = { x: 0, y: 0 }
    const sph = spherical

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true
      isRightDrag = e.button === 2
      lastMouse = { x: e.clientX, y: e.clientY }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return
      const dx = e.clientX - lastMouse.x
      const dy = e.clientY - lastMouse.y
      lastMouse = { x: e.clientX, y: e.clientY }

      if (isRightDrag) {
        // Rotate
        sph.theta -= dx * 0.005
        sph.phi -= dy * 0.005
        sph.phi = Math.max(0.3, Math.min(Math.PI / 2.5, sph.phi))
      } else {
        // Pan
        const panSpeed = 0.04 / (camera.zoom * 0.05)
        const right = new THREE.Vector3()
        const up = new THREE.Vector3(0, 1, 0)
        camera.getWorldDirection(new THREE.Vector3())
        right.crossVectors(camera.up, new THREE.Vector3().subVectors(camera.position, target).normalize()).normalize()
        const forward = new THREE.Vector3().crossVectors(right, up).normalize()
        target.addScaledVector(right, -dx * panSpeed)
        target.addScaledVector(forward, dy * panSpeed)
      }
      updateCamera()
    }
    const onPointerUp = () => { isDragging = false }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      camera.zoom = Math.max(3, Math.min(80, camera.zoom * factor))
      camera.updateProjectionMatrix()
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    function updateCamera() {
      const offset = new THREE.Vector3().setFromSpherical(sph)
      camera.position.copy(target).add(offset)
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

    // ─── RESIZE ───
    const onResize = () => {
      if (!el) return
      const w = el.clientWidth
      const h2 = el.clientHeight
      const a = w / h2
      camera.left = -frustum * a
      camera.right = frustum * a
      camera.top = frustum
      camera.bottom = -frustum
      camera.updateProjectionMatrix()
      renderer.setSize(w, h2)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(el)

    // ─── ANIMATION LOOP ───
    const clock = new THREE.Clock()
    let animId = 0
    function animate() {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      const ph = phaseRef.current
      const light = phaseLight(ph)
      const isNight = ph === "night" || ph === "evening"

      // Update lighting
      sunLight.intensity = light.sun
      sunLight.color.set(light.color)
      ambLight.intensity = light.amb
      hemiLight.intensity = ph === "night" ? 0.12 : 0.2
      hemiLight.color.set(ph === "night" ? 0x283858 : 0xa8c0d8)
      hemiLight.groundColor.set(ph === "night" ? 0x141c28 : 0x607040)

      // Moonlight -- bright blue fill at night, off during day
      moonLight.intensity = ph === "night" ? 0.4 : ph === "evening" ? 0.2 : 0
      fog.color.set(light.fog)
      fog.near = light.fogN
      fog.far = light.fogF
      scene.background = new THREE.Color(light.sky)

      // Boost exposure at night so things are visible
      renderer.toneMappingExposure = ph === "night" ? 1.6 : ph === "evening" ? 1.3 : 1.1

      // Night lights -- streetlights and building windows
      for (const nl of nightLights) {
        nl.intensity = isNight ? 4.0 : 0
      }
      // Window glass emissive glow at night
      for (const gm of windowGlassMats) {
        gm.emissiveIntensity = isNight ? 0.8 : ph === "evening" ? 0.4 : 0
        gm.opacity = isNight ? 0.9 : 0.65
      }

      // Animate water
      for (const wm of waterMeshes) {
        const ox = wm.userData.ox as number
        const oz = wm.userData.oz as number
        wm.position.y = -0.06 + Math.sin(t * 0.4 + ox * 0.25 + oz * 0.2) * 0.01
      }

      // Animate moving cars along road paths
      for (const cg of movingCarGroup) {
        const d = cg.userData as { path: { x: number; z: number }[]; speed: number; idx: number }
        const pathLen = d.path.length
        if (pathLen < 2) continue
        // Progress along path (ping-pong)
        const totalDist = pathLen - 1
        const ct = (t * d.speed + d.idx * 3.7) % (totalDist * 2)
        const progress = ct <= totalDist ? ct : totalDist * 2 - ct
        const segIdx = Math.min(Math.floor(progress), pathLen - 2)
        const frac = progress - segIdx
        const a = d.path[segIdx]
        const b = d.path[segIdx + 1]
        const wx = (a.x + (b.x - a.x) * frac) - HALF + 0.5
        const wz = (a.z + (b.z - a.z) * frac) - HALF + 0.5
        const rh = hillH(wx, wz) * 0.1
        cg.position.set(wx, rh + 0.08, wz)
        // Face direction of travel
        const dx = b.x - a.x
        const dz = b.z - a.z
        if (dx !== 0 || dz !== 0) {
          cg.rotation.y = Math.atan2(dx, dz)
        }
      }

      // Update agents
      const currentAgents = agentsRef.current
      const activeIds = new Set<string>()
      for (const agent of currentAgents) {
        activeIds.add(agent.id)
        const ag = getOrCreateAgent(agent)
        const isSleeping = agent.status === "sleeping"
        if (isSleeping && isNight) {
          ag.visible = false
          continue
        }
        ag.visible = true
        const wx = agent.position.x - HALF + 0.5
        const wz = agent.position.y - HALF + 0.5
        const baseY = hillH(wx, wz)
        const idxN = parseInt(agent.id.replace(/\D/g, ""), 10) || 0
        ag.position.set(wx, baseY + 0.12 + Math.abs(Math.sin(t * 3 + idxN * 1.1)) * 0.015, wz)
      }
      // Remove stale agents
      for (const [id, mesh] of agentMeshes) {
        if (!activeIds.has(id)) {
          scene.remove(mesh)
          agentMeshes.delete(id)
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    // Store ref
    sceneRef.current = {
      renderer, scene, camera, animId, sunLight, ambLight, hemiLight, fog,
      agentMeshes, carGroups: movingCarGroup, waterMeshes, nightLights,
      clock, isDragging: false, lastMouse: { x: 0, y: 0 }, isRightDrag: false,
      spherical: sph, target, orbitRadius
    }

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      domEl.removeEventListener("pointerdown", onPointerDown)
      domEl.removeEventListener("pointermove", onPointerMove)
      domEl.removeEventListener("pointerup", onPointerUp)
      domEl.removeEventListener("pointerleave", onPointerUp)
      domEl.removeEventListener("wheel", onWheel)
      domEl.removeEventListener("contextmenu", onContextMenu)
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
