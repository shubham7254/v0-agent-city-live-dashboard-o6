"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrthographicCamera, Environment, OrbitControls, ContactShadows } from "@react-three/drei"
import * as THREE from "three"
import type { Agent, MapTile, Phase, WorldMetrics, CameraMode } from "@/lib/types"

// ─── CONSTANTS ────────────────────────────────────
const MAP_SIZE = 60
const HALF = MAP_SIZE / 2

// ─── DETERMINISTIC HASH ───────────────────────────
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0
  h = ((h ^ (h >> 13)) * 1274126177) | 0
  return (h >>> 0) / 4294967296
}

// Low-frequency noise for rolling hills
function hillHeight(x: number, z: number): number {
  const s1 = Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.35
  const s2 = Math.sin(x * 0.15 + 2.7) * Math.cos(z * 0.12 + 1.3) * 0.15
  const s3 = Math.sin(x * 0.04 + 5.1) * Math.sin(z * 0.035 + 3.8) * 0.5
  return s1 + s2 + s3
}

// ─── PHASE LIGHTING (Bay Area feel) ───────────────
function getPhaseLight(phase: Phase) {
  switch (phase) {
    case "morning":
      return { sun: 0.75, color: "#ffecd2", ambient: 0.45, sky: "#9cb8cf", fog: "#c8d8e4", fogNear: 20, fogFar: 55, shadow: 0.3 }
    case "day":
      return { sun: 1.0, color: "#fff5e8", ambient: 0.55, sky: "#8aaccc", fog: "#b8ccd8", fogNear: 25, fogFar: 65, shadow: 0.35 }
    case "evening":
      return { sun: 0.45, color: "#e07848", ambient: 0.2, sky: "#2a1840", fog: "#3a2840", fogNear: 15, fogFar: 45, shadow: 0.15 }
    case "night":
      return { sun: 0.06, color: "#283848", ambient: 0.08, sky: "#060a10", fog: "#080c14", fogNear: 10, fogFar: 40, shadow: 0.05 }
  }
}

// Bay Area muted palette
const BIOME_COLORS: Record<string, [number, number, number]> = {
  plains: [0.32, 0.42, 0.22],   // sage/olive HSL-ish
  forest: [0.22, 0.35, 0.16],   // dark olive
  water: [0.22, 0.38, 0.48],    // cool bay blue
  mountain: [0.42, 0.40, 0.38], // warm gray rock
  desert: [0.58, 0.50, 0.35],   // golden California
}

// ═══════════════════════════════════════════════════
// TERRAIN (rolling hills with Bay Area palette)
// ═══════════════════════════════════════════════════
function Terrain({ map }: { map: MapTile[][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = useMemo(() => {
    let c = 0
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) if (map[y]?.[x]) c++
    return c
  }, [map])

  useEffect(() => {
    if (!meshRef.current) return
    const m = meshRef.current
    const dummy = new THREE.Object3D()
    const colors = new Float32Array(count * 3)
    const c = new THREE.Color()
    let idx = 0
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (!tile) continue
        const wx = x - HALF + 0.5
        const wz = y - HALF + 0.5
        const rng = hash(x * 11, y * 23)
        const rng2 = hash(x * 37, y * 53)
        // Rolling hills -- flatten under roads/buildings, depress water
        let h = 0
        if (tile.biome === "water") h = -0.12
        else if (tile.hasPath || tile.building) h = hillHeight(wx, wz) * 0.1 // flatten under structures
        else h = hillHeight(wx, wz)
        dummy.position.set(wx, h - 0.06, wz)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1.005, 0.12, 1.005)
        dummy.updateMatrix()
        m.setMatrixAt(idx, dummy.matrix)
        // Color
        const base = tile.hasPath
          ? [0.28 + rng * 0.02, 0.28 + rng * 0.02, 0.27 + rng * 0.02] // bluish asphalt
          : (BIOME_COLORS[tile.biome] ?? BIOME_COLORS.plains)
        c.setRGB(
          base[0] + (rng - 0.5) * 0.04,
          base[1] + (rng2 - 0.5) * 0.04,
          base[2] + (rng - 0.5) * 0.03,
          THREE.SRGBColorSpace
        )
        colors[idx * 3] = c.r
        colors[idx * 3 + 1] = c.g
        colors[idx * 3 + 2] = c.b
        idx++
      }
    }
    m.instanceMatrix.needsUpdate = true
    m.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3))
  }, [map, count])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} receiveShadow>
      <boxGeometry args={[1, 0.12, 1]} />
      <meshStandardMaterial vertexColors roughness={0.92} metalness={0.0} />
    </instancedMesh>
  )
}

// ═══════════════════════════════════════════════════
// ROADS (asphalt + sidewalks + crosswalk markings)
// ═══════════════════════════════════════════════════
function Roads({ map }: { map: MapTile[][] }) {
  const roadRef = useRef<THREE.InstancedMesh>(null)
  const sideRef = useRef<THREE.InstancedMesh>(null)

  const roadTiles = useMemo(() => {
    const tiles: { x: number; z: number; hasN: boolean; hasS: boolean; hasE: boolean; hasW: boolean; isIntersection: boolean }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.hasPath || tile?.building === "road") {
          const hasN = !!(map[y - 1]?.[x]?.hasPath || map[y - 1]?.[x]?.building === "road")
          const hasS = !!(map[y + 1]?.[x]?.hasPath || map[y + 1]?.[x]?.building === "road")
          const hasE = !!(map[y]?.[x + 1]?.hasPath || map[y]?.[x + 1]?.building === "road")
          const hasW = !!(map[y]?.[x - 1]?.hasPath || map[y]?.[x - 1]?.building === "road")
          const dirs = [hasN, hasS, hasE, hasW].filter(Boolean).length
          tiles.push({ x, z: y, hasN, hasS, hasE, hasW, isIntersection: dirs >= 3 })
        }
      }
    return tiles
  }, [map])

  const sidewalkData = useMemo(() => {
    const sides: { x: number; y: number; z: number; sx: number; sz: number }[] = []
    roadTiles.forEach((r) => {
      const wx = r.x - HALF + 0.5
      const wz = r.z - HALF + 0.5
      const rh = hillHeight(wx, wz) * 0.1
      // Add sidewalks on non-connected edges
      if (!r.hasN) sides.push({ x: wx, y: rh + 0.03, z: wz - 0.46, sx: 0.96, sz: 0.08 })
      if (!r.hasS) sides.push({ x: wx, y: rh + 0.03, z: wz + 0.46, sx: 0.96, sz: 0.08 })
      if (!r.hasE) sides.push({ x: wx + 0.46, y: rh + 0.03, z: wz, sx: 0.08, sz: 0.96 })
      if (!r.hasW) sides.push({ x: wx - 0.46, y: rh + 0.03, z: wz, sx: 0.08, sz: 0.96 })
    })
    return sides
  }, [roadTiles])

  const crosswalks = useMemo(() => {
    const marks: { x: number; y: number; z: number; rotY: number }[] = []
    roadTiles.forEach((r) => {
      const wx = r.x - HALF + 0.5
      const wz = r.z - HALF + 0.5
      const rh = hillHeight(wx, wz) * 0.1
      // Crosswalk stripes
      for (let i = 0; i < 5; i++) {
        if (r.hasN) marks.push({ x: wx - 0.35 + i * 0.18, y: rh + 0.025, z: wz - 0.35, rotY: 0 })
        if (r.hasE) marks.push({ x: wx + 0.35, y: rh + 0.025, z: wz - 0.35 + i * 0.18, rotY: Math.PI / 2 })
      }
    })
    return marks
  }, [roadTiles])

  useEffect(() => {
    if (!roadRef.current) return
    const dummy = new THREE.Object3D()
    roadTiles.forEach((r, i) => {
      const wx = r.x - HALF + 0.5
      const wz = r.z - HALF + 0.5
      const rh = hillHeight(wx, wz) * 0.1
      dummy.position.set(wx, rh + 0.01, wz)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      roadRef.current!.setMatrixAt(i, dummy.matrix)
    })
    roadRef.current.instanceMatrix.needsUpdate = true

    if (sideRef.current) {
      sidewalkData.forEach((s, i) => {
        dummy.position.set(s.x, s.y, s.z)
        dummy.scale.set(s.sx / 0.96, 1, s.sz / 0.96) // normalize
        dummy.updateMatrix()
        sideRef.current!.setMatrixAt(i, dummy.matrix)
      })
      sideRef.current.instanceMatrix.needsUpdate = true
    }
  }, [roadTiles, sidewalkData])

  if (roadTiles.length === 0) return null

  return (
    <>
      {/* Asphalt surface - darker bluish gray */}
      <instancedMesh ref={roadRef} args={[undefined, undefined, roadTiles.length]} receiveShadow>
        <boxGeometry args={[0.96, 0.05, 0.96]} />
        <meshStandardMaterial color="#3a3d42" roughness={0.88} metalness={0.01} />
      </instancedMesh>
      {/* Sidewalks - lighter concrete */}
      {sidewalkData.length > 0 && (
        <instancedMesh ref={sideRef} args={[undefined, undefined, sidewalkData.length]} receiveShadow castShadow>
          <boxGeometry args={[0.96, 0.06, 0.96]} />
          <meshStandardMaterial color="#b8b4aa" roughness={0.82} />
        </instancedMesh>
      )}
      {/* Crosswalk stripes */}
      {crosswalks.map((cw, i) => (
        <mesh key={`cw-${i}`} position={[cw.x, cw.y, cw.z]} rotation={[0, cw.rotY, 0]}>
          <boxGeometry args={[0.06, 0.005, 0.22]} />
          <meshStandardMaterial color="#e0ddd5" roughness={0.7} />
        </mesh>
      ))}
      {/* Center line markings on straight roads */}
      {roadTiles
        .filter((r) => (r.hasN && r.hasS && !r.hasE && !r.hasW) || (r.hasE && r.hasW && !r.hasN && !r.hasS))
        .map((r, i) => {
          const wx = r.x - HALF + 0.5
          const wz = r.z - HALF + 0.5
          const rh = hillHeight(wx, wz) * 0.1
          const isNS = r.hasN && r.hasS
          return (
            <mesh key={`cl-${i}`} position={[wx, rh + 0.02, wz]} rotation={[0, isNS ? 0 : Math.PI / 2, 0]}>
              <boxGeometry args={[0.015, 0.003, 0.3]} />
              <meshStandardMaterial color="#d4c840" roughness={0.6} />
            </mesh>
          )
        })}
    </>
  )
}

// ═══════════════════════════════════════════════════
// BUILDINGS (Bay Area modern: off-white/gray siding, slate roofs)
// ═══════════════════════════════════════════════════
interface BldCfg {
  wall: string; roof: string; trim: string
  h: number; fx: number; fz: number
  roofType: "gable" | "flat" | "pitched" | "none"
  windows: boolean; door: boolean; modern: boolean
}

const B: Record<string, BldCfg> = {
  house:      { wall: "#e8e2d8", roof: "#4a5058", trim: "#c8c2b8", h: 1.1, fx: 0.52, fz: 0.44, roofType: "gable", windows: true, door: true, modern: true },
  farm:       { wall: "#7a9838", roof: "#5a7828", trim: "#6a8830", h: 0.06, fx: 0.86, fz: 0.86, roofType: "none", windows: false, door: false, modern: false },
  council:    { wall: "#f0ece4", roof: "#3a4248", trim: "#d0ccc4", h: 2.2, fx: 0.76, fz: 0.66, roofType: "flat", windows: true, door: true, modern: true },
  watchtower: { wall: "#706860", roof: "#4a4440", trim: "#605850", h: 2.5, fx: 0.28, fz: 0.28, roofType: "flat", windows: true, door: false, modern: false },
  storehouse: { wall: "#d0c8b8", roof: "#585048", trim: "#b8b0a0", h: 1.3, fx: 0.64, fz: 0.48, roofType: "gable", windows: false, door: true, modern: false },
  well:       { wall: "#8a9090", roof: "#607080", trim: "#7a8080", h: 0.3, fx: 0.26, fz: 0.26, roofType: "none", windows: false, door: false, modern: false },
  wall:       { wall: "#686060", roof: "#585050", trim: "#585050", h: 1.0, fx: 0.88, fz: 0.2, roofType: "flat", windows: false, door: false, modern: false },
  shop:       { wall: "#f2ece2", roof: "#c06030", trim: "#d8d2c8", h: 1.3, fx: 0.52, fz: 0.46, roofType: "flat", windows: true, door: true, modern: true },
  market:     { wall: "#e8dcc8", roof: "#b04820", trim: "#d0c4b0", h: 0.85, fx: 0.68, fz: 0.56, roofType: "flat", windows: false, door: false, modern: false },
  hospital:   { wall: "#f5f2ee", roof: "#505860", trim: "#e0ddd8", h: 2.0, fx: 0.72, fz: 0.62, roofType: "flat", windows: true, door: true, modern: true },
  school:     { wall: "#e0d0b8", roof: "#4a3828", trim: "#c8b8a0", h: 1.5, fx: 0.66, fz: 0.54, roofType: "pitched", windows: true, door: true, modern: false },
  college:    { wall: "#d8d4cc", roof: "#3a4048", trim: "#c0bcb4", h: 2.4, fx: 0.78, fz: 0.68, roofType: "flat", windows: true, door: true, modern: true },
  inn:        { wall: "#c8a878", roof: "#3a3028", trim: "#b09868", h: 1.4, fx: 0.56, fz: 0.48, roofType: "gable", windows: true, door: true, modern: false },
  workshop:   { wall: "#686460", roof: "#3a3835", trim: "#585450", h: 1.5, fx: 0.58, fz: 0.48, roofType: "flat", windows: true, door: true, modern: false },
}

function BuildingMesh({ x, z, type, phase }: { x: number; z: number; type: string; phase: Phase }) {
  const cfg = B[type]
  if (!cfg) return null
  const rng = hash(x * 13 + 3, z * 7 + 11)
  const rng2 = hash(x * 37 + 1, z * 19 + 5)
  const h = cfg.h * (0.9 + rng * 0.2)
  const fx = cfg.fx * (0.94 + rng2 * 0.1)
  const fz = cfg.fz * (0.94 + rng * 0.1)
  const isNight = phase === "night" || phase === "evening"
  const wx = x - HALF + 0.5
  const wz = z - HALF + 0.5
  const baseY = hillHeight(wx, wz)

  return (
    <group position={[wx, baseY, wz]}>
      {/* Foundation slab */}
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[fx + 0.06, 0.03, fz + 0.06]} />
        <meshStandardMaterial color="#b0aaa0" roughness={0.9} />
      </mesh>

      {/* Main walls */}
      <mesh position={[0, h / 2 + 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[fx, h, fz]} />
        <meshStandardMaterial color={cfg.wall} roughness={cfg.modern ? 0.5 : 0.78} metalness={cfg.modern ? 0.02 : 0} />
      </mesh>

      {/* Trim band / cornice */}
      {cfg.h > 0.5 && (
        <mesh position={[0, h - 0.02 + 0.03, 0]}>
          <boxGeometry args={[fx + 0.02, 0.035, fz + 0.02]} />
          <meshStandardMaterial color={cfg.trim} roughness={0.75} />
        </mesh>
      )}

      {/* ── ROOFS ── */}
      {cfg.roofType === "gable" && (
        <group position={[0, h + 0.03, 0]}>
          <mesh position={[0, 0.12, -fz * 0.22]} rotation={[0.45, 0, 0]} castShadow>
            <boxGeometry args={[fx + 0.04, 0.025, fz * 0.52]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.12, fz * 0.22]} rotation={[-0.45, 0, 0]} castShadow>
            <boxGeometry args={[fx + 0.04, 0.025, fz * 0.52]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[fx + 0.05, 0.018, 0.018]} />
            <meshStandardMaterial color={cfg.trim} roughness={0.8} />
          </mesh>
        </group>
      )}

      {cfg.roofType === "pitched" && (
        <group position={[0, h + 0.03, 0]}>
          <mesh position={[0, 0.08, -fz * 0.18]} rotation={[0.35, 0, 0]} castShadow>
            <boxGeometry args={[fx + 0.04, 0.02, fz * 0.48]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.08, fz * 0.18]} rotation={[-0.35, 0, 0]} castShadow>
            <boxGeometry args={[fx + 0.04, 0.02, fz * 0.48]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.7} />
          </mesh>
        </group>
      )}

      {cfg.roofType === "flat" && (
        <mesh position={[0, h + 0.05, 0]} castShadow>
          <boxGeometry args={[fx + 0.04, 0.04, fz + 0.04]} />
          <meshStandardMaterial color={cfg.roof} roughness={0.82} />
        </mesh>
      )}

      {/* Solar panels on modern flat roofs */}
      {cfg.modern && cfg.roofType === "flat" && rng > 0.4 && (
        <group position={[0, h + 0.08, 0]}>
          {Array.from({ length: 2 }).map((_, i) => (
            <mesh key={`sp-${i}`} position={[(i - 0.5) * fx * 0.45, 0, 0]} rotation={[-0.2, 0, 0]}>
              <boxGeometry args={[fx * 0.32, 0.008, fz * 0.28]} />
              <meshStandardMaterial color="#1a2444" roughness={0.2} metalness={0.6} />
            </mesh>
          ))}
        </group>
      )}

      {/* Small deck/patio on houses */}
      {type === "house" && rng2 > 0.5 && (
        <mesh position={[fx * 0.3, 0.04, fz / 2 + 0.06]} castShadow>
          <boxGeometry args={[fx * 0.35, 0.02, 0.12]} />
          <meshStandardMaterial color="#8a7058" roughness={0.88} />
        </mesh>
      )}

      {/* ── WINDOWS ── */}
      {cfg.windows && h > 0.6 && (
        <>
          {Array.from({ length: Math.max(1, Math.floor(fx / 0.2)) }).map((_, wi) => {
            const nw = Math.floor(fx / 0.2)
            const spacing = fx / (nw + 1)
            const wxp = -fx / 2 + spacing * (wi + 1)
            const wyp = h * 0.55 + 0.03
            return (
              <group key={`fw${wi}`}>
                {/* Glass pane */}
                <mesh position={[wxp, wyp, fz / 2 + 0.001]}>
                  <boxGeometry args={[0.08, 0.1, 0.008]} />
                  <meshStandardMaterial
                    color={isNight ? "#ffc840" : "#6080a0"}
                    roughness={isNight ? 0.2 : 0.08}
                    metalness={isNight ? 0 : 0.12}
                    emissive={isNight ? "#ffa020" : "#000000"}
                    emissiveIntensity={isNight ? 0.7 : 0}
                    transparent={!isNight}
                    opacity={isNight ? 1 : 0.65}
                  />
                </mesh>
                {/* Window frame */}
                <mesh position={[wxp, wyp, fz / 2 + 0.005]}>
                  <boxGeometry args={[0.095, 0.115, 0.004]} />
                  <meshStandardMaterial color={cfg.modern ? "#e0dcd6" : cfg.trim} roughness={0.75} />
                </mesh>
              </group>
            )
          })}
          {/* Back windows */}
          {Array.from({ length: Math.max(1, Math.floor(fx / 0.24)) }).map((_, wi) => {
            const nw = Math.floor(fx / 0.24)
            const spacing = fx / (nw + 1)
            const wxp = -fx / 2 + spacing * (wi + 1)
            return (
              <mesh key={`bw${wi}`} position={[wxp, h * 0.55 + 0.03, -fz / 2 - 0.001]}>
                <boxGeometry args={[0.08, 0.1, 0.008]} />
                <meshStandardMaterial
                  color={isNight ? "#ffc840" : "#5878a0"}
                  emissive={isNight ? "#ffa020" : "#000"}
                  emissiveIntensity={isNight ? 0.5 : 0}
                  roughness={0.15}
                  transparent={!isNight}
                  opacity={isNight ? 1 : 0.6}
                />
              </mesh>
            )
          })}
        </>
      )}

      {/* ── DOOR ── */}
      {cfg.door && h > 0.4 && (
        <group position={[rng > 0.5 ? 0.06 : -0.06, 0.16, fz / 2 + 0.001]}>
          <mesh>
            <boxGeometry args={[0.1, 0.2, 0.01]} />
            <meshStandardMaterial color={cfg.modern ? "#605850" : "#3a2010"} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, -0.002]}>
            <boxGeometry args={[0.115, 0.215, 0.004]} />
            <meshStandardMaterial color={cfg.trim} roughness={0.75} />
          </mesh>
        </group>
      )}

      {/* ── SPECIAL DETAILS ── */}

      {/* Farm crop rows */}
      {type === "farm" && (
        <>
          {Array.from({ length: 5 }).map((_, i) => (
            <mesh key={`cr${i}`} position={[-fx / 2 + 0.1 + (i * fx) / 5, 0.05, 0]} castShadow>
              <boxGeometry args={[0.04, 0.04, fz * 0.8]} />
              <meshStandardMaterial color={`hsl(${95 + rng * 20}, 40%, ${25 + rng * 8}%)`} roughness={0.9} />
            </mesh>
          ))}
        </>
      )}

      {/* Hospital red cross */}
      {type === "hospital" && (
        <group position={[0, h + 0.1, fz / 2 + 0.008]}>
          <mesh><boxGeometry args={[0.04, 0.15, 0.008]} /><meshBasicMaterial color="#c02820" /></mesh>
          <mesh><boxGeometry args={[0.15, 0.04, 0.008]} /><meshBasicMaterial color="#c02820" /></mesh>
        </group>
      )}

      {/* School bell tower */}
      {type === "school" && (
        <group position={[0, h + 0.03, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.08, 0.3, 0.08]} />
            <meshStandardMaterial color="#8a7050" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <coneGeometry args={[0.06, 0.08, 4]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* Workshop chimney */}
      {type === "workshop" && (
        <mesh position={[fx / 2 - 0.08, h / 2 + 0.25, fz / 2 - 0.06]} castShadow>
          <boxGeometry args={[0.08, 0.5, 0.08]} />
          <meshStandardMaterial color="#484440" roughness={0.88} />
        </mesh>
      )}

      {/* Market stall poles */}
      {type === "market" && (
        <>
          {([[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]).map(([sx, sz], i) => (
            <mesh key={`mp${i}`} position={[sx * fx * 0.38, h * 0.5, sz * fz * 0.38]} castShadow>
              <cylinderGeometry args={[0.015, 0.015, h, 6]} />
              <meshStandardMaterial color="#5a4a3a" roughness={0.85} />
            </mesh>
          ))}
          <mesh position={[0, h + 0.04, 0]} castShadow>
            <boxGeometry args={[fx + 0.08, 0.02, fz + 0.08]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.7} />
          </mesh>
        </>
      )}

      {/* Night glow */}
      {isNight && cfg.windows && h > 0.6 && (
        <pointLight position={[0, h * 0.4, 0]} color="#ffc844" intensity={0.6} distance={2} decay={2} />
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════
// TREES - eucalyptus/oak style (tall trunk, irregular canopy)
// ═══════════════════════════════════════════════════
function Trees({ map }: { map: MapTile[][] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const canopyRef = useRef<THREE.InstancedMesh>(null)

  const treeData = useMemo(() => {
    const data: { x: number; z: number; rng: number; rng2: number }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.biome === "forest" && !tile.building && !tile.hasPath) {
          const r = hash(x * 7, y * 13)
          if (r > 0.25) data.push({ x, z: y, rng: r, rng2: hash(x * 31, y * 47) })
        }
        // Street trees along roads
        if (tile?.hasPath) {
          const r = hash(x * 53, y * 67)
          if (r > 0.88) data.push({ x, z: y, rng: r, rng2: hash(x * 71, y * 83) })
        }
      }
    return data
  }, [map])

  useEffect(() => {
    if (!trunkRef.current || !canopyRef.current) return
    const dummy = new THREE.Object3D()
    const canopyColors = new Float32Array(treeData.length * 3)
    const c = new THREE.Color()

    treeData.forEach((t, i) => {
      const wx = t.x - HALF + 0.5 + (t.rng - 0.5) * 0.2
      const wz = t.z - HALF + 0.5 + (t.rng2 - 0.5) * 0.2
      const baseY = hillHeight(wx, wz)
      const trunkH = 0.3 + t.rng * 0.35 // Taller trunks (eucalyptus-like)
      const canopyW = 0.18 + t.rng2 * 0.15

      // Trunk - taller, slimmer, slight lean
      dummy.position.set(wx, baseY + trunkH / 2, wz)
      dummy.rotation.set(0, t.rng * Math.PI * 2, (t.rng2 - 0.5) * 0.12)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      trunkRef.current!.setMatrixAt(i, dummy.matrix)

      // Canopy - irregularly shaped, positioned at top of trunk
      dummy.position.set(wx + (t.rng - 0.5) * 0.06, baseY + trunkH + canopyW * 0.4, wz + (t.rng2 - 0.5) * 0.06)
      const sx = canopyW * (1.4 + t.rng * 0.8)
      const sy = canopyW * (0.8 + t.rng2 * 0.6)
      const sz = canopyW * (1.4 + t.rng2 * 0.8)
      dummy.rotation.set(0, t.rng * Math.PI, 0)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      canopyRef.current!.setMatrixAt(i, dummy.matrix)

      // Muted Bay Area greens (sage/olive, not neon)
      c.setHSL(0.24 + t.rng * 0.08, 0.3 + t.rng2 * 0.15, 0.22 + t.rng * 0.08)
      canopyColors[i * 3] = c.r
      canopyColors[i * 3 + 1] = c.g
      canopyColors[i * 3 + 2] = c.b
    })

    trunkRef.current.instanceMatrix.needsUpdate = true
    canopyRef.current.instanceMatrix.needsUpdate = true
    canopyRef.current.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(canopyColors, 3))
  }, [treeData])

  if (treeData.length === 0) return null
  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, treeData.length]} castShadow>
        <cylinderGeometry args={[0.018, 0.03, 0.5, 5]} />
        <meshStandardMaterial color="#5a4028" roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, treeData.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial vertexColors roughness={0.85} />
      </instancedMesh>
    </>
  )
}

// ═══════════════════════════════════════════════════
// WATER (cool bay/creek, reflective, animated)
// ═══════════════════════════════════════════════════
function Water({ map }: { map: MapTile[][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const waterTiles = useMemo(() => {
    const tiles: { x: number; z: number }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++)
        if (map[y]?.[x]?.biome === "water") tiles.push({ x, z: y })
    return tiles
  }, [map])

  useEffect(() => {
    if (!meshRef.current) return
    const dummy = new THREE.Object3D()
    waterTiles.forEach((w, i) => {
      dummy.position.set(w.x - HALF + 0.5, -0.06, w.z - HALF + 0.5)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [waterTiles])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const dummy = new THREE.Object3D()
    const t = clock.getElapsedTime()
    waterTiles.forEach((w, i) => {
      const wave = Math.sin(t * 0.4 + w.x * 0.25 + w.z * 0.2) * 0.01
      dummy.position.set(w.x - HALF + 0.5, -0.06 + wave, w.z - HALF + 0.5)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  if (waterTiles.length === 0) return null
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, waterTiles.length]} receiveShadow>
      <boxGeometry args={[1.01, 0.08, 1.01]} />
      <meshStandardMaterial color="#2a5878" roughness={0.05} metalness={0.4} transparent opacity={0.82} />
    </instancedMesh>
  )
}

// ═══════════════════════════════════════════════════
// STREET FURNITURE (streetlights, signs, parked cars)
// ═══════════════════════════════════════════════════
function StreetLights({ map, phase }: { map: MapTile[][]; phase: Phase }) {
  const isNight = phase === "night" || phase === "evening"
  const lights = useMemo(() => {
    const list: { x: number; z: number; rng: number }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.hasPath) {
          const r = hash(x * 41, y * 59)
          if (r > 0.82) list.push({ x, z: y, rng: r })
        }
      }
    return list
  }, [map])

  return (
    <>
      {lights.map((l, i) => {
        const wx = l.x - HALF + 0.5 + 0.38
        const wz = l.z - HALF + 0.5
        const baseY = hillHeight(wx, wz) * 0.1
        return (
          <group key={`sl-${i}`} position={[wx, baseY, wz]}>
            {/* Pole */}
            <mesh castShadow>
              <cylinderGeometry args={[0.012, 0.015, 0.8, 5]} />
              <meshStandardMaterial color="#505558" metalness={0.3} roughness={0.5} />
            </mesh>
            {/* Arm */}
            <mesh position={[-0.06, 0.38, 0]} rotation={[0, 0, -0.4]}>
              <cylinderGeometry args={[0.008, 0.008, 0.12, 4]} />
              <meshStandardMaterial color="#505558" metalness={0.3} roughness={0.5} />
            </mesh>
            {/* Lamp head */}
            <mesh position={[-0.1, 0.42, 0]}>
              <boxGeometry args={[0.06, 0.02, 0.035]} />
              <meshStandardMaterial
                color={isNight ? "#ffeecc" : "#e0ddd5"}
                emissive={isNight ? "#ffcc66" : "#000000"}
                emissiveIntensity={isNight ? 1.2 : 0}
                roughness={0.3}
              />
            </mesh>
            {isNight && (
              <pointLight position={[-0.1, 0.4, 0]} color="#ffd888" intensity={1.5} distance={3} decay={2} />
            )}
          </group>
        )
      })}
    </>
  )
}

// Parked cars near commercial buildings
function ParkedCars({ map }: { map: MapTile[][] }) {
  const parked = useMemo(() => {
    const list: { x: number; z: number; rot: number; color: string }[] = []
    const carColors = ["#8a3020", "#1a4a78", "#2a6838", "#e0d0b8", "#484848", "#b8a888", "#6a2838"]
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.building && ["shop", "hospital", "college", "market", "inn"].includes(tile.building)) {
          const r = hash(x * 23, y * 41)
          if (r > 0.4) {
            list.push({
              x: x - HALF + 0.5 + (r - 0.5) * 0.3,
              z: y - HALF + 0.5 + 0.55,
              rot: r > 0.7 ? 0 : Math.PI / 2,
              color: carColors[Math.floor(r * carColors.length)],
            })
          }
        }
      }
    return list.slice(0, 24)
  }, [map])

  return (
    <>
      {parked.map((p, i) => {
        const baseY = hillHeight(p.x, p.z) * 0.1
        return (
          <group key={`pc-${i}`} position={[p.x, baseY + 0.06, p.z]} rotation={[0, p.rot, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.3, 0.09, 0.15]} />
              <meshStandardMaterial color={p.color} roughness={0.35} metalness={0.4} />
            </mesh>
            <mesh position={[0.01, 0.065, 0]} castShadow>
              <boxGeometry args={[0.16, 0.06, 0.12]} />
              <meshStandardMaterial color="#6a8ca8" roughness={0.1} metalness={0.15} transparent opacity={0.7} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════
// PEOPLE (NPCs walking on sidewalks)
// ═══════════════════════════════════════════════════
function PersonMesh({ agent, phase }: { agent: Agent; phase: Phase }) {
  const groupRef = useRef<THREE.Group>(null)
  const isSleeping = agent.status === "sleeping"
  const isChild = agent.ageGroup === "child"
  const bodyH = isChild ? 0.12 : agent.ageGroup === "teen" ? 0.18 : 0.22
  const headR = isChild ? 0.04 : 0.05

  const color = useMemo(() => {
    if (isSleeping) return "#404850"
    if (isChild) return "#e0a840"
    if (agent.ageGroup === "teen") return "#4888b8"
    if (agent.ageGroup === "elder") return "#8a6890"
    if (["Doctor", "Nurse", "Healer"].includes(agent.archetype)) return "#e8e4e0" // white coat
    if (["Guard", "Scout", "Warrior"].includes(agent.archetype)) return "#5a6840"
    if (["Farmer", "Fisher", "Hunter"].includes(agent.archetype)) return "#6a8838"
    if (["Teacher", "Professor"].includes(agent.archetype)) return "#385878"
    if (["Shopkeeper", "Merchant", "Baker"].includes(agent.archetype)) return "#a06030"
    if (["Builder", "Blacksmith", "Carpenter", "Mason"].includes(agent.archetype)) return "#887050"
    return "#606870"
  }, [agent.archetype, agent.ageGroup, isSleeping, isChild])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    if (isSleeping && (phase === "night" || phase === "evening")) {
      groupRef.current.visible = false
      return
    }
    groupRef.current.visible = true
    const t = clock.getElapsedTime()
    const idx = parseInt(agent.id.replace(/\D/g, ""), 10) || 0
    const wx = agent.position.x - HALF + 0.5
    const wz = agent.position.y - HALF + 0.5
    const baseY = hillHeight(wx, wz)
    groupRef.current.position.y = baseY + bodyH / 2 + Math.abs(Math.sin(t * 3 + idx * 1.1)) * 0.015
    groupRef.current.rotation.z = Math.sin(t * 2 + idx) * 0.02
  })

  const wx = agent.position.x - HALF + 0.5
  const wz = agent.position.y - HALF + 0.5
  const baseY = hillHeight(wx, wz)

  return (
    <group ref={groupRef} position={[wx, baseY + bodyH / 2, wz]}>
      <mesh castShadow>
        <capsuleGeometry args={[bodyH * 0.22, bodyH * 0.4, 4, 8]} />
        <meshStandardMaterial color="#e0c0a0" roughness={0.6} />
      </mesh>
      <mesh position={[0, bodyH * 0.48, 0]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#e0c0a0" roughness={0.65} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════
// MOVING CARS
// ═══════════════════════════════════════════════════
function MovingCar({ startX, startZ, direction, index }: { startX: number; startZ: number; direction: "h" | "v"; index: number }) {
  const meshRef = useRef<THREE.Group>(null)
  const color = useMemo(() => {
    const colors = ["#8a2e20", "#1e4e7a", "#1e6e38", "#d8c0a0", "#383838", "#c02020", "#1a7878"]
    return colors[index % colors.length]
  }, [index])
  const speed = useMemo(() => 0.4 + hash(index * 17, index * 31) * 0.5, [index])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime() * speed + index * 5.3
    const range = 8
    const offset = ((t % (range * 2)) - range)
    const wx = direction === "h" ? startX - HALF + offset : startX - HALF + 0.5
    const wz = direction === "v" ? startZ - HALF + offset : startZ - HALF + 0.5
    const baseY = hillHeight(wx, wz) * 0.1
    meshRef.current.position.set(wx, baseY + 0.08, wz)
    meshRef.current.rotation.y = direction === "h" ? (offset > 0 ? 0 : Math.PI) : (offset > 0 ? Math.PI / 2 : -Math.PI / 2)
  })

  return (
    <group ref={meshRef} position={[startX - HALF, 0.08, startZ - HALF]}>
      <mesh castShadow>
        <boxGeometry args={[0.32, 0.1, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.45} />
      </mesh>
      <mesh castShadow position={[0.01, 0.075, 0]}>
        <boxGeometry args={[0.16, 0.065, 0.13]} />
        <meshStandardMaterial color="#6890b0" roughness={0.08} metalness={0.12} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════
// SCENE CONTENT
// ═══════════════════════════════════════════════════
function SceneContent({ map, agents, phase }: { map: MapTile[][]; agents: Agent[]; phase: Phase }) {
  const light = getPhaseLight(phase)

  const buildings = useMemo(() => {
    const list: { x: number; z: number; type: string }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.building && tile.building !== "road") list.push({ x, z: y, type: tile.building })
      }
    return list
  }, [map])

  const cars = useMemo(() => {
    const roadTiles: { x: number; z: number }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.hasPath) roadTiles.push({ x, z: y })
      }
    const carList: { x: number; z: number; dir: "h" | "v"; idx: number }[] = []
    for (let i = 0; i < Math.min(12, Math.floor(roadTiles.length / 6)); i++) {
      const rt = roadTiles[Math.floor(hash(i * 29, i * 43) * roadTiles.length)]
      if (rt) carList.push({ x: rt.x, z: rt.z, dir: i % 2 === 0 ? "h" : "v", idx: i })
    }
    return carList
  }, [map])

  return (
    <>
      {/* ── LIGHTING ── */}
      {/* Cool sky ambient (Bay Area overcast fill) */}
      <ambientLight intensity={light.ambient} color="#c0c8d0" />
      {/* Soft warm sun */}
      <directionalLight
        position={[18, 30, 14]}
        intensity={light.sun}
        color={light.color}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* Cool fill from sky */}
      <directionalLight position={[-12, 8, -10]} intensity={light.sun * 0.12} color="#88a8cc" />
      <hemisphereLight
        intensity={phase === "night" ? 0.06 : 0.2}
        color={phase === "night" ? "#182838" : "#a8c0d8"}
        groundColor={phase === "night" ? "#0a0e14" : "#607040"}
      />

      {/* Environment for PBR reflections */}
      <Environment
        preset={phase === "night" ? "night" : phase === "evening" ? "sunset" : "dawn"}
        background={false}
      />

      {/* Atmospheric depth fog (coastal haze) */}
      <fog attach="fog" args={[light.fog, light.fogNear, light.fogFar]} />

      {/* ── GROUND ── */}
      {/* Infinite base plane (distant green) */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#4a6830" roughness={0.95} />
      </mesh>

      {/* Contact shadows for soft AO under objects */}
      <ContactShadows
        position={[0, 0.005, 0]}
        opacity={light.shadow}
        scale={80}
        blur={2.5}
        far={5}
        resolution={512}
        color="#1a2810"
      />

      <Terrain map={map} />
      <Water map={map} />
      <Roads map={map} />
      <Trees map={map} />
      <StreetLights map={map} phase={phase} />
      <ParkedCars map={map} />

      {buildings.map((b) => (
        <BuildingMesh key={`b-${b.x}-${b.z}`} x={b.x} z={b.z} type={b.type} phase={phase} />
      ))}

      {cars.map((car) => (
        <MovingCar key={`car-${car.idx}`} startX={car.x} startZ={car.z} direction={car.dir} index={car.idx} />
      ))}

      {agents.map((agent) => (
        <PersonMesh key={agent.id} agent={agent} phase={phase} />
      ))}
    </>
  )
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
  return (
    <div className="relative flex-1 w-full h-full" style={{ minHeight: 400 }}>
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%" }}
      >
        <OrthographicCamera
          makeDefault
          position={[20, 24, 20]}
          zoom={22}
          near={0.1}
          far={300}
        />
        <OrbitControls
          target={[0, 0, 0]}
          enableRotate
          enablePan
          enableZoom
          minZoom={6}
          maxZoom={80}
          maxPolarAngle={Math.PI / 2.5}
          minPolarAngle={Math.PI / 8}
          panSpeed={1.2}
          zoomSpeed={1.2}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
          touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        />
        <SceneContent map={map} agents={agents} phase={phase} />
      </Canvas>

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
