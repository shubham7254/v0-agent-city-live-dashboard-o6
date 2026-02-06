"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Camera, Radio, Play } from "lucide-react"
import { useSimulation } from "@/hooks/use-simulation"
import { BroadcastBar } from "@/components/live/broadcast-bar"
import { MapStage } from "@/components/live/map-stage"
import { AgentRail } from "@/components/live/agent-rail"
import { CouncilChamber } from "@/components/live/council-chamber"
import { NewsModules } from "@/components/live/news-modules"
import { TimelapseScrubber } from "@/components/live/timelapse-scrubber"
import { Sparkline } from "@/components/live/sparkline"
import { Button } from "@/components/ui/button"
import type { CameraMode } from "@/lib/types"

const CAMERA_MODES: { value: CameraMode; label: string }[] = [
  { value: "wide", label: "Wide View" },
  { value: "follow_events", label: "Follow Events" },
  { value: "free", label: "Free Camera" },
]

export default function LivePage() {
  const {
    state,
    snapshots,
    liveMetrics,
    breakingNews,
    sseStatus,
    isLoading,
    triggerTick,
  } = useSimulation()

  const [cameraMode, setCameraMode] = useState<CameraMode>("wide")
  const [initialized, setInitialized] = useState(false)

  // Auto-initialize state if empty
  useEffect(() => {
    if (!isLoading && !state && !initialized) {
      setInitialized(true)
      triggerTick()
    }
  }, [isLoading, state, initialized, triggerTick])

  // Auto-tick every 12 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (state && !state.paused) {
        triggerTick()
      }
    }, 12000)
    return () => clearInterval(interval)
  }, [state, triggerTick])

  const moraleHistory = useMemo(
    () => [...snapshots].reverse().slice(-30).map((s) => s.metrics.morale),
    [snapshots]
  )
  const foodHistory = useMemo(
    () => [...snapshots].reverse().slice(-30).map((s) => s.metrics.foodDays),
    [snapshots]
  )
  const unrestHistory = useMemo(
    () => [...snapshots].reverse().slice(-30).map((s) => s.metrics.unrest),
    [snapshots]
  )

  const cycleCameraMode = useCallback(() => {
    setCameraMode((prev) => {
      const idx = CAMERA_MODES.findIndex((m) => m.value === prev)
      return CAMERA_MODES[(idx + 1) % CAMERA_MODES.length].value
    })
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
            className="h-3 w-3 rounded-full bg-primary"
          />
          <span className="font-mono text-sm text-muted-foreground">Connecting to simulation...</span>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span className="font-mono text-sm text-muted-foreground">Initializing world state...</span>
          <Button onClick={triggerTick} variant="outline" className="gap-2 bg-transparent text-foreground">
            <Play className="h-4 w-4" />
            Start Simulation
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 noise-bg" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background))_100%)] opacity-80" />
      </div>

      {/* Broadcast bar */}
      <div className="relative z-30">
        <BroadcastBar
          day={state.day}
          phase={state.phase}
          weather={state.weather}
          paused={state.paused}
          sseConnected={sseStatus.connected}
          lastUpdate={sseStatus.lastUpdate}
          startedAt={state.startedAt}
        />
      </div>

      {/* Breaking news ticker */}
      <AnimatePresence>
        {breakingNews && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-20 bg-[hsl(var(--live-red)/.15)] border-b border-[hsl(var(--live-red)/.3)] px-4 py-1.5 overflow-hidden"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold tracking-wider text-[hsl(var(--live-red))] px-1.5 py-0.5 bg-[hsl(var(--live-red)/.2)] rounded">
                BREAKING
              </span>
              <span className="text-xs font-medium text-foreground">{breakingNews}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        {/* Left rail: News */}
        <div className="w-64 shrink-0 flex flex-col gap-2 p-2 overflow-y-auto">
          <NewsModules news={state.news} humanEvents={state.humanEvents} />
        </div>

        {/* Center stage */}
        <div className="flex-1 flex flex-col gap-2 p-2 min-w-0">
          {/* Camera mode toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cycleCameraMode}
                className="glass-panel rounded-md px-2 py-1 flex items-center gap-1.5 hover:border-[hsl(var(--primary)/.3)] transition-colors"
              >
                <Camera className="h-3 w-3 text-primary" />
                <span className="font-mono text-xs text-foreground capitalize">
                  {CAMERA_MODES.find((m) => m.value === cameraMode)?.label}
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                onClick={triggerTick}
              >
                <Radio className="h-3 w-3" />
                Tick
              </Button>
            </div>

            {/* Mini sparklines */}
            <div className="flex items-center gap-2">
              <Sparkline data={moraleHistory} color="hsl(var(--success))" label="MRL" />
              <Sparkline data={foodHistory} color="hsl(var(--warning))" label="FOOD" />
              <Sparkline data={unrestHistory} color="hsl(var(--live-red))" label="UNR" />
            </div>
          </div>

          {/* Map */}
          <MapStage
            map={state.map}
            agents={state.agents}
            phase={state.phase}
            metrics={liveMetrics}
            cameraMode={cameraMode}
          />

          {/* Timelapse + Council */}
          <div className="flex gap-2">
            <div className="flex-1">
              <TimelapseScrubber snapshots={snapshots} currentTick={state.tick} />
            </div>
          </div>

          {/* Council */}
          <CouncilChamber council={state.council} agents={state.agents} />
        </div>

        {/* Right rail: Agents */}
        <div className="p-2">
          <AgentRail agents={state.agents} />
        </div>
      </div>
    </div>
  )
}
