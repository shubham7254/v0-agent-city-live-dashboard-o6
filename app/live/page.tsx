"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { motion, AnimatePresence } from "framer-motion"
import { Camera, Radio, Play, ChevronLeft, ChevronRight, MessageSquare, X } from "lucide-react"
import { useSimulation } from "@/hooks/use-simulation"
import { BroadcastBar } from "@/components/live/broadcast-bar"

const MapStage = dynamic(
  () => import("@/components/live/map-stage").then((m) => m.MapStage),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading 3D world...</div> }
)
import { AgentRail } from "@/components/live/agent-rail"
import { AgentProfilePanel } from "@/components/live/agent-profile-panel"
import { CouncilChamber } from "@/components/live/council-chamber"
import { NewsModules } from "@/components/live/news-modules"
import { Sparkline } from "@/components/live/sparkline"
import { Button } from "@/components/ui/button"
import type { Agent, CameraMode } from "@/lib/types"

const CAMERA_MODES: { value: CameraMode; label: string }[] = [
  { value: "wide", label: "Wide View" },
  { value: "follow_events", label: "Follow Events" },
  { value: "free", label: "Free Camera" },
]

function formatRealTime(): string {
  const now = new Date()
  return now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatSimHour(hour: number): string {
  const h = hour % 24
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:00 ${ampm}`
}

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
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [councilOpen, setCouncilOpen] = useState(false)
  const [realClock, setRealClock] = useState(formatRealTime())
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const handleAgentClick = useCallback((agentId: string) => {
    if (!state) return
    const agent = state.agents.find((a) => a.id === agentId || a.name === agentId)
    if (agent) setSelectedAgent(agent)
  }, [state])

  // Keep selectedAgent data fresh when state updates
  const liveSelectedAgent = useMemo(() => {
    if (!selectedAgent || !state) return null
    return state.agents.find((a) => a.id === selectedAgent.id) ?? selectedAgent
  }, [selectedAgent, state])

  // Update real clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRealClock(formatRealTime())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-initialize state if empty
  useEffect(() => {
    if (!isLoading && !state && !initialized) {
      setInitialized(true)
      triggerTick()
    }
  }, [isLoading, state, initialized, triggerTick])

  // Real-time sync: tick every 30 seconds to stay in sync with the real clock
  // The engine reads the actual system clock, so ticks just trigger updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (state && !state.paused) {
        triggerTick()
      }
    }, 15000) // 15s polling for lively updates
    return () => clearInterval(interval)
  }, [state, triggerTick])

  // Auto-open council panel when meeting starts
  useEffect(() => {
    if (state?.councilActive) {
      setCouncilOpen(true)
    }
  }, [state?.councilActive])

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

  const councilSoonHours = state.council.nextCouncilIn
  const meetingAnnouncement = state.councilActive
    ? "COUNCIL MEETING IN SESSION"
    : councilSoonHours <= 3 && councilSoonHours > 0
    ? `Council meeting in ${councilSoonHours} hour${councilSoonHours > 1 ? "s" : ""}`
    : null

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Background noise */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 noise-bg" />
      </div>

      {/* Broadcast bar */}
      <div className="relative z-30 shrink-0">
        <BroadcastBar
          day={state.day}
          hour={state.hour}
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
            className="relative z-20 shrink-0 bg-[hsl(var(--live-red)/.15)] border-b border-[hsl(var(--live-red)/.3)] px-4 py-1.5 overflow-hidden"
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

      {/* Council meeting announcement banner */}
      <AnimatePresence>
        {meetingAnnouncement && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-20 shrink-0 overflow-hidden"
          >
            <div
              className={`px-4 py-2 flex items-center justify-between ${
                state.councilActive
                  ? "bg-primary/15 border-b border-primary/30"
                  : "bg-[hsl(var(--warning)/.1)] border-b border-[hsl(var(--warning)/.3)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <MessageSquare className={`h-4 w-4 ${state.councilActive ? "text-primary" : "text-[hsl(var(--warning))]"}`} />
                <span className={`font-mono text-xs font-bold tracking-wider ${state.councilActive ? "text-primary" : "text-[hsl(var(--warning))]"}`}>
                  {meetingAnnouncement}
                </span>
                {state.councilActive && (
                  <span className="text-xs text-muted-foreground">
                    {formatSimHour(state.council.startHour)} - {formatSimHour(state.council.endHour)}
                  </span>
                )}
              </div>
              {state.councilActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 font-mono text-xs text-primary hover:text-primary hover:bg-primary/10"
                  onClick={() => setCouncilOpen(true)}
                >
                  <MessageSquare className="h-3 w-3" />
                  View Full Meeting
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content: map takes almost all space */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        {/* Slide-out left panel: News */}
        <AnimatePresence>
          {leftPanelOpen && (
            <motion.div
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute left-0 top-0 bottom-0 w-72 z-40 glass-panel-strong border-r border-[hsl(var(--hud-border)/.2)] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--hud-border)/.2)]">
                <span className="font-mono text-xs font-bold text-foreground tracking-wider">NEWS FEED</span>
                <button type="button" onClick={() => setLeftPanelOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-2">
                <NewsModules news={state.news} humanEvents={state.humanEvents} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Slide-out right panel: Agents */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.div
              initial={{ x: 280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 280, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute right-0 top-0 bottom-0 w-72 z-40 glass-panel-strong border-l border-[hsl(var(--hud-border)/.2)] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--hud-border)/.2)]">
                <span className="font-mono text-xs font-bold text-foreground tracking-wider">AGENTS</span>
                <button type="button" onClick={() => setRightPanelOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-2">
                <AgentRail agents={state.agents} onAgentClick={handleAgentClick} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Council slide-up panel */}
        <AnimatePresence>
          {councilOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute inset-x-0 bottom-0 z-50 h-[60vh] glass-panel-strong border-t border-[hsl(var(--hud-border)/.3)] rounded-t-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--hud-border)/.2)] shrink-0">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span className="font-mono text-sm font-bold text-foreground tracking-wider">COUNCIL CHAMBER</span>
                  {state.councilActive && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold animate-pulse">
                      LIVE
                    </span>
                  )}
                </div>
                <button type="button" onClick={() => setCouncilOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <CouncilChamber council={state.council} agents={state.agents} humanEvents={state.humanEvents} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left edge toggle */}
        <button
          type="button"
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 glass-panel rounded-r-lg px-1 py-4 hover:bg-secondary/50 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Right edge toggle */}
        <button
          type="button"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-30 glass-panel rounded-l-lg px-1 py-4 hover:bg-secondary/50 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Full-bleed map */}
        <div className="flex-1 flex flex-col">
          {/* Top bar overlaying the map */}
          <div className="absolute top-2 left-10 right-10 z-20 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={cycleCameraMode}
                className="glass-panel rounded-md px-2.5 py-1.5 flex items-center gap-1.5 hover:border-[hsl(var(--primary)/.3)] transition-colors"
              >
                <Camera className="h-3 w-3 text-primary" />
                <span className="font-mono text-xs text-foreground capitalize">
                  {CAMERA_MODES.find((m) => m.value === cameraMode)?.label}
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 font-mono text-xs text-muted-foreground hover:text-foreground glass-panel rounded-md"
                onClick={triggerTick}
              >
                <Radio className="h-3 w-3" />
                Sync
              </Button>
              {/* Real-time clock display */}
              <div className="glass-panel rounded-md px-3 py-1.5 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
                <span className="font-mono text-xs font-bold text-foreground">
                  {realClock}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  real time
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <Sparkline data={moraleHistory} color="hsl(var(--success))" label="MRL" />
              <Sparkline data={foodHistory} color="hsl(var(--warning))" label="FOOD" />
              <Sparkline data={unrestHistory} color="hsl(var(--live-red))" label="UNR" />
            </div>
          </div>

          {/* Live event feed (floating on bottom-left) */}
          {state.recentEvents.length > 0 && (
            <div className="absolute bottom-4 left-4 z-20 w-80 max-h-[200px] overflow-hidden pointer-events-none">
              <div className="space-y-1">
                <AnimatePresence initial={false}>
                  {state.recentEvents.slice(0, 6).map((evt, i) => {
                    const isAmbient = evt.type === "ambient"
                    const isHighSeverity = evt.severity === "high"
                    const involvedNames = evt.involvedAgents
                      ?.map((aid: string) => state.agents.find((a) => a.id === aid)?.name)
                      .filter(Boolean)
                      .join(", ")
                    return (
                      <motion.div
                        key={evt.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1 - i * 0.12, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className={`glass-panel rounded-md px-3 py-1.5 pointer-events-auto ${
                          isHighSeverity ? "border-[hsl(var(--live-red)/.4)]" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 shrink-0 h-1.5 w-1.5 rounded-full ${
                            isHighSeverity ? "bg-[hsl(var(--live-red))]" :
                            isAmbient ? "bg-muted-foreground/50" :
                            "bg-primary/70"
                          }`} />
                          <div className="min-w-0">
                            <p className={`text-[11px] leading-tight ${
                              isAmbient ? "text-muted-foreground italic" : "text-foreground"
                            }`}>
                              {evt.description}
                            </p>
                            {involvedNames && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {involvedNames}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Council button when there's dialogue */}
          {state.council.dialogue.length > 0 && !councilOpen && (
            <button
              type="button"
              onClick={() => setCouncilOpen(true)}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 glass-panel-strong rounded-full px-4 py-2 flex items-center gap-2 hover:border-primary/40 transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="font-mono text-xs font-semibold text-foreground">
                {state.councilActive ? "View Live Council Meeting" : `Last Council (Day ${state.council.day})`}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {state.council.dialogue.length} messages
              </span>
            </button>
          )}

          {/* Agent profile panel */}
          <AnimatePresence>
            {liveSelectedAgent && (
              <AgentProfilePanel
                agent={liveSelectedAgent}
                allAgents={state.agents}
                onClose={() => setSelectedAgent(null)}
                onSelectAgent={(a) => setSelectedAgent(a)}
              />
            )}
          </AnimatePresence>

          {/* Map fills entire area */}
          <MapStage
            map={state.map}
            agents={state.agents}
            phase={state.phase}
            metrics={liveMetrics}
            cameraMode={cameraMode}
            onAgentClick={handleAgentClick}
          />
        </div>
      </div>
    </div>
  )
}
