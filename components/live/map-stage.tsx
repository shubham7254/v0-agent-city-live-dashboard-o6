"use client"

import { useRef, useMemo, useCallback, useEffect, memo, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Environment, Sky, MeshReflectorMaterial } from "@react-three/drei"
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
    case "morning": return { sun: 1.2, color: 0xffe4c4, amb: 0.5, sky: 0xb8d0e8, fogColor: 0xd8e4ee, fogN: 30, fogF: 90, sunAz: 0.25, sunEl: 15, skyTurb: 8 }
    case "day":     return { sun: 1.8, color: 0xfff8f0, amb: 0.65, sky: 0xa8c8e8, fogColor: 0xc8dce8, fogN: 40, fogF: 100, sunAz: 0.5, sunEl: 45, skyTurb: 10 }
    case "evening": return { sun: 0.8, color: 0xe07040, amb: 0.35, sky: 0x2a2040, fogColor: 0x3a2840, fogN: 20, fogF: 70, sunAz: 0.75, sunEl: 5, skyTurb: 6 }
    case "night":   return { sun: 0.05, color: 0x4466aa, amb: 0.18, sky: 0x060a18, fogColor: 0x0a1020, fogN: 15, fogF: 60, sunAz: 1.0, sunEl: -10, skyTurb: 3 }
  }
}

// Building configs
interface BC { wall: number; roof: number; h: number; fx: number; fz: number; flat: boolean; win: boolean; door: boolean; roughness: number; metalness: number }
const B: Record<string, BC> = {
  house:      { wall: 0xf0ebe2, roof: 0x5a6068, h: 1.1, fx: 0.52, fz: 0.44, flat: false, win: true, door: true, roughness: 0.85, metalness: 0.0 },
  farm:       { wall: 0x7a9838, roof: 0x5a7828, h: 0.06, fx: 0.86, fz: 0.86, flat: true, win: false, door: false, roughness: 0.95, metalness: 0.0 },
  council:    { wall: 0xf5f0e8, roof: 0x3a4450, h: 2.2, fx: 0.76, fz: 0.66, flat: true, win: true, door: true, roughness: 0.6, metalness: 0.05 },
  watchtower: { wall: 0x807870, roof: 0x504a46, h: 2.5, fx: 0.28, fz: 0.28, flat: true, win: true, door: false, roughness: 0.9, metalness: 0.1 },
  storehouse: { wall: 0xd8d0c0, roof: 0x605850, h: 1.3, fx: 0.64, fz: 0.48, flat: false, win: false, door: true, roughness: 0.8, metalness: 0.0 },
  well:       { wall: 0x909898, roof: 0x687888, h: 0.3, fx: 0.26, fz: 0.26, flat: true, win: false, door: false, roughness: 0.75, metalness: 0.15 },
  wall:       { wall: 0x706860, roof: 0x605858, h: 1.0, fx: 0.88, fz: 0.2, flat: true, win: false, door: false, roughness: 0.9, metalness: 0.05 },
  shop:       { wall: 0xf5f0e6, roof: 0xd06838, h: 1.3, fx: 0.52, fz: 0.46, flat: true, win: true, door: true, roughness: 0.7, metalness: 0.0 },
  market:     { wall: 0xf0e4d0, roof: 0xc05028, h: 0.85, fx: 0.68, fz: 0.56, flat: true, win: false, door: false, roughness: 0.8, metalness: 0.0 },
  hospital:   { wall: 0xfaf8f5, roof: 0x586068, h: 2.0, fx: 0.72, fz: 0.62, flat: true, win: true, door: true, roughness: 0.5, metalness: 0.05 },
  school:     { wall: 0xe8d8c0, roof: 0x503828, h: 1.5, fx: 0.66, fz: 0.54, flat: false, win: true, door: true, roughness: 0.8, metalness: 0.0 },
  college:    { wall: 0xe0dcd4, roof: 0x404850, h: 2.4, fx: 0.78, fz: 0.68, flat: true, win: true, door: true, roughness: 0.55, metalness: 0.05 },
  inn:        { wall: 0xd0b080, roof: 0x403028, h: 1.4, fx: 0.56, fz: 0.48, flat: false, win: true, door: true, roughness: 0.85, metalness: 0.0 },
  workshop:   { wall: 0x706c68, roof: 0x403e3a, h: 1.5, fx: 0.58, fz: 0.48, flat: true, win: true, door: true, roughness: 0.9, metalness: 0.15 },
}

interface BuildingData { x: number; z: number; baseY: number; cfg: BC; h: number; fx: number; fz: number; rng: number }
interface TreeData { x: number; z: number; baseY: number; trunkH: number; canopyScale: number; color: number; rotY: number }
interface WaterTile { x: number; z: number; idx: number }

const _dummy = new THREE.Object3D()
const _color = new THREE.Color()

// ═══════════════════════════════════════════════════
// SCENE LIGHTING + ATMOSPHERE
// ═══════════════════════════════════════════════════
const SceneLighting = memo(function SceneLighting({ phase }: { phase: Phase }) {
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const ambRef = useRef<THREE.AmbientLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const fillRef = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()

  useFrame(() => {
    const L = phaseLight(phase)
    if (sunRef.current) {
      sunRef.current.intensity = L.sun
      sunRef.current.color.set(L.color)
    }
    if (ambRef.current) ambRef.current.intensity = L.amb
    if (hemiRef.current) {
      hemiRef.current.intensity = phase === "night" ? 0.08 : 0.25
      hemiRef.current.color.set(phase === "night" ? 0x283858 : 0xb0d0f0)
      hemiRef.current.groundColor.set(phase === "night" ? 0x0a1018 : 0x506830)
    }
    if (fillRef.current) fillRef.current.intensity = phase === "night" ? 0.3 : phase === "evening" ? 0.15 : 0.1
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(L.fogColor)
      scene.fog.near = L.fogN
      scene.fog.far = L.fogF
    }
  })

  return (
    <>
      <ambientLight ref={ambRef} intensity={0.65} color={0xc8d0d8} />
      <hemisphereLight ref={hemiRef} args={[0xb0d0f0, 0x506830, 0.25]} />
      {/* Main sun */}
      <directionalLight
        ref={sunRef}
        position={[22, 35, 18]}
        intensity={1.8}
        color={0xfff8f0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      {/* Back fill light for depth */}
      <directionalLight ref={fillRef} position={[-15, 20, -12]} intensity={0.1} color={0x6080b0} />
      {/* Fog for atmosphere */}
      <fog attach="fog" args={[0xc8dce8, 40, 100]} />
    </>
  )
})

// ═══════════════════════════════════════════════════
// DYNAMIC SKY
// ═══════════════════════════════════════════════════
const DynamicSky = memo(function DynamicSky({ phase }: { phase: Phase }) {
  const L = phaseLight(phase)
  return (
    <Sky
      distance={450000}
      sunPosition={[
        Math.cos(L.sunAz * Math.PI * 2) * 100,
        Math.sin((L.sunEl / 90) * Math.PI / 2) * 100,
        Math.sin(L.sunAz * Math.PI * 2) * 100,
      ]}
      turbidity={L.skyTurb}
      rayleigh={phase === "night" ? 0.1 : phase === "evening" ? 2.5 : 1.5}
      mieCoefficient={phase === "evening" ? 0.01 : 0.005}
      mieDirectionalG={phase === "evening" ? 0.95 : 0.8}
    />
  )
})

// ═══════════════════════════════════════════════════
// TERRAIN - instanced PBR
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
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color={0x4a6830} roughness={0.95} metalness={0} />
      </mesh>
      {/* Tile grid */}
      <instancedMesh ref={setupTerrain} args={[undefined, undefined, tileCount]} receiveShadow>
        <boxGeometry args={[1, 0.12, 1]} />
        <meshStandardMaterial vertexColors roughness={0.88} metalness={0} />
      </instancedMesh>
    </>
  )
})

// ═══════════════════════════════════════════════════
// ROADS - PBR with subtle sheen
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
      <meshStandardMaterial color={0x3a3d42} roughness={0.75} metalness={0.05} />
    </instancedMesh>
  )
})

// ═══════════════════════════════════════════════════
// BUILDINGS - PBR with window glow + detail
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
  const winEmissiveIntensity = isNight ? 1.2 : 0

  return (
    <group>
      {buildings.map((b, i) => {
        const numFloors = Math.max(1, Math.floor(b.h / 0.45))
        return (
          <group key={i} position={[b.x, b.baseY, b.z]}>
            {/* Foundation */}
            <mesh position={[0, 0.02, 0]} receiveShadow>
              <boxGeometry args={[b.fx + 0.08, 0.04, b.fz + 0.08]} />
              <meshStandardMaterial color={0xa09888} roughness={0.95} metalness={0.05} />
            </mesh>
            {/* Walls */}
            <mesh position={[0, b.h / 2 + 0.04, 0]} castShadow receiveShadow>
              <boxGeometry args={[b.fx, b.h, b.fz]} />
              <meshStandardMaterial color={b.cfg.wall} roughness={b.cfg.roughness} metalness={b.cfg.metalness} />
            </mesh>
            {/* Roof */}
            {b.cfg.flat ? (
              <mesh position={[0, b.h + 0.06, 0]} castShadow>
                <boxGeometry args={[b.fx + 0.06, 0.05, b.fz + 0.06]} />
                <meshStandardMaterial color={b.cfg.roof} roughness={0.7} metalness={0.1} />
              </mesh>
            ) : (
              <mesh position={[0, b.h + 0.15, 0]} rotation={[0, b.rng > 0.5 ? 0 : Math.PI / 2, 0]} castShadow>
                <coneGeometry args={[Math.max(b.fx, b.fz) * 0.75, 0.3, 4]} />
                <meshStandardMaterial color={b.cfg.roof} roughness={0.8} metalness={0.05} />
              </mesh>
            )}
            {/* Window rows per floor */}
            {b.cfg.win && b.h > 0.6 && Array.from({ length: numFloors }).map((_, fi) => {
              const fy = 0.04 + (fi + 0.5) * (b.h / numFloors)
              const winsPerRow = Math.max(1, Math.floor(b.fx / 0.18))
              return Array.from({ length: winsPerRow }).map((_, wi) => {
                const wxOff = (wi - (winsPerRow - 1) / 2) * 0.16
                const litFront = hash(i * 7 + fi * 3 + wi, 42) > 0.35
                const litBack = hash(i * 11 + fi * 5 + wi + 99, 77) > 0.4
                return (
                  <group key={`${fi}-${wi}`}>
                    {/* Front window */}
                    <mesh position={[wxOff, fy, b.fz / 2 + 0.002]}>
                      <planeGeometry args={[0.08, 0.1]} />
                      <meshStandardMaterial
                        color={isNight && litFront ? 0xffd080 : 0x8aaabe}
                        roughness={0.3}
                        metalness={0.1}
                        emissive={litFront ? 0xffcc44 : 0x000000}
                        emissiveIntensity={winEmissiveIntensity}
                        transparent={!isNight}
                        opacity={isNight ? 1 : 0.7}
                      />
                    </mesh>
                    {/* Back window */}
                    <mesh position={[wxOff, fy, -(b.fz / 2 + 0.002)]} rotation={[0, Math.PI, 0]}>
                      <planeGeometry args={[0.08, 0.1]} />
                      <meshStandardMaterial
                        color={isNight && litBack ? 0xffd080 : 0x8aaabe}
                        roughness={0.3}
                        metalness={0.1}
                        emissive={litBack ? 0xffcc44 : 0x000000}
                        emissiveIntensity={winEmissiveIntensity}
                        transparent={!isNight}
                        opacity={isNight ? 1 : 0.7}
                      />
                    </mesh>
                  </group>
                )
              })
            })}
            {/* Door */}
            {b.cfg.door && b.h > 0.4 && (
              <mesh position={[b.rng > 0.5 ? 0.06 : -0.06, 0.14, b.fz / 2 + 0.002]}>
                <planeGeometry args={[0.1, 0.22]} />
                <meshStandardMaterial color={0x4a2810} roughness={0.9} metalness={0} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
})

// ═══════════════════════════════════════════════════
// TREES - instanced PBR
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
        <cylinderGeometry args={[0.02, 0.035, 0.5, 5]} />
        <meshStandardMaterial color={0x5a4028} roughness={0.95} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, treeData.length]} castShadow>
        <dodecahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0} />
      </instancedMesh>
    </group>
  )
})

// ═══════════════════════════════════════════════════
// WATER - reflective
// ═══════════════════════════════════════════════════
const WaterSurface = memo(function WaterSurface({ map }: { map: MapTile[][] }) {
  const meshRef = useRef<THREE.Mesh>(null)

  const { minX, maxX, minZ, maxZ, hasWater } = useMemo(() => {
    let mnX = MAP, mxX = 0, mnZ = MAP, mxZ = 0, found = false
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++)
        if (map[y]?.[x]?.biome === "water") {
          found = true
          mnX = Math.min(mnX, x); mxX = Math.max(mxX, x)
          mnZ = Math.min(mnZ, y); mxZ = Math.max(mxZ, y)
        }
    return { minX: mnX - HALF, maxX: mxX - HALF + 1, minZ: mnZ - HALF, maxZ: mxZ - HALF + 1, hasWater: found }
  }, [map])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    meshRef.current.position.y = -0.04 + Math.sin(clock.getElapsedTime() * 0.3) * 0.01
  })

  if (!hasWater) return null
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const sx = maxX - minX + 2
  const sz = maxZ - minZ + 2

  return (
    <mesh ref={meshRef} position={[cx, -0.04, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[sx, sz, 1, 1]} />
      <MeshReflectorMaterial
        mirror={0.4}
        blur={[300, 100]}
        resolution={512}
        mixBlur={0.8}
        mixStrength={0.6}
        depthScale={0.4}
        minDepthThreshold={0.4}
        maxDepthThreshold={1}
        color={0x1a4868}
        metalness={0.2}
        roughness={0.6}
      />
    </mesh>
  )
})

// ═══════════════════════════════════════════════════
// AGENTS - PBR with name labels
// ═══════════════════════════════════════════════════
function AgentMesh({ agent, phase, onClick }: { agent: Agent; phase: Phase; onClick?: (id: string, event?: MouseEvent) => void }) {
  const groupRef = useRef<THREE.Group>(null)
  const isNight = phase === "night" || phase === "evening"
  const visible = !(agent.status === "sleeping" && isNight)
  const idNum = parseInt(agent.id.replace(/\D/g, ""), 10) || 0

  // Deterministic agent color
  const agentColor = useMemo(() => {
    const hue = (idNum * 137.508) % 360
    return new THREE.Color().setHSL(hue / 360, 0.5, 0.55)
  }, [idNum])

  useFrame(({ clock }) => {
    if (!groupRef.current || !visible) return
    const t = clock.getElapsedTime()
    const wx = agent.position.x - HALF + 0.5
    const wz = agent.position.y - HALF + 0.5
    const baseY = hillH(wx, wz)
    groupRef.current.position.set(wx, baseY + 0.12 + Math.abs(Math.sin(t * 3 + idNum * 1.1)) * 0.015, wz)
  })

  const handleClick = useCallback((e: { nativeEvent?: MouseEvent; stopPropagation?: () => void }) => {
    e.stopPropagation?.()
    if (onClick) onClick(agent.id, e.nativeEvent instanceof MouseEvent ? e.nativeEvent : undefined)
  }, [onClick, agent.id])

  if (!visible) return null
  return (
    <group ref={groupRef} onClick={handleClick}>
      {/* Body */}
      <mesh castShadow>
        <capsuleGeometry args={[0.04, 0.08, 3, 8]} />
        <meshStandardMaterial color={agentColor} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color={0xf0d0b0} roughness={0.7} metalness={0} />
      </mesh>
      {/* Activity indicator glow */}
      {agent.status === "active" && (
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshStandardMaterial
            color={0x40ff80}
            emissive={0x40ff80}
            emissiveIntensity={0.8}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  )
}

const AgentLayer = memo(function AgentLayer({ agents, phase, onAgentClick }: { agents: Agent[]; phase: Phase; onAgentClick?: (id: string, event?: MouseEvent) => void }) {
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
  const particleCount = season === "winter" ? 300 : season === "autumn" ? 150 : 0

  const [positions, speeds] = useMemo(() => {
    if (particleCount === 0) return [null, null]
    const pos = new Float32Array(particleCount * 3)
    const spd = new Float32Array(particleCount)
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * MAP
      pos[i * 3 + 1] = Math.random() * 20
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
        positions[i * 3 + 1] = 15 + Math.random() * 5
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
        size={season === "winter" ? 0.08 : 0.1}
        transparent
        opacity={season === "winter" ? 0.85 : 0.65}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
})

// ═══════════════════════════════════════════════════
// STREETLIGHTS - PBR with glow
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
        <cylinderGeometry args={[0.012, 0.018, 0.8, 5]} />
        <meshStandardMaterial color={0x505558} roughness={0.7} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={lampRef} args={[undefined, undefined, slData.length]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial
          color={isNight ? 0xffeedd : 0xe0ddd5}
          emissive={0xffd888}
          emissiveIntensity={isNight ? 1.5 : 0}
          roughness={0.3}
          metalness={0.1}
        />
      </instancedMesh>
    </group>
  )
})

// ═══════════════════════════════════════════════════
// MAIN SCENE
// ═══════════════════════════════════════════════════
function CityScene({ map, agents, phase, onAgentClick }: {
  map: MapTile[][]
  agents: Agent[]
  phase: Phase
  onAgentClick?: (agentId: string, event?: MouseEvent) => void
}) {
  return (
    <>
      <SceneLighting phase={phase} />
      <DynamicSky phase={phase} />
      <Environment preset={phase === "night" ? "night" : phase === "evening" ? "sunset" : "city"} background={false} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        minDistance={5}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={0.2}
        target={[0, 0, 0]}
      />
      <Terrain map={map} />
      <Roads map={map} />
      <Buildings map={map} phase={phase} />
      <Trees map={map} />
      <WaterSurface map={map} />
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
  onAgentClick?: (agentId: string, event?: MouseEvent) => void
}

export function MapStage({ map, agents, phase, metrics, cameraMode, onAgentClick }: MapStageProps) {
  return (
    <div className="relative flex-1 w-full h-full" style={{ minHeight: 400 }}>
      <Canvas
        className="absolute inset-0"
        camera={{
          position: [25, 22, 25],
          fov: 45,
          near: 0.1,
          far: 500,
        }}
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
      >
        <CityScene map={map} agents={agents} phase={phase} onAgentClick={onAgentClick} />
      </Canvas>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-20 glass-panel rounded-md px-3 py-2 flex flex-col gap-1">
        {[
          { label: "Forest", color: "#3a5828" },
          { label: "Plains", color: "#5a7838" },
          { label: "Water", color: "#1a4868" },
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
