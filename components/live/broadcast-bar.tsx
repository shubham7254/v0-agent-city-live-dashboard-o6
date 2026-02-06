"use client"

import React from "react"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Wifi, WifiOff, Sun, Moon, CloudRain, CloudLightning, CloudFog, Thermometer, Volume2, VolumeX } from "lucide-react"
import type { Phase, WorldState } from "@/lib/types"

interface BroadcastBarProps {
  day: number
  hour: number
  phase: Phase
  weather: WorldState["weather"]
  paused: boolean
  sseConnected: boolean
  lastUpdate: number | null
  startedAt: number
}

function formatSimHour(hour: number): string {
  const h = hour % 24
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:00 ${ampm}`
}

const PHASE_ICONS: Record<Phase, React.ReactNode> = {
  morning: <Sun className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />,
  day: <Sun className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />,
  evening: <Moon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />,
  night: <Moon className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />,
}

const WEATHER_ICONS: Record<WorldState["weather"], React.ReactNode> = {
  clear: <Sun className="h-3 w-3" />,
  rain: <CloudRain className="h-3 w-3" />,
  storm: <CloudLightning className="h-3 w-3" />,
  fog: <CloudFog className="h-3 w-3" />,
  heat: <Thermometer className="h-3 w-3" />,
}

function formatUptime(startedAt: number): string {
  const diff = Date.now() - startedAt
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function BroadcastBar({
  day,
  hour,
  phase,
  weather,
  paused,
  sseConnected,
  lastUpdate,
  startedAt,
}: BroadcastBarProps) {
  const [uptime, setUptime] = useState("00:00:00")
  const [soundOn, setSoundOn] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(formatUptime(startedAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return (
    <div className="glass-panel-strong flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--hud-border)/.2)]">
      {/* Left */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ opacity: paused ? 0.3 : [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: paused ? 0 : Number.POSITIVE_INFINITY }}
            className="h-2 w-2 rounded-full bg-[hsl(var(--live-red))] live-glow"
          />
          <span className="font-mono text-xs font-bold tracking-widest text-foreground">
            {paused ? "PAUSED" : "LIVE"}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="font-mono text-xs text-muted-foreground">AGENT CITY LIVE</span>
      </div>

      {/* Center */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono text-muted-foreground">DAY</span>
          <span className="font-mono font-bold text-foreground">{day}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs bg-secondary/60 rounded px-2 py-0.5">
          <span className="font-mono font-bold text-foreground">{formatSimHour(hour)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {PHASE_ICONS[phase]}
          <span className="font-mono capitalize text-foreground">{phase}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {WEATHER_ICONS[weather]}
          <span className="font-mono capitalize">{weather}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="font-mono text-xs text-muted-foreground">UP {uptime}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSoundOn(!soundOn)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
        >
          {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          {sseConnected ? (
            <Wifi className="h-3 w-3 text-[hsl(var(--success))]" />
          ) : (
            <WifiOff className="h-3 w-3 text-[hsl(var(--live-red))]" />
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {sseConnected ? "Connected" : "Connecting"}
          </span>
        </div>
        {lastUpdate && (
          <span className="font-mono text-xs text-muted-foreground/50">
            {new Date(lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}
