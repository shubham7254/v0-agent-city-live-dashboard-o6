"use client"

import { useRef, useMemo, useCallback, useEffect, memo, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
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

function hillH(x: number, z: number): number {
  return (
    Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.35 +
    Math.sin(x * 0.15 + 2.7) * Math.cos(z * 0.12 + 1.3) * 0.15 +
    Math.sin(x * 0.04 + 5.1) * Math.sin(z * 0.035 + 3.8) * 0.5
  )
}

type Season = "spring" | "summer" | "autumn" | "winter"
function getMichiganSeason(): Season {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return "spring"
  if (month >= 6 && month <= 8) return "summer"
  if (month >= 9 && month <= 11) return "autumn"
  return "winter"
}

const SEASON_TINT: Record<Season, Record<string, [number, number, number]>> = {
  spring: { plains: [0.38, 0.52, 0.28], forest: [0.28, 0.42, 0.18], water: [0.18, 0.38, 0.52], mountain: [0.48, 0.46, 0.42], desert: [0.6, 0.52, 0.36] },
  summer: { plains: [0.35, 0.48, 0.22], forest: [0.22, 0.38, 0.14], water: [0.16, 0.34, 0.48], mountain: [0.46, 0.44, 0.4], desert: [0.62, 0.55, 0.35] },
  autumn: { plains: [0.45, 0.38, 0.20], forest: [0.40, 0.30, 0.14], water: [0.22, 0.36, 0.44], mountain: [0.44, 0.40, 0.36], desert: [0.56, 0.48, 0.32] },
  winter: { plains: [0.55, 0.56, 0.54], forest: [0.48, 0.50, 0.48], water: [0.30, 0.42, 0.50], mountain: [0.60, 0.60, 0.58], desert: [0.58, 0.55, 0.48] },
}

const TREE_COLORS: Record<Season, number[]> = {
  spring: [0x4a8a3a, 0x5a9a48, 0x3a7830, 0x68a858],
  summer: [0x3a6830, 0x4a7838, 0x2a5820, 0x5a8a40],
  autumn: [0xc86830, 0xd8a040, 0xb84820, 0xe8b848],
  winter: [0x5a6058, 0x485048, 0x404840, 0x586058],
}

function getBiomeColor(biome: string, season: Season): [number, number, number] {
  return SEASON_TINT[season][biome] ?? [0.4, 0.4, 0.4]
}

function phaseLight(p: Phase) {
  switch (p) {
    case "morning": return { sun: 0.75, color: 0xffecd2, amb: 0.45, sky: 0x9cb8cf, fog: 0xc8d8e4, fogN: 20, fogF: 55 }
    case "day":     return { sun: 1.0, color: 0xfff5e8, amb: 0.55, sky: 0x8aaccc, fog: 0xb8ccd8, fogN: 25, fogF: 65 }
    case "evening": return { sun: 0.5, color: 0xe07848, amb: 0.35, sky: 0x2a2040, fog: 0x3a2840, fogN: 18, fogF: 50 }
    case "night":   return { sun: 0.15, color: 0x4466aa, amb: 0.25, sky: 0x0a1020, fog: 0x101828, fogN: 12, fogF: 45 }
  }
}

// Building configs
interface BC { wall: number; roof: number; h: number; fx: number; fz: number; flat: boolean; win: boolean; door: boolean }
const B: Record<string, BC> = {
  house:      { wall: 0xe8e2d8, roof: 0x4a5058, h: 1.1, fx: 0.52, fz: 0.44, flat: false, win: true, door: true },
  farm:       { wall: 0x7a9838, roof: 0x5a7828, h: 0.06, fx: 0.86, fz: 0.86, flat: true, win: false, door: false },
  council:    { wall: 0xf0ece4, roof: 0x3a4248, h: 2.2, fx: 0.76, fz: 0.66, flat: true, win: true, door: true },
  watchtower: { wall: 0x706860, roof: 0x4a4440, h: 2.5, fx: 0.28, fz: 0.28, flat: true, win: true, door: false },
  storehouse: { wall: 0xd0c8b8, roof: 0x585048, h: 1.3, fx: 0.64, fz: 0.48, flat: false, win: false, door: true },
  well:       { wall: 0x8a9090, roof: 0x607080, h: 0.3, fx: 0.26, fz: 0.26, flat: true, win: false, door: false },
  wall:       { wall: 0x686060, roof: 0x585050, h: 1.0, fx: 0.88, fz: 0.2, flat: true, win: false, door: false },
  shop:       { wall: 0xf2ece2, roof: 0xc06030, h: 1.3, fx: 0.52, fz: 0.46, flat: true, win: true, door: true },
  market:     { wall: 0xe8dcc8, roof: 0xb04820, h: 0.85, fx: 0.68, fz: 0.56, flat: true, win: false, door: false },
  hospital:   { wall: 0xf5f2ee, roof: 0x505860, h: 2.0, fx: 0.72, fz: 0.62, flat: true, win: true, door: true },
  school:     { wall: 0xe0d0b8, roof: 0x4a3828, h: 1.5, fx: 0.66, fz: 0.54, flat: false, win: true, door: true },
  college:    { wall: 0xd8d4cc, roof: 0x3a4048, h: 2.4, fx: 0.78, fz: 0.68, flat: true, win: true, door: true },
  inn:        { wall: 0xc8a878, roof: 0x3a3028, h: 1.4, fx: 0.56, fz: 0.48, flat: false, win: true, door: true },
  workshop:   { wall: 0x686460, roof: 0x3a3835, h: 1.5, fx: 0.58, fz: 0.48, flat: true, win: true, door: true },
}

// Pre-computed data types
interface BuildingData { x: number; z: number; baseY: number; cfg: BC; h: number; fx: number; fz: number; rng: number }
interface TreeData { x: number; z: number; baseY: number; trunkH: number; canopyScale: number; color: number; rotY: number }
interface WaterTile { x: number; z: number; idx: number }

// Shared geometry/material refs (created once)
const _dummy = new THREE.Object3D()
const _color = new THREE.Color()
const _bgColor = new THREE.Color()

// ═══════════════════════════════════════════════════
// SCENE LIGHTING
// ═══════════════════════════════════════════════════
const SceneLighting = memo(function SceneLighting({ phase }: { phase: Phase }) {
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const ambRef = useRef<THREE.AmbientLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const moonRef = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()

  useFrame(() => {
    const light = phaseLight(phase)
    if (sunRef.current) {
      sunRef.current.intensity = light.sun
      sunRef.current.color.set(light.color)
    }
    if (ambRef.current) ambRef.current.intensity = light.amb
    if (hemiRef.current) {
      hemiRef.current.intensity = phase === "night" ? 0.12 : 0.2
      hemiRef.current.color.set(phase === "night" ? 0x283858 : 0xa8c0d8)
      hemiRef.current.groundColor.set(phase === "night" ? 0x141c28 : 0x607040)
    }
    if (moonRef.current) moonRef.current.intensity = phase === "night" ? 0.4 : phase === "evening" ? 0.2 : 0
    _bgColor.set(light.sky)
    scene.background = _bgColor
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(light.fog)
      scene.fog.near = light.fogN
      scene.fog.far = light.fogF
    }
  })

  return (
    <>
      <ambientLight ref={ambRef} intensity={0.55} color={0xc0c8d0} />
      <directionalLight
        ref={sunRef}
        position={[18, 30, 14]}
        intensity={1.0}
        color={0xfff5e8}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-far={80}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <hemisphereLight ref={hemiRef} args={[0xa8c0d8, 0x607040, 0.2]} />
      <directionalLight ref={moonRef} position={[-10, 25, -8]} intensity={0} color={0x6688cc} />
      <fog attach="fog" args={[0xb8ccd8, 25, 65]} />
    </>
  )
})

// ═══════════════════════════════════════════════════
// TERRAIN - instanced with callback ref setup
// ═══════════════════════════════════════════════════
const Terrain = memo(function Terrain({ map }: { map: MapTile[][] }) {
  const season = useMemo(() => getMichiganSeason(), [])
  const tileCount = MAP * MAP

  const setupTerrain = useCallback(
    (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return
      const colors = new Float32Array(tileCount * 3)
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
          _dummy.position.set(wx, h - 0.06, wz)
          _dummy.rotation.set(0, 0, 0)
          _dummy.scale.set(1.005, 1, 1.005)
          _dummy.updateMatrix()
          mesh.setMatrixAt(idx, _dummy.matrix)
          const base = tile.hasPath
            ? [0.28 + rng * 0.02, 0.28 + rng * 0.02, 0.27 + rng * 0.02] as [number, number, number]
            : getBiomeColor(tile.biome, season)
          _color.setRGB(base[0] + (rng - 0.5) * 0.04, base[1] + (rng2 - 0.5) * 0.04, base[2] + (rng - 0.5) * 0.03, THREE.SRGBColorSpace)
          colors[idx * 3] = _color.r
          colors[idx * 3 + 1] = _color.g
          colors[idx * 3 + 2] = _color.b
          idx++
        }
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3))
    },
    [map, season, tileCount]
  )

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshLambertMaterial color={0x4a6830} />
      </mesh>
      <instancedMesh ref={setupTerrain} args={[undefined, undefined, tileCount]} receiveShadow>
        <boxGeometry args={[1, 0.12, 1]} />
        <meshLambertMaterial vertexColors />
      </instancedMesh>
    </>
  )
})

// ═══════════════════════════════════════════════════
// ROADS - instanced with callback ref
// ═══════════════════════════════════════════════════
const Roads = memo(function Roads({ map }: { map: MapTile[][] }) {
  const roadCount = useMemo(() => {
    let count = 0
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++)
        if (map[y]?.[x]?.hasPath) count++
    return count
  }, [map])

  const setupRoads = useCallback(
    (mesh: THREE.InstancedMesh | null) => {
      if (!mesh || roadCount === 0) return
      let idx = 0
      for (let y = 0; y < MAP; y++) {
        for (let x = 0; x < MAP; x++) {
          if (!map[y]?.[x]?.hasPath) continue
          const wx = x - HALF + 0.5
          const wz = y - HALF + 0.5
          _dummy.position.set(wx, hillH(wx, wz) * 0.1 + 0.01, wz)
          _dummy.rotation.set(0, 0, 0)
          _dummy.scale.set(1, 1, 1)
          _dummy.updateMatrix()
          mesh.setMatrixAt(idx++, _dummy.matrix)
        }
      }
      mesh.instanceMatrix.needsUpdate = true
    },
    [map, roadCount]
  )

  if (roadCount === 0) return null
  return (
    <instancedMesh ref={setupRoads} args={[undefined, undefined, roadCount]} receiveShadow>
      <boxGeometry args={[0.96, 0.05, 0.96]} />
      <meshLambertMaterial color={0x3a3d42} />
    </instancedMesh>
  )
})

// ═══════════════════════════════════════════════════
// BUILDINGS - declarative groups
// ═══════════════════════════════════════════════════
const Buildings = memo(function Buildings({ map, phase }: { map: MapTile[][]; phase: Phase }) {
  const buildings = useMemo(() => {
    const list: BuildingData[] = []
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
        list.push({
          x: wx, z: wz,
          baseY: hillH(wx, wz) * 0.1,
          cfg, h: cfg.h * (0.9 + rng * 0.2),
          fx: cfg.fx * (0.94 + rng2 * 0.1),
          fz: cfg.fz * (0.94 + rng * 0.1),
          rng,
        })
      }
    }
    return list
  }, [map])

  const isNight = phase === "night" || phase === "evening"
  const emissive = isNight ? 0.6 : 0

  return (
    <group>
      {buildings.map((b, i) => (
        <group key={i} position={[b.x, b.baseY, b.z]}>
          {/* Foundation */}
          <mesh position={[0, 0.015, 0]}>
            <boxGeometry args={[b.fx + 0.06, 0.03, b.fz + 0.06]} />
            <meshLambertMaterial color={0xb0aaa0} />
          </mesh>
          {/* Walls */}
          <mesh position={[0, b.h / 2 + 0.03, 0]} castShadow>
            <boxGeometry args={[b.fx, b.h, b.fz]} />
            <meshLambertMaterial color={b.cfg.wall} />
          </mesh>
          {/* Roof */}
          <mesh position={[0, b.h + 0.05, 0]}>
            <boxGeometry args={[b.fx + 0.04, 0.04, b.fz + 0.04]} />
            <meshLambertMaterial color={b.cfg.roof} />
          </mesh>
          {/* Windows glow */}
          {b.cfg.win && b.h > 0.6 && (
            <mesh position={[0, b.h * 0.55, b.fz / 2 + 0.001]}>
              <planeGeometry args={[b.fx * 0.6, b.h * 0.25]} />
              <meshLambertMaterial
                color={0x6080a0}
                transparent
                opacity={isNight ? 0.9 : 0.4}
                emissive={0xffcc44}
                emissiveIntensity={emissive}
              />
            </mesh>
          )}
          {/* Door */}
          {b.cfg.door && b.h > 0.4 && (
            <mesh position={[b.rng > 0.5 ? 0.06 : -0.06, 0.13, b.fz / 2 + 0.001]}>
              <boxGeometry args={[0.1, 0.2, 0.01]} />
              <meshLambertMaterial color={0x3a2010} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
})

// ═══════════════════════════════════════════════════
// TREES - instanced with callback refs
// ═══════════════════════════════════════════════════
const Trees = memo(function Trees({ map }: { map: MapTile[][] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const canopyRef = useRef<THREE.InstancedMesh>(null)
  const [ready, setReady] = useState(false)
  const season = useMemo(() => getMichiganSeason(), [])

  const treeData = useMemo(() => {
    const list: TreeData[] = []
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const tile = map[y]?.[x]
        if (tile?.biome === "forest" && !tile.building && !tile.hasPath) {
          const r = hash(x * 7, y * 13)
          if (r > 0.4) {
            const r2 = hash(x * 31, y * 47)
            const wx = x - HALF + 0.5 + (r - 0.5) * 0.2
            const wz = y - HALF + 0.5 + (r2 - 0.5) * 0.2
            const colors = TREE_COLORS[season]
            list.push({
              x: wx, z: wz,
              baseY: hillH(wx, wz),
              trunkH: 0.3 + r * 0.35,
              canopyScale: 0.18 + r2 * 0.15,
              color: colors[Math.floor(r * colors.length) % colors.length],
              rotY: r * Math.PI * 2,
            })
          }
        }
      }
    }
    return list
  }, [map, season])

  useEffect(() => {
    if (!trunkRef.current || !canopyRef.current || treeData.length === 0) return
    const canopyColors = new Float32Array(treeData.length * 3)

    treeData.forEach((t, i) => {
      _dummy.position.set(t.x, t.baseY + t.trunkH / 2, t.z)
      _dummy.rotation.set(0, t.rotY, 0)
      _dummy.scale.set(1, 1, 1)
      _dummy.updateMatrix()
      trunkRef.current!.setMatrixAt(i, _dummy.matrix)

      const cw = t.canopyScale
      _dummy.position.set(t.x, t.baseY + t.trunkH + cw * 0.4, t.z)
      _dummy.scale.set(cw * 2, cw * 1.2, cw * 2)
      _dummy.updateMatrix()
      canopyRef.current!.setMatrixAt(i, _dummy.matrix)

      _color.setHex(t.color)
      canopyColors[i * 3] = _color.r
      canopyColors[i * 3 + 1] = _color.g
      canopyColors[i * 3 + 2] = _color.b
    })
    trunkRef.current!.instanceMatrix.needsUpdate = true
    canopyRef.current!.instanceMatrix.needsUpdate = true
    canopyRef.current!.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(canopyColors, 3))
    setReady(true)
  }, [treeData])

  if (treeData.length === 0) return null
  return (
    <group visible={ready}>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, treeData.length]} castShadow>
        <cylinderGeometry args={[0.018, 0.03, 0.5, 4]} />
        <meshLambertMaterial color={0x5a4028} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, treeData.length]} castShadow>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshLambertMaterial vertexColors />
      </instancedMesh>
    </group>
  )
})

// ═══════════════════════════════════════════════════
// WATER - animated instanced mesh
// ═══════════════════════════════════════════════════
const Water = memo(function Water({ map }: { map: MapTile[][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const [ready, setReady] = useState(false)

  const waterTiles = useMemo(() => {
    const list: WaterTile[] = []
    let idx = 0
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++)
        if (map[y]?.[x]?.biome === "water") list.push({ x, z: y, idx: idx++ })
    return list
  }, [map])

  useEffect(() => {
    if (!meshRef.current || waterTiles.length === 0) return
    for (const wt of waterTiles) {
      _dummy.position.set(wt.x - HALF + 0.5, -0.06, wt.z - HALF + 0.5)
      _dummy.rotation.set(0, 0, 0)
      _dummy.scale.set(1, 1, 1)
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(wt.idx, _dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
    setReady(true)
  }, [waterTiles])

  const frameCount = useRef(0)
  useFrame(({ clock }) => {
    frameCount.current++
    if (frameCount.current % 6 !== 0) return
    if (!meshRef.current || waterTiles.length === 0) return
    const t = clock.getElapsedTime()
    for (const wt of waterTiles) {
      _dummy.position.set(
        wt.x - HALF + 0.5,
        -0.06 + Math.sin(t * 0.4 + wt.x * 0.25 + wt.z * 0.2) * 0.01,
        wt.z - HALF + 0.5,
      )
      _dummy.rotation.set(0, 0, 0)
      _dummy.scale.set(1, 1, 1)
      _dummy.updateMatrix()
      meshRef.current!.setMatrixAt(wt.idx, _dummy.matrix)
    }
    meshRef.current!.instanceMatrix.needsUpdate = true
  })

  if (waterTiles.length === 0) return null
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, waterTiles.length]} visible={ready}>
      <boxGeometry args={[1.01, 0.08, 1.01]} />
      <meshLambertMaterial color={0x2a5878} transparent opacity={0.82} />
    </instancedMesh>
  )
})

// ═══════════════════════════════════════════════════
// AGENTS - animated
// ═══════════════════════════════════════════════════
function AgentMesh({ agent, phase, onClick }: { agent: Agent; phase: Phase; onClick?: (id: string) => void }) {
  const groupRef = useRef<THREE.Group>(null)
  const isNight = phase === "night" || phase === "evening"
  const visible = !(agent.status === "sleeping" && isNight)
  const idNum = parseInt(agent.id.replace(/\D/g, ""), 10) || 0

  useFrame(({ clock }) => {
    if (!groupRef.current || !visible) return
    const t = clock.getElapsedTime()
    const wx = agent.position.x - HALF + 0.5
    const wz = agent.position.y - HALF + 0.5
    const baseY = hillH(wx, wz)
    groupRef.current.position.set(wx, baseY + 0.12 + Math.abs(Math.sin(t * 3 + idNum * 1.1)) * 0.015, wz)
  })

  const handleClick = useCallback(() => {
    if (onClick) onClick(agent.id)
  }, [onClick, agent.id])

  if (!visible) return null
  return (
    <group ref={groupRef} onClick={handleClick}>
      <mesh castShadow>
        <capsuleGeometry args={[0.04, 0.08, 2, 6]} />
        <meshLambertMaterial color={0xe0c0a0} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshLambertMaterial color={0xe0c0a0} />
      </mesh>
    </group>
  )
}

const AgentLayer = memo(function AgentLayer({ agents, phase, onAgentClick }: { agents: Agent[]; phase: Phase; onAgentClick?: (id: string) => void }) {
  return (
    <group>
      {agents.map((agent) => (
        <AgentMesh key={agent.id} agent={agent} phase={phase} onClick={onAgentClick} />
      ))}
    </group>
  )
})

// ═══════════════════════════════════════════════════
// WEATHER PARTICLES
// ═══════════════════════════════════════════════════
const WeatherParticles = memo(function WeatherParticles() {
  const pointsRef = useRef<THREE.Points>(null)
  const season = useMemo(() => getMichiganSeason(), [])
  const particleCount = season === "winter" ? 200 : season === "autumn" ? 100 : 0

  const [positions, speeds] = useMemo(() => {
    if (particleCount === 0) return [null, null]
    const pos = new Float32Array(particleCount * 3)
    const spd = new Float32Array(particleCount)
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * MAP
      pos[i * 3 + 1] = Math.random() * 15
      pos[i * 3 + 2] = (Math.random() - 0.5) * MAP
      spd[i] = 0.3 + Math.random() * 0.7
    }
    return [pos, spd]
  }, [particleCount])

  useFrame(({ clock }) => {
    if (!pointsRef.current || !positions || !speeds) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 1] -= speeds[i] * 0.03
      if (season === "autumn") {
        positions[i * 3] += Math.sin(t * 2 + i) * 0.008
        positions[i * 3 + 2] += Math.cos(t * 1.5 + i * 0.7) * 0.004
      } else {
        positions[i * 3] += Math.sin(t + i * 0.1) * 0.003
      }
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 12 + Math.random() * 3
        positions[i * 3] = (Math.random() - 0.5) * MAP
        positions[i * 3 + 2] = (Math.random() - 0.5) * MAP
      }
    }
    const attr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    attr.needsUpdate = true
  })

  if (particleCount === 0 || !positions) return null
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={season === "winter" ? 0xffffff : 0xc86830}
        size={season === "winter" ? 0.06 : 0.08}
        transparent
        opacity={season === "winter" ? 0.8 : 0.6}
        depthWrite={false}
      />
    </points>
  )
})

// ═══════════════════════════════════════════════════
// STREETLIGHTS - instanced with callback refs
// ═══════════════════════════════════════════════════
const Streetlights = memo(function Streetlights({ map, phase }: { map: MapTile[][]; phase: Phase }) {
  const poleRef = useRef<THREE.InstancedMesh>(null)
  const lampRef = useRef<THREE.InstancedMesh>(null)
  const [ready, setReady] = useState(false)
  const isNight = phase === "night" || phase === "evening"

  const slData = useMemo(() => {
    const list: { wx: number; wz: number; baseY: number }[] = []
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++)
        if (map[y]?.[x]?.hasPath && hash(x * 41, y * 59) > 0.82) {
          const wx = x - HALF + 0.5 + 0.38
          const wz = y - HALF + 0.5
          list.push({ wx, wz, baseY: hillH(wx, wz) * 0.1 })
        }
    return list
  }, [map])

  useEffect(() => {
    if (!poleRef.current || !lampRef.current || slData.length === 0) return
    slData.forEach((sl, i) => {
      _dummy.position.set(sl.wx, sl.baseY, sl.wz)
      _dummy.rotation.set(0, 0, 0)
      _dummy.scale.set(1, 1, 1)
      _dummy.updateMatrix()
      poleRef.current!.setMatrixAt(i, _dummy.matrix)
      _dummy.position.set(sl.wx - 0.1, sl.baseY + 0.42, sl.wz)
      _dummy.updateMatrix()
      lampRef.current!.setMatrixAt(i, _dummy.matrix)
    })
    poleRef.current!.instanceMatrix.needsUpdate = true
    lampRef.current!.instanceMatrix.needsUpdate = true
    setReady(true)
  }, [slData])

  if (slData.length === 0) return null
  return (
    <group visible={ready}>
      <instancedMesh ref={poleRef} args={[undefined, undefined, slData.length]}>
        <cylinderGeometry args={[0.012, 0.015, 0.8, 4]} />
        <meshLambertMaterial color={0x505558} />
      </instancedMesh>
      <instancedMesh ref={lampRef} args={[undefined, undefined, slData.length]}>
        <boxGeometry args={[0.06, 0.02, 0.035]} />
        <meshLambertMaterial color={0xe0ddd5} emissive={0xffd888} emissiveIntensity={isNight ? 0.8 : 0} />
      </instancedMesh>
    </group>
  )
})

// ═══════════════════════════════════════════════════
// MAIN SCENE (inner Canvas content)
// ═══════════════════════════════════════════════════
function CityScene({ map, agents, phase, onAgentClick }: {
  map: MapTile[][]
  agents: Agent[]
  phase: Phase
  onAgentClick?: (agentId: string) => void
}) {
  return (
    <>
      <SceneLighting phase={phase} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minZoom={3}
        maxZoom={80}
        maxPolarAngle={Math.PI / 2.5}
        minPolarAngle={0.3}
        target={[0, 0, 0]}
      />
      <Terrain map={map} />
      <Roads map={map} />
      <Buildings map={map} phase={phase} />
      <Trees map={map} />
      <Water map={map} />
      <Streetlights map={map} phase={phase} />
      <AgentLayer agents={agents} phase={phase} onAgentClick={onAgentClick} />
      <WeatherParticles />
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
  onAgentClick?: (agentId: string) => void
}

export function MapStage({ map, agents, phase, metrics, cameraMode, onAgentClick }: MapStageProps) {
  return (
    <div className="relative flex-1 w-full h-full" style={{ minHeight: 400 }}>
      <Canvas
        className="absolute inset-0"
        orthographic
        camera={{
          position: [20, 24, 20],
          zoom: 18,
          near: 0.1,
          far: 300,
        }}
        shadows="basic"
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
      >
        <CityScene map={map} agents={agents} phase={phase} onAgentClick={onAgentClick} />
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
