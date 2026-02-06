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

// ─── PHASE LIGHTING ───────────────────────────────
function getPhaseLight(phase: Phase) {
  switch (phase) {
    case "morning":
      return { sun: 0.9, color: "#ffe0b2", ambient: 0.5, sky: "#87ceeb", fog: "#d4e6f0", shadow: 0.25 }
    case "day":
      return { sun: 1.1, color: "#fff8ec", ambient: 0.6, sky: "#6eb5e7", fog: "#b4d4e8", shadow: 0.3 }
    case "evening":
      return { sun: 0.5, color: "#ff7043", ambient: 0.22, sky: "#2c1654", fog: "#3a2a48", shadow: 0.15 }
    case "night":
      return { sun: 0.08, color: "#334466", ambient: 0.1, sky: "#060a14", fog: "#0c1020", shadow: 0.05 }
  }
}

// ─── BIOME COLORS ─────────────────────────────────
const BIOME_BASE: Record<string, string> = {
  plains: "#6a9c42",
  forest: "#3a6e22",
  water: "#2882aa",
  mountain: "#8a8a7e",
  desert: "#d0b868",
}

// ═══════════════════════════════════════════════════
// GROUND PLANE (instanced with subtle height variation)
// ═══════════════════════════════════════════════════
function GroundPlane({ map }: { map: MapTile[][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const count = useMemo(() => {
    let c = 0
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) if (map[y]?.[x]) c++
    return c
  }, [map])

  useEffect(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current
    const dummy = new THREE.Object3D()
    const colors = new Float32Array(count * 3)
    const color = new THREE.Color()
    let idx = 0

    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (!tile) continue

        const rng = hash(x * 11, y * 23)
        const rng2 = hash(x * 37, y * 53)

        // Subtle height variation for non-water non-road tiles
        let tileY = 0
        if (tile.biome === "water") tileY = -0.06
        else if (tile.biome === "mountain") tileY = rng * 0.15
        else if (!tile.hasPath && !tile.building) tileY = rng2 * 0.02

        dummy.position.set(x - HALF + 0.5, tileY - 0.05, y - HALF + 0.5)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1.01, 0.1, 1.01) // Slight overlap to hide seams; box height gives 3D feel
        dummy.updateMatrix()
        mesh.setMatrixAt(idx, dummy.matrix)

        const base = tile.hasPath ? "#5c5a55" : (BIOME_BASE[tile.biome] ?? "#6a9c42")
        color.set(base)
        // Per-tile color jitter for natural look
        color.offsetHSL((rng - 0.5) * 0.03, (rng2 - 0.5) * 0.06, (rng - 0.5) * 0.06)
        colors[idx * 3] = color.r
        colors[idx * 3 + 1] = color.g
        colors[idx * 3 + 2] = color.b
        idx++
      }
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3))
  }, [map, count])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} receiveShadow>
      <boxGeometry args={[1, 0.1, 1]} />
      <meshStandardMaterial vertexColors roughness={0.92} />
    </instancedMesh>
  )
}

// ═══════════════════════════════════════════════════
// ROADS (raised slightly, with curbs and markings)
// ═══════════════════════════════════════════════════
function Roads({ map }: { map: MapTile[][] }) {
  const roadRef = useRef<THREE.InstancedMesh>(null)
  const curbRef = useRef<THREE.InstancedMesh>(null)

  const roadTiles = useMemo(() => {
    const tiles: { x: number; z: number; hasN: boolean; hasS: boolean; hasE: boolean; hasW: boolean }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.hasPath || tile?.building === "road") {
          const hasN = !!(map[y - 1]?.[x]?.hasPath || map[y - 1]?.[x]?.building === "road")
          const hasS = !!(map[y + 1]?.[x]?.hasPath || map[y + 1]?.[x]?.building === "road")
          const hasE = !!(map[y]?.[x + 1]?.hasPath || map[y]?.[x + 1]?.building === "road")
          const hasW = !!(map[y]?.[x - 1]?.hasPath || map[y]?.[x - 1]?.building === "road")
          tiles.push({ x, z: y, hasN, hasS, hasE, hasW })
        }
      }
    return tiles
  }, [map])

  useEffect(() => {
    if (!roadRef.current) return
    const dummy = new THREE.Object3D()

    roadTiles.forEach((r, i) => {
      dummy.position.set(r.x - HALF + 0.5, 0.02, r.z - HALF + 0.5)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      roadRef.current!.setMatrixAt(i, dummy.matrix)
    })
    roadRef.current.instanceMatrix.needsUpdate = true

    // Curb stones along road edges
    if (curbRef.current) {
      let ci = 0
      roadTiles.forEach((r) => {
        const curbs: [number, number, number, number][] = []
        if (!r.hasN) curbs.push([r.x - HALF + 0.5, 0.04, r.z - HALF + 0.02, 0])
        if (!r.hasS) curbs.push([r.x - HALF + 0.5, 0.04, r.z - HALF + 0.98, 0])
        if (!r.hasE) curbs.push([r.x - HALF + 0.98, 0.04, r.z - HALF + 0.5, Math.PI / 2])
        if (!r.hasW) curbs.push([r.x - HALF + 0.02, 0.04, r.z - HALF + 0.5, Math.PI / 2])
        curbs.forEach(([cx, cy, cz, rot]) => {
          if (ci >= curbCount) return
          dummy.position.set(cx, cy, cz)
          dummy.rotation.set(0, rot, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          curbRef.current!.setMatrixAt(ci, dummy.matrix)
          ci++
        })
      })
      curbRef.current.instanceMatrix.needsUpdate = true
    }
  }, [roadTiles])

  const curbCount = useMemo(() => roadTiles.length * 4, [roadTiles])

  if (roadTiles.length === 0) return null

  return (
    <>
      {/* Road surface - dark asphalt colored box */}
      <instancedMesh ref={roadRef} args={[undefined, undefined, roadTiles.length]} receiveShadow>
        <boxGeometry args={[0.98, 0.06, 0.98]} />
        <meshStandardMaterial color="#484848" roughness={0.82} metalness={0.02} />
      </instancedMesh>
      {/* Curb stones */}
      <instancedMesh ref={curbRef} args={[undefined, undefined, curbCount]}>
        <boxGeometry args={[0.98, 0.04, 0.04]} />
        <meshStandardMaterial color="#999" roughness={0.7} />
      </instancedMesh>
    </>
  )
}

// ═══════════════════════════════════════════════════
// BUILDING MESH - detailed with windows, doors, trim
// ═══════════════════════════════════════════════════
interface BldCfg {
  wall: string; roof: string; trim: string
  h: number; fx: number; fz: number
  roofType: "gable" | "flat" | "dome" | "hip" | "none"
  windows: boolean; door: boolean
}

const B: Record<string, BldCfg> = {
  house:      { wall: "#d4b896", roof: "#8b4513", trim: "#b09070", h: 1.2, fx: 0.58, fz: 0.5, roofType: "gable", windows: true, door: true },
  farm:       { wall: "#6a9a28", roof: "#5a8822", trim: "#5a7a22", h: 0.08, fx: 0.88, fz: 0.88, roofType: "none", windows: false, door: false },
  council:    { wall: "#e8e0d0", roof: "#506850", trim: "#c8c0b0", h: 2.0, fx: 0.78, fz: 0.68, roofType: "dome", windows: true, door: true },
  watchtower: { wall: "#786e64", roof: "#5a524a", trim: "#6a6258", h: 2.8, fx: 0.32, fz: 0.32, roofType: "flat", windows: true, door: false },
  storehouse: { wall: "#8a6540", roof: "#5a3518", trim: "#7a5530", h: 1.4, fx: 0.7, fz: 0.52, roofType: "gable", windows: false, door: true },
  well:       { wall: "#7a8a8a", roof: "#5580a0", trim: "#6a7a7a", h: 0.35, fx: 0.3, fz: 0.3, roofType: "none", windows: false, door: false },
  wall:       { wall: "#706358", roof: "#605548", trim: "#606058", h: 1.2, fx: 0.9, fz: 0.22, roofType: "flat", windows: false, door: false },
  shop:       { wall: "#ecd8a8", roof: "#b85c38", trim: "#d4c090", h: 1.5, fx: 0.58, fz: 0.52, roofType: "gable", windows: true, door: true },
  market:     { wall: "#d4a040", roof: "#c04020", trim: "#c89838", h: 0.9, fx: 0.72, fz: 0.62, roofType: "flat", windows: false, door: false },
  hospital:   { wall: "#f0ece6", roof: "#c8c4bc", trim: "#e0dcd6", h: 1.8, fx: 0.76, fz: 0.65, roofType: "flat", windows: true, door: true },
  school:     { wall: "#a0522d", roof: "#6b3410", trim: "#8a4420", h: 1.6, fx: 0.7, fz: 0.58, roofType: "gable", windows: true, door: true },
  college:    { wall: "#8a8070", roof: "#6a6058", trim: "#7a7068", h: 2.2, fx: 0.8, fz: 0.7, roofType: "dome", windows: true, door: true },
  inn:        { wall: "#7a5030", roof: "#4a2818", trim: "#6a4020", h: 1.5, fx: 0.62, fz: 0.55, roofType: "hip", windows: true, door: true },
  workshop:   { wall: "#5a5550", roof: "#3a3530", trim: "#4a4540", h: 1.6, fx: 0.62, fz: 0.52, roofType: "flat", windows: true, door: true },
}

function BuildingMesh({ x, z, type, phase }: { x: number; z: number; type: string; phase: Phase }) {
  const cfg = B[type]
  if (!cfg) return null

  const rng = hash(x * 13 + 3, z * 7 + 11)
  const rng2 = hash(x * 37 + 1, z * 19 + 5)
  const h = cfg.h * (0.88 + rng * 0.24)
  const fx = cfg.fx * (0.92 + rng2 * 0.12)
  const fz = cfg.fz * (0.92 + rng * 0.12)
  const isNight = phase === "night" || phase === "evening"
  const px = x - HALF + 0.5
  const pz = z - HALF + 0.5

  return (
    <group position={[px, 0, pz]}>
      {/* Foundation / base slab */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[fx + 0.08, 0.04, fz + 0.08]} />
        <meshStandardMaterial color={cfg.trim} roughness={0.9} />
      </mesh>

      {/* Main walls */}
      <mesh position={[0, h / 2 + 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[fx, h, fz]} />
        <meshStandardMaterial color={cfg.wall} roughness={0.78} />
      </mesh>

      {/* Horizontal trim band near top */}
      {cfg.h > 0.5 && (
        <mesh position={[0, h - 0.05, 0]}>
          <boxGeometry args={[fx + 0.02, 0.04, fz + 0.02]} />
          <meshStandardMaterial color={cfg.trim} roughness={0.8} />
        </mesh>
      )}

      {/* ── ROOFS ── */}
      {cfg.roofType === "gable" && (
        <group position={[0, h + 0.04, 0]}>
          {/* Two sloped sides as thin rotated boxes */}
          <mesh position={[0, 0.16, -fz * 0.22]} rotation={[0.5, 0, 0]} castShadow>
            <boxGeometry args={[fx + 0.06, 0.04, fz * 0.55]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.16, fz * 0.22]} rotation={[-0.5, 0, 0]} castShadow>
            <boxGeometry args={[fx + 0.06, 0.04, fz * 0.55]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.72} />
          </mesh>
          {/* Ridge beam */}
          <mesh position={[0, 0.28, 0]}>
            <boxGeometry args={[fx + 0.08, 0.03, 0.03]} />
            <meshStandardMaterial color={cfg.trim} roughness={0.8} />
          </mesh>
        </group>
      )}

      {cfg.roofType === "hip" && (
        <group position={[0, h + 0.04, 0]}>
          <mesh position={[0, 0.12, -fz * 0.2]} rotation={[0.45, 0, 0]} castShadow>
            <boxGeometry args={[fx * 0.9, 0.04, fz * 0.5]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.12, fz * 0.2]} rotation={[-0.45, 0, 0]} castShadow>
            <boxGeometry args={[fx * 0.9, 0.04, fz * 0.5]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.72} />
          </mesh>
          <mesh position={[-fx * 0.2, 0.12, 0]} rotation={[0, 0, 0.45]} castShadow>
            <boxGeometry args={[fx * 0.5, 0.04, fz * 0.9]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.72} />
          </mesh>
          <mesh position={[fx * 0.2, 0.12, 0]} rotation={[0, 0, -0.45]} castShadow>
            <boxGeometry args={[fx * 0.5, 0.04, fz * 0.9]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.72} />
          </mesh>
        </group>
      )}

      {cfg.roofType === "flat" && (
        <mesh position={[0, h + 0.06, 0]} castShadow>
          <boxGeometry args={[fx + 0.06, 0.06, fz + 0.06]} />
          <meshStandardMaterial color={cfg.roof} roughness={0.85} />
        </mesh>
      )}

      {cfg.roofType === "dome" && (
        <mesh position={[0, h + 0.04, 0]} castShadow>
          <sphereGeometry args={[Math.max(fx, fz) * 0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={cfg.roof} roughness={0.65} metalness={0.05} />
        </mesh>
      )}

      {/* ── WINDOWS (punched recesses on front/back walls) ── */}
      {cfg.windows && h > 0.6 && (
        <>
          {/* Front windows */}
          {Array.from({ length: Math.max(1, Math.floor(fx / 0.22)) }).map((_, wi) => {
            const spacing = fx / (Math.floor(fx / 0.22) + 1)
            const wx = -fx / 2 + spacing * (wi + 1)
            const wy = h * 0.55 + 0.04
            return (
              <group key={`fw${wi}`}>
                {/* Window hole (dark recess) */}
                <mesh position={[wx, wy, fz / 2 + 0.001]}>
                  <boxGeometry args={[0.1, 0.12, 0.015]} />
                  <meshStandardMaterial
                    color={isNight ? "#ffcc55" : "#3a5070"}
                    roughness={isNight ? 0.3 : 0.15}
                    emissive={isNight ? "#ffaa22" : "#000000"}
                    emissiveIntensity={isNight ? 0.6 : 0}
                  />
                </mesh>
                {/* Frame */}
                <mesh position={[wx, wy, fz / 2 + 0.008]}>
                  <boxGeometry args={[0.12, 0.14, 0.006]} />
                  <meshStandardMaterial color={cfg.trim} roughness={0.8} />
                </mesh>
              </group>
            )
          })}
          {/* Back windows (simpler) */}
          {Array.from({ length: Math.max(1, Math.floor(fx / 0.28)) }).map((_, wi) => {
            const spacing = fx / (Math.floor(fx / 0.28) + 1)
            const wx = -fx / 2 + spacing * (wi + 1)
            const wy = h * 0.55 + 0.04
            return (
              <mesh key={`bw${wi}`} position={[wx, wy, -fz / 2 - 0.001]}>
                <boxGeometry args={[0.1, 0.12, 0.015]} />
                <meshStandardMaterial
                  color={isNight ? "#ffcc55" : "#3a5070"}
                  roughness={isNight ? 0.3 : 0.15}
                  emissive={isNight ? "#ffaa22" : "#000000"}
                  emissiveIntensity={isNight ? 0.4 : 0}
                />
              </mesh>
            )
          })}
        </>
      )}

      {/* ── DOOR ── */}
      {cfg.door && h > 0.5 && (
        <group position={[rng > 0.5 ? 0.08 : -0.08, 0.2, fz / 2 + 0.001]}>
          <mesh>
            <boxGeometry args={[0.12, 0.22, 0.015]} />
            <meshStandardMaterial color="#3a2518" roughness={0.85} />
          </mesh>
          {/* Door frame */}
          <mesh position={[0, 0, -0.003]}>
            <boxGeometry args={[0.14, 0.24, 0.006]} />
            <meshStandardMaterial color={cfg.trim} roughness={0.8} />
          </mesh>
          {/* Doorknob */}
          <mesh position={[0.04, 0, 0.01]}>
            <sphereGeometry args={[0.01, 6, 6]} />
            <meshStandardMaterial color="#c0a060" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* ── BUILDING-SPECIFIC DETAILS ── */}

      {/* Farm crop rows */}
      {type === "farm" && (
        <>
          {Array.from({ length: 6 }).map((_, i) => (
            <group key={`cr${i}`}>
              <mesh position={[-fx / 2 + 0.08 + (i * fx) / 6, 0.06, 0]} castShadow>
                <boxGeometry args={[0.05, 0.06, fz * 0.82]} />
                <meshStandardMaterial color={`hsl(${100 + rng * 30}, 55%, ${28 + rng * 12}%)`} roughness={0.9} />
              </mesh>
              {/* Tiny crop tops */}
              {Array.from({ length: 4 }).map((_, j) => (
                <mesh key={`cp${j}`} position={[-fx / 2 + 0.08 + (i * fx) / 6, 0.11, -fz * 0.3 + j * fz * 0.2]}>
                  <sphereGeometry args={[0.03, 5, 4]} />
                  <meshStandardMaterial color={`hsl(${90 + rng * 40}, 50%, ${32 + hash(i, j) * 15}%)`} roughness={0.85} />
                </mesh>
              ))}
            </group>
          ))}
        </>
      )}

      {/* Hospital red cross */}
      {type === "hospital" && (
        <group position={[0, h + 0.14, fz / 2 + 0.01]}>
          <mesh>
            <boxGeometry args={[0.06, 0.2, 0.015]} />
            <meshBasicMaterial color="#c0392b" />
          </mesh>
          <mesh>
            <boxGeometry args={[0.2, 0.06, 0.015]} />
            <meshBasicMaterial color="#c0392b" />
          </mesh>
        </group>
      )}

      {/* School bell tower */}
      {type === "school" && (
        <group position={[0, h + 0.04, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            <meshStandardMaterial color="#8b7355" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <coneGeometry args={[0.08, 0.12, 4]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color="#d4a017" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* Workshop chimney */}
      {type === "workshop" && (
        <group position={[fx / 2 - 0.1, h + 0.04, fz / 2 - 0.08]}>
          <mesh castShadow>
            <boxGeometry args={[0.1, 0.35, 0.1]} />
            <meshStandardMaterial color="#4a4540" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.12, 0.03, 0.12]} />
            <meshStandardMaterial color="#3a3530" roughness={0.85} />
          </mesh>
        </group>
      )}

      {/* Market awning poles and canopy */}
      {type === "market" && (
        <>
          {([[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]).map(([sx, sz], i) => (
            <mesh key={`mp${i}`} position={[sx * fx * 0.38, h * 0.5 + 0.04, sz * fz * 0.38]} castShadow>
              <cylinderGeometry args={[0.02, 0.02, h, 6]} />
              <meshStandardMaterial color="#5a4a3a" roughness={0.85} />
            </mesh>
          ))}
          {/* Hanging goods */}
          {Array.from({ length: 3 }).map((_, i) => (
            <mesh key={`mg${i}`} position={[-0.2 + i * 0.2, 0.15, 0]}>
              <boxGeometry args={[0.12, 0.08, 0.1]} />
              <meshStandardMaterial color={`hsl(${30 + i * 60 + rng * 30}, 50%, 50%)`} roughness={0.7} />
            </mesh>
          ))}
        </>
      )}

      {/* Watchtower crenellations */}
      {type === "watchtower" && (
        <>
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2
            return (
              <mesh key={`wc${i}`} position={[Math.cos(angle) * fx * 0.52, h + 0.04 + 0.07, Math.sin(angle) * fz * 0.52]} castShadow>
                <boxGeometry args={[0.06, 0.14, 0.06]} />
                <meshStandardMaterial color="#686058" roughness={0.85} />
              </mesh>
            )
          })}
          {isNight && <pointLight position={[0, h + 0.35, 0]} color="#ff8844" intensity={4} distance={5} decay={2} />}
        </>
      )}

      {/* Well */}
      {type === "well" && (
        <>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.18, 0.2, 0.16, 12]} />
            <meshStandardMaterial color="#7a8a8a" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.04, 12]} />
            <meshStandardMaterial color="#2570a0" roughness={0.1} metalness={0.2} />
          </mesh>
          {/* Crossbar */}
          <mesh position={[0, 0.28, 0]}>
            <boxGeometry args={[0.3, 0.02, 0.02]} />
            <meshStandardMaterial color="#5a3a20" roughness={0.9} />
          </mesh>
          <mesh position={[-0.14, 0.18, 0]}>
            <boxGeometry args={[0.02, 0.22, 0.02]} />
            <meshStandardMaterial color="#5a3a20" roughness={0.9} />
          </mesh>
          <mesh position={[0.14, 0.18, 0]}>
            <boxGeometry args={[0.02, 0.22, 0.02]} />
            <meshStandardMaterial color="#5a3a20" roughness={0.9} />
          </mesh>
        </>
      )}

      {/* Inn sign */}
      {type === "inn" && (
        <group position={[fx / 2 + 0.06, h * 0.55, 0]}>
          <mesh>
            <boxGeometry args={[0.02, 0.02, 0.16]} />
            <meshStandardMaterial color="#5a3a20" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.06, 0]}>
            <boxGeometry args={[0.01, 0.1, 0.12]} />
            <meshStandardMaterial color="#d4a017" roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
      )}

      {/* Night window glow point light */}
      {isNight && cfg.windows && h > 0.6 && (
        <pointLight position={[0, h * 0.45, 0]} color="#ffcc55" intensity={0.8} distance={2.5} decay={2} />
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════
// TREES (rounded canopies, varied shapes)
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
          const rng = hash(x * 7, y * 13)
          if (rng > 0.25) data.push({ x, z: y, rng, rng2: hash(x * 31, y * 47) })
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
      const trunkH = 0.25 + t.rng * 0.25
      const canopyR = 0.2 + t.rng2 * 0.18

      // Trunk - thin cylinder
      dummy.position.set(t.x - HALF + 0.5 + (t.rng - 0.5) * 0.15, trunkH / 2, t.z - HALF + 0.5 + (t.rng2 - 0.5) * 0.15)
      dummy.rotation.set(0, t.rng * Math.PI * 2, (t.rng2 - 0.5) * 0.1)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      trunkRef.current!.setMatrixAt(i, dummy.matrix)

      // Canopy - positioned on top of trunk, scale to oval/sphere
      const canopyY = trunkH + canopyR * 0.6
      dummy.position.set(
        t.x - HALF + 0.5 + (t.rng - 0.5) * 0.15,
        canopyY,
        t.z - HALF + 0.5 + (t.rng2 - 0.5) * 0.15
      )
      const sx = canopyR * (1.6 + t.rng * 0.6)
      const sy = canopyR * (1.2 + t.rng2 * 0.5)
      const sz = canopyR * (1.6 + t.rng2 * 0.6)
      dummy.rotation.set(0, t.rng * Math.PI, 0)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      canopyRef.current!.setMatrixAt(i, dummy.matrix)

      // Natural green variation
      c.setHSL(0.28 + t.rng * 0.06, 0.45 + t.rng2 * 0.2, 0.2 + t.rng * 0.1)
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
        <cylinderGeometry args={[0.025, 0.04, 0.4, 5]} />
        <meshStandardMaterial color="#5a3a1a" roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, treeData.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial vertexColors roughness={0.82} />
      </instancedMesh>
    </>
  )
}

// ═══════════════════════════════════════════════════
// WATER (animated, semi-transparent with specular)
// ═══════════════════════════════════════════════════
function WaterPlane({ map }: { map: MapTile[][] }) {
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
      dummy.position.set(w.x - HALF + 0.5, -0.04, w.z - HALF + 0.5)
      dummy.rotation.set(0, 0, 0)
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
      const wave = Math.sin(t * 0.5 + w.x * 0.3 + w.z * 0.25) * 0.015
      dummy.position.set(w.x - HALF + 0.5, -0.04 + wave, w.z - HALF + 0.5)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  if (waterTiles.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, waterTiles.length]} receiveShadow>
      <boxGeometry args={[1.02, 0.06, 1.02]} />
      <meshStandardMaterial color="#1a7094" roughness={0.08} metalness={0.3} transparent opacity={0.85} />
    </instancedMesh>
  )
}

// ═══════════════════════════════════════════════════
// PERSON (NPC with walk animation)
// ═══════════════════════════════════════════════════
function PersonMesh({ agent, phase }: { agent: Agent; phase: Phase }) {
  const groupRef = useRef<THREE.Group>(null)
  const isSleeping = agent.status === "sleeping"
  const bodyH = agent.ageGroup === "child" ? 0.15 : agent.ageGroup === "teen" ? 0.2 : 0.26
  const headR = agent.ageGroup === "child" ? 0.05 : 0.06

  const color = useMemo(() => {
    if (isSleeping) return "#455a64"
    if (agent.ageGroup === "child") return "#ffca28"
    if (agent.ageGroup === "teen") return "#42a5f5"
    if (agent.ageGroup === "elder") return "#ab47bc"
    if (["Doctor", "Nurse", "Healer"].includes(agent.archetype)) return "#ef5350"
    if (["Guard", "Scout", "Warrior"].includes(agent.archetype)) return "#ffa726"
    if (["Farmer", "Fisher", "Hunter"].includes(agent.archetype)) return "#66bb6a"
    if (["Teacher", "Professor"].includes(agent.archetype)) return "#26c6da"
    if (["Shopkeeper", "Merchant", "Baker"].includes(agent.archetype)) return "#ec407a"
    if (["Builder", "Blacksmith", "Carpenter", "Mason"].includes(agent.archetype)) return "#8d6e63"
    return "#78909c"
  }, [agent.archetype, agent.ageGroup, isSleeping])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    if (isSleeping && (phase === "night" || phase === "evening")) {
      groupRef.current.visible = false
      return
    }
    groupRef.current.visible = true
    const t = clock.getElapsedTime()
    const idx = parseInt(agent.id.replace(/\D/g, ""), 10) || 0
    groupRef.current.position.y = bodyH / 2 + Math.abs(Math.sin(t * 3.2 + idx * 1.1)) * 0.02
    groupRef.current.rotation.z = Math.sin(t * 2 + idx) * 0.03
  })

  return (
    <group
      ref={groupRef}
      position={[agent.position.x - HALF + 0.5, bodyH / 2, agent.position.y - HALF + 0.5]}
    >
      {/* Body */}
      <mesh castShadow>
        <capsuleGeometry args={[bodyH * 0.25, bodyH * 0.45, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      {/* Head */}
      <mesh position={[0, bodyH * 0.5, 0]} castShadow>
        <sphereGeometry args={[headR, 8, 8]} />
        <meshStandardMaterial color="#f0c8a0" roughness={0.65} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════
// CARS (animated along roads)
// ═══════════════════════════════════════════════════
function Car({ startX, startZ, direction, index }: { startX: number; startZ: number; direction: "h" | "v"; index: number }) {
  const meshRef = useRef<THREE.Group>(null)
  const color = useMemo(() => {
    const colors = ["#c0392b", "#2980b9", "#27ae60", "#f39c12", "#8e44ad", "#e74c3c", "#1abc9c", "#2c3e50"]
    return colors[index % colors.length]
  }, [index])
  const speed = useMemo(() => 0.5 + hash(index * 17, index * 31) * 0.7, [index])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime() * speed + index * 5.3
    const range = 10
    const offset = ((t % (range * 2)) - range)

    if (direction === "h") {
      meshRef.current.position.x = startX - HALF + offset
      meshRef.current.position.z = startZ - HALF + 0.5
      meshRef.current.rotation.y = offset > 0 ? 0 : Math.PI
    } else {
      meshRef.current.position.x = startX - HALF + 0.5
      meshRef.current.position.z = startZ - HALF + offset
      meshRef.current.rotation.y = offset > 0 ? Math.PI / 2 : -Math.PI / 2
    }
  })

  return (
    <group ref={meshRef} position={[startX - HALF, 0.1, startZ - HALF]}>
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={[0.38, 0.12, 0.2]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.45} />
      </mesh>
      {/* Cabin */}
      <mesh castShadow position={[0.02, 0.09, 0]}>
        <boxGeometry args={[0.2, 0.08, 0.16]} />
        <meshStandardMaterial color="#88ccee" roughness={0.15} metalness={0.15} transparent opacity={0.75} />
      </mesh>
      {/* Headlights */}
      <mesh position={[0.2, 0.02, 0.06]}>
        <sphereGeometry args={[0.015, 5, 5]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffffaa" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.2, 0.02, -0.06]}>
        <sphereGeometry args={[0.015, 5, 5]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffffaa" emissiveIntensity={0.5} />
      </mesh>
      {/* Wheels */}
      {([[-0.12, -0.05, 0.11], [-0.12, -0.05, -0.11], [0.12, -0.05, 0.11], [0.12, -0.05, -0.11]] as [number, number, number][]).map(([wx, wy, wz], i) => (
        <mesh key={`w${i}`} position={[wx, wy, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.025, 8]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      ))}
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
        if (tile?.hasPath || tile?.building === "road") roadTiles.push({ x, z: y })
      }
    const carList: { x: number; z: number; dir: "h" | "v"; idx: number }[] = []
    for (let i = 0; i < Math.min(14, Math.floor(roadTiles.length / 5)); i++) {
      const rt = roadTiles[Math.floor(hash(i * 29, i * 43) * roadTiles.length)]
      if (rt) carList.push({ x: rt.x, z: rt.z, dir: i % 2 === 0 ? "h" : "v", idx: i })
    }
    return carList
  }, [map])

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={light.ambient} color={light.color} />
      <directionalLight
        position={[22, 35, 18]}
        intensity={light.sun}
        color={light.color}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      {/* Fill light from opposite side */}
      <directionalLight position={[-15, 10, -12]} intensity={light.sun * 0.15} color="#aaccff" />
      {phase === "night" && <hemisphereLight intensity={0.08} color="#223355" groundColor="#111122" />}

      {/* Environment for reflections */}
      <Environment
        preset={phase === "night" ? "night" : phase === "evening" ? "sunset" : phase === "morning" ? "dawn" : "park"}
        background={false}
      />

      {/* Fog for depth */}
      <fog attach="fog" args={[light.fog, 25, 70]} />

      {/* Infinite base plane */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#4a7030" roughness={0.95} />
      </mesh>

      {/* Contact shadows for soft AO under objects */}
      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={light.shadow}
        scale={80}
        blur={2}
        far={6}
        resolution={512}
        color="#1a2a10"
      />

      <GroundPlane map={map} />
      <WaterPlane map={map} />
      <Roads map={map} />
      <Trees map={map} />

      {buildings.map((b) => (
        <BuildingMesh key={`b-${b.x}-${b.z}`} x={b.x} z={b.z} type={b.type} phase={phase} />
      ))}

      {cars.map((car) => (
        <Car key={`car-${car.idx}`} startX={car.x} startZ={car.z} direction={car.dir} index={car.idx} />
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
          toneMappingExposure: 1.15,
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

      {/* Legend overlay */}
      <div className="absolute bottom-3 right-3 z-20 glass-panel rounded-md px-3 py-2 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#3a6e22" },
          { label: "Plains", color: "#6a9c42" },
          { label: "Water", color: "#2882aa" },
          { label: "Mountain", color: "#8a8a7e" },
          { label: "Desert", color: "#d0b868" },
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
