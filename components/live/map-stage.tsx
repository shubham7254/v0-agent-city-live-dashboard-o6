"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrthographicCamera, Environment, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { Agent, MapTile, Phase, WorldMetrics, CameraMode } from "@/lib/types"

// ─── CONSTANTS ────────────────────────────────────
const MAP_SIZE = 60
const HALF = MAP_SIZE / 2

// ─── DETERMINISTIC HASH ───────────────────────────
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0
  h = ((h ^ (h >> 13)) * 1274126177) | 0
  return ((h >>> 0) / 4294967296)
}

// ─── PHASE LIGHTING ───────────────────────────────
function getPhaseLight(phase: Phase) {
  switch (phase) {
    case "morning": return { sun: 0.85, color: "#ffd4a0", ambient: 0.45, sky: "#87ceeb", fog: "#c8dfe8" }
    case "day":     return { sun: 1.0,  color: "#fff5e0", ambient: 0.55, sky: "#6eb5e7", fog: "#a8cce0" }
    case "evening": return { sun: 0.55, color: "#ff8040", ambient: 0.25, sky: "#2c1654", fog: "#3a2040" }
    case "night":   return { sun: 0.12, color: "#334488", ambient: 0.12, sky: "#080c18", fog: "#0a0e1a" }
  }
}

// ─── BIOME COLORS ─────────────────────────────────
const BIOME_BASE: Record<string, string> = {
  plains:   "#5a8c3a",
  forest:   "#2d5a16",
  water:    "#2277aa",
  mountain: "#7a7a6e",
  desert:   "#c8b060",
}

// ─── BUILDING CONFIGS ─────────────────────────────
interface BuildingConfig {
  wall: string
  roof: string
  height: number
  footX: number
  footZ: number
  roofType: "peaked" | "flat" | "dome" | "none"
}

const BUILDINGS: Record<string, BuildingConfig> = {
  house:      { wall: "#d4b896", roof: "#8b4513", height: 1.6, footX: 0.6, footZ: 0.55, roofType: "peaked" },
  farm:       { wall: "#7aaa32", roof: "#5a8822", height: 0.15, footX: 0.88, footZ: 0.88, roofType: "none" },
  council:    { wall: "#e0d8c8", roof: "#4a6741", height: 3.0, footX: 0.8, footZ: 0.7, roofType: "dome" },
  watchtower: { wall: "#706860", roof: "#5a524a", height: 4.2, footX: 0.35, footZ: 0.35, roofType: "flat" },
  storehouse: { wall: "#8a6540", roof: "#5a3518", height: 1.8, footX: 0.72, footZ: 0.55, roofType: "peaked" },
  well:       { wall: "#7a8a8a", roof: "#4a7090", height: 0.4, footX: 0.35, footZ: 0.35, roofType: "none" },
  wall:       { wall: "#6e6358", roof: "#5a5048", height: 1.8, footX: 0.92, footZ: 0.25, roofType: "flat" },
  shop:       { wall: "#e8d0a0", roof: "#b85c38", height: 2.0, footX: 0.6, footZ: 0.55, roofType: "peaked" },
  market:     { wall: "#d4a040", roof: "#c04020", height: 1.2, footX: 0.75, footZ: 0.65, roofType: "flat" },
  hospital:   { wall: "#f0ece6", roof: "#ddd",    height: 2.6, footX: 0.78, footZ: 0.68, roofType: "flat" },
  school:     { wall: "#a0522d", roof: "#6b3410", height: 2.2, footX: 0.72, footZ: 0.6, roofType: "peaked" },
  college:    { wall: "#8a8070", roof: "#5a5048", height: 3.2, footX: 0.82, footZ: 0.72, roofType: "dome" },
  inn:        { wall: "#6b4226", roof: "#3a2010", height: 2.0, footX: 0.65, footZ: 0.58, roofType: "peaked" },
  workshop:   { wall: "#5a5550", roof: "#3a3530", height: 2.2, footX: 0.65, footZ: 0.55, roofType: "flat" },
}

// ═══════════════════════════════════════════════════
// INSTANCED GROUND PLANE
// ═══════════════════════════════════════════════════
function GroundPlane({ map }: { map: MapTile[][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const colorRef = useRef<Float32Array | null>(null)

  const count = useMemo(() => {
    let c = 0
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++)
        if (map[y]?.[x]) c++
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
        dummy.position.set(x - HALF + 0.5, tile.biome === "water" ? -0.1 : 0, y - HALF + 0.5)
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(idx, dummy.matrix)

        const rng = hash(x * 11, y * 23)
        const base = tile.hasPath ? "#6a6560" : (BIOME_BASE[tile.biome] ?? "#5a8c3a")
        color.set(base)
        color.offsetHSL(0, 0, (rng - 0.5) * 0.08)
        colors[idx * 3] = color.r
        colors[idx * 3 + 1] = color.g
        colors[idx * 3 + 2] = color.b
        idx++
      }
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3))
    colorRef.current = colors
  }, [map, count])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial vertexColors roughness={0.92} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

// ═══════════════════════════════════════════════════
// INSTANCED ROAD SEGMENTS (hasPath tiles with road markings)
// ═══════════════════════════════════════════════════
function Roads({ map }: { map: MapTile[][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const lineRef = useRef<THREE.InstancedMesh>(null)

  const roadTiles = useMemo(() => {
    const tiles: { x: number; z: number }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.hasPath || tile?.building === "road") tiles.push({ x, z: y })
      }
    return tiles
  }, [map])

  useEffect(() => {
    if (!meshRef.current || !lineRef.current) return
    const dummy = new THREE.Object3D()

    roadTiles.forEach((r, i) => {
      // Road surface
      dummy.position.set(r.x - HALF + 0.5, 0.015, r.z - HALF + 0.5)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(0.95, 0.95, 1)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)

      // Center line
      dummy.position.set(r.x - HALF + 0.5, 0.018, r.z - HALF + 0.5)
      dummy.scale.set(0.04, 0.5, 1)
      dummy.updateMatrix()
      lineRef.current!.setMatrixAt(i, dummy.matrix)
    })

    meshRef.current.instanceMatrix.needsUpdate = true
    lineRef.current.instanceMatrix.needsUpdate = true
  }, [roadTiles])

  if (roadTiles.length === 0) return null

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, roadTiles.length]} receiveShadow>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#555" roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={lineRef} args={[undefined, undefined, roadTiles.length]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#999" roughness={0.5} />
      </instancedMesh>
    </>
  )
}

// ═══════════════════════════════════════════════════
// BUILDING MESH (individual - each has unique shape)
// ═══════════════════════════════════════════════════
function BuildingMesh({ x, z, type, phase }: { x: number; z: number; type: string; phase: Phase }) {
  const cfg = BUILDINGS[type]
  if (!cfg) return null

  const rng = hash(x * 13 + 3, z * 7 + 11)
  const h = cfg.height * (0.85 + rng * 0.3)
  const fx = cfg.footX * (0.9 + rng * 0.15)
  const fz = cfg.footZ * (0.9 + rng * 0.15)
  const isNight = phase === "night" || phase === "evening"
  const showWindow = isNight && type !== "farm" && type !== "well" && type !== "wall"
  const px = x - HALF + 0.5
  const pz = z - HALF + 0.5

  return (
    <group position={[px, 0, pz]}>
      {/* Shadow blob on ground */}
      <mesh position={[0.06, 0.002, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[fx + 0.15, fz + 0.15]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} />
      </mesh>

      {/* Main walls */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[fx, h, fz]} />
        <meshStandardMaterial color={cfg.wall} roughness={0.82} />
      </mesh>

      {/* Roof */}
      {cfg.roofType === "peaked" && (
        <mesh position={[0, h + 0.22, 0]} castShadow rotation={[0, rng > 0.5 ? Math.PI / 4 : 0, 0]}>
          <coneGeometry args={[Math.max(fx, fz) * 0.68, 0.55 + rng * 0.25, 4]} />
          <meshStandardMaterial color={cfg.roof} roughness={0.75} />
        </mesh>
      )}
      {cfg.roofType === "flat" && (
        <mesh position={[0, h + 0.03, 0]} castShadow>
          <boxGeometry args={[fx + 0.04, 0.06, fz + 0.04]} />
          <meshStandardMaterial color={cfg.roof} roughness={0.85} />
        </mesh>
      )}
      {cfg.roofType === "dome" && (
        <mesh position={[0, h, 0]} castShadow>
          <sphereGeometry args={[Math.max(fx, fz) * 0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={cfg.roof} roughness={0.7} />
        </mesh>
      )}

      {/* Farm crop rows */}
      {type === "farm" && (
        <>
          {[...Array(5)].map((_, i) => (
            <mesh key={i} position={[-fx / 2 + 0.1 + (i * fx) / 5, 0.12, 0]} castShadow>
              <boxGeometry args={[0.06, 0.08, fz * 0.85]} />
              <meshStandardMaterial color={`hsl(${100 + rng * 30}, 55%, ${28 + rng * 12}%)`} roughness={0.9} />
            </mesh>
          ))}
        </>
      )}

      {/* Hospital red cross */}
      {type === "hospital" && (
        <group position={[0, h + 0.15, 0]}>
          <mesh>
            <boxGeometry args={[0.08, 0.35, 0.08]} />
            <meshBasicMaterial color="#c0392b" />
          </mesh>
          <mesh>
            <boxGeometry args={[0.35, 0.08, 0.08]} />
            <meshBasicMaterial color="#c0392b" />
          </mesh>
        </group>
      )}

      {/* School bell tower */}
      {type === "school" && (
        <group position={[0, h, 0]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.12, 0.6, 0.12]} />
            <meshStandardMaterial color="#8b7355" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.65, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#d4a017" metalness={0.4} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* Workshop chimney with smoke effect */}
      {type === "workshop" && (
        <group position={[fx / 2 - 0.12, h, fz / 2 - 0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.12, 0.45, 0.12]} />
            <meshStandardMaterial color="#444" roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* Market awning poles */}
      {type === "market" && (
        <>
          {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * fx * 0.4, h / 2, sz * fz * 0.4]} castShadow>
              <cylinderGeometry args={[0.025, 0.025, h, 6]} />
              <meshStandardMaterial color="#5a4a3a" roughness={0.9} metalness={0.4} />
            </mesh>
          ))}
        </>
      )}

      {/* Watchtower crenellations */}
      {type === "watchtower" && (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const angle = (i / 6) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(angle) * fx * 0.5, h + 0.1, Math.sin(angle) * fz * 0.5]} castShadow>
                <boxGeometry args={[0.1, 0.2, 0.1]} />
                <meshStandardMaterial color="#605b56" roughness={0.85} />
              </mesh>
            )
          })}
          {isNight && (
            <pointLight position={[0, h + 0.3, 0]} color="#ff8844" intensity={3} distance={4} />
          )}
        </>
      )}

      {/* Well water */}
      {type === "well" && (
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 12]} />
          <meshStandardMaterial color="#3578aa" roughness={0.2} metalness={0.1} />
        </mesh>
      )}

      {/* Inn sign */}
      {type === "inn" && (
        <group position={[fx / 2 + 0.05, h * 0.6, 0]}>
          <mesh>
            <boxGeometry args={[0.02, 0.18, 0.15]} />
            <meshStandardMaterial color="#d4a017" roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Window glow at night */}
      {showWindow && (
        <>
          <mesh position={[fx / 2 + 0.005, h * 0.45, 0]}>
            <planeGeometry args={[0.01, h * 0.2]} />
            <meshBasicMaterial color="#ffcc55" transparent opacity={0.65} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-fx / 2 - 0.005, h * 0.45, 0]}>
            <planeGeometry args={[0.01, h * 0.2]} />
            <meshBasicMaterial color="#ffcc55" transparent opacity={0.55} side={THREE.DoubleSide} />
          </mesh>
          <pointLight position={[0, h * 0.4, 0]} color="#ffcc55" intensity={0.5} distance={2} />
        </>
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════
// INSTANCED TREES (forests)
// ═══════════════════════════════════════════════════
function Trees({ map }: { map: MapTile[][] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const canopyRef = useRef<THREE.InstancedMesh>(null)

  const treeData = useMemo(() => {
    const data: { x: number; z: number; rng: number }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.biome === "forest" && !tile.building && !tile.hasPath) {
          const rng = hash(x * 7, y * 13)
          if (rng > 0.3) data.push({ x, z: y, rng })
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
      const trunkH = 0.35 + t.rng * 0.35
      const canopyH = 0.45 + t.rng * 0.35
      const canopyR = 0.22 + t.rng * 0.18

      // Trunk
      dummy.position.set(t.x - HALF + 0.5, trunkH / 2, t.z - HALF + 0.5)
      dummy.scale.set(1, 1, 1)
      dummy.rotation.set(0, t.rng * Math.PI, 0)
      dummy.updateMatrix()
      trunkRef.current!.setMatrixAt(i, dummy.matrix)

      // Canopy
      dummy.position.set(t.x - HALF + 0.5, trunkH + canopyH * 0.35, t.z - HALF + 0.5)
      dummy.scale.set(canopyR * 2, canopyH, canopyR * 2)
      dummy.updateMatrix()
      canopyRef.current!.setMatrixAt(i, dummy.matrix)

      c.setHSL((0.28 + t.rng * 0.08), 0.55 + t.rng * 0.15, 0.18 + t.rng * 0.12)
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
        <cylinderGeometry args={[0.03, 0.05, 0.5, 5]} />
        <meshStandardMaterial color="#5a3a20" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, treeData.length]} castShadow>
        <coneGeometry args={[0.5, 1, 7]} />
        <meshStandardMaterial vertexColors roughness={0.85} />
      </instancedMesh>
    </>
  )
}

// ═══════════════════════════════════════════════════
// ANIMATED WATER PLANE
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
      dummy.position.set(w.x - HALF + 0.5, -0.08, w.z - HALF + 0.5)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [waterTiles])

  // Animate y position for wave effect
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const dummy = new THREE.Object3D()
    const t = clock.getElapsedTime()
    waterTiles.forEach((w, i) => {
      const wave = Math.sin(t * 0.6 + w.x * 0.4 + w.z * 0.3) * 0.025
      dummy.position.set(w.x - HALF + 0.5, -0.08 + wave, w.z - HALF + 0.5)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  if (waterTiles.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, waterTiles.length]} receiveShadow>
      <planeGeometry args={[1.02, 1.02]} />
      <meshStandardMaterial color="#1a6694" roughness={0.15} metalness={0.15} transparent opacity={0.88} />
    </instancedMesh>
  )
}

// ═══════════════════════════════════════════════════
// ANIMATED PERSON (NPC)
// ═══════════════════════════════════════════════════
function PersonMesh({ agent, phase }: { agent: Agent; phase: Phase }) {
  const groupRef = useRef<THREE.Group>(null)
  const isSleeping = agent.status === "sleeping"
  const bodyH = agent.ageGroup === "child" ? 0.18 : agent.ageGroup === "teen" ? 0.24 : 0.3
  const headR = agent.ageGroup === "child" ? 0.065 : 0.08

  // Determine color by role
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

  // Walk bob animation
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    if (isSleeping) {
      groupRef.current.visible = phase === "night" || phase === "evening" ? false : true
      return
    }
    groupRef.current.visible = true
    const t = clock.getElapsedTime()
    const idx = parseInt(agent.id.replace(/\D/g, ""), 10) || 0
    // Subtle walking bob
    groupRef.current.position.y = bodyH / 2 + Math.abs(Math.sin(t * 3.5 + idx * 1.1)) * 0.03
    // Slight sway
    groupRef.current.rotation.z = Math.sin(t * 2.5 + idx) * 0.04
  })

  return (
    <group
      ref={groupRef}
      position={[
        agent.position.x - HALF + 0.5,
        bodyH / 2,
        agent.position.y - HALF + 0.5,
      ]}
    >
      {/* Body capsule */}
      <mesh castShadow>
        <capsuleGeometry args={[bodyH * 0.28, bodyH * 0.5, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Head */}
      <mesh position={[0, bodyH * 0.55, 0]} castShadow>
        <sphereGeometry args={[headR, 8, 8]} />
        <meshStandardMaterial color="#f0c8a0" roughness={0.7} />
      </mesh>
      {/* Shadow on ground */}
      <mesh position={[0, -bodyH / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 8]} />
        <meshBasicMaterial color="#000" transparent opacity={0.15} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════
// ANIMATED CAR
// ═══════════════════════════════════════════════════
function Car({ startX, startZ, direction, index }: { startX: number; startZ: number; direction: "h" | "v"; index: number }) {
  const meshRef = useRef<THREE.Group>(null)
  const color = useMemo(() => {
    const colors = ["#c0392b", "#2980b9", "#27ae60", "#f39c12", "#8e44ad", "#e74c3c", "#1abc9c", "#34495e"]
    return colors[index % colors.length]
  }, [index])

  const speed = useMemo(() => 0.6 + hash(index * 17, index * 31) * 0.8, [index])

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
      {/* Car body */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.42, 0.14, 0.22]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Cabin */}
      <mesh castShadow position={[0.02, 0.1, 0]}>
        <boxGeometry args={[0.22, 0.1, 0.18]} />
        <meshStandardMaterial color="#88ccff" roughness={0.2} metalness={0.1} transparent opacity={0.7} />
      </mesh>
      {/* Wheels */}
      {[[-0.14, -0.06, 0.12], [-0.14, -0.06, -0.12], [0.14, -0.06, 0.12], [0.14, -0.06, -0.12]].map(([wx, wy, wz], i) => (
        <mesh key={i} position={[wx, wy, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 8]} />
          <meshStandardMaterial color="#222" roughness={0.8} />
        </mesh>
      ))}
      {/* Shadow */}
      <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, 0.3]} />
        <meshBasicMaterial color="#000" transparent opacity={0.2} />
      </mesh>
    </group>
  )
}

// Camera controls are handled by OrbitControls in the Canvas

// ═══════════════════════════════════════════════════
// SCENE CONTENT
// ═══════════════════════════════════════════════════
function SceneContent({ map, agents, phase }: { map: MapTile[][]; agents: Agent[]; phase: Phase }) {
  const light = getPhaseLight(phase)

  // Collect buildings
  const buildings = useMemo(() => {
    const list: { x: number; z: number; type: string }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.building && tile.building !== "road") list.push({ x, z: y, type: tile.building })
      }
    return list
  }, [map])

  // Cars on roads
  const cars = useMemo(() => {
    const roadTiles: { x: number; z: number }[] = []
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y]?.[x]
        if (tile?.hasPath || tile?.building === "road") roadTiles.push({ x, z: y })
      }
    // Place a car every ~8 road tiles
    const carList: { x: number; z: number; dir: "h" | "v"; idx: number }[] = []
    for (let i = 0; i < Math.min(12, Math.floor(roadTiles.length / 6)); i++) {
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
        position={[25, 40, 20]}
        intensity={light.sun}
        color={light.color}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={120}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.001}
      />
      {phase === "night" && <hemisphereLight intensity={0.06} color="#223355" groundColor="#111122" />}

      {/* Environment for subtle reflections */}
      <Environment
        preset={phase === "night" ? "night" : phase === "evening" ? "sunset" : phase === "morning" ? "dawn" : "city"}
        background={false}
      />

      {/* Fog */}
      <fog attach="fog" args={[light.fog, 30, 80]} />

      {/* Base world plane (extends beyond village) */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[150, 150]} />
        <meshStandardMaterial color="#4a6e2e" roughness={0.95} />
      </mesh>

      {/* Ground tiles (instanced) */}
      <GroundPlane map={map} />

      {/* Water */}
      <WaterPlane map={map} />

      {/* Roads */}
      <Roads map={map} />

      {/* Trees */}
      <Trees map={map} />

      {/* Buildings */}
      {buildings.map((b) => (
        <BuildingMesh key={`b-${b.x}-${b.z}`} x={b.x} z={b.z} type={b.type} phase={phase} />
      ))}

      {/* Cars */}
      {cars.map((car) => (
        <Car key={`car-${car.idx}`} startX={car.x} startZ={car.z} direction={car.dir} index={car.idx} />
      ))}

      {/* People */}
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
          enableRotate={true}
          enablePan={true}
          enableZoom={true}
          minZoom={6}
          maxZoom={80}
          maxPolarAngle={Math.PI / 2.5}
          minPolarAngle={Math.PI / 8}
          panSpeed={1.2}
          zoomSpeed={1.2}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
          touches={{
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_ROTATE,
          }}
        />
        <SceneContent map={map} agents={agents} phase={phase} />
      </Canvas>

      {/* Legend overlay */}
      <div className="absolute bottom-3 right-3 z-20 glass-panel rounded-md px-3 py-2 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#2d5a16" },
          { label: "Plains", color: "#5a8c3a" },
          { label: "Water", color: "#2277aa" },
          { label: "Mountain", color: "#7a7a6e" },
          { label: "Desert", color: "#c8b060" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="font-mono text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Center button */}
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
