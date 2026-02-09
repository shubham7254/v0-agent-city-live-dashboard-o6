"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Trophy,
  Star,
  Users,
  Sunrise,
  Flame,
  Shield,
  Heart,
  Skull,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  X,
} from "lucide-react"
import type { WorldState, WorldEvent } from "@/lib/types"

interface Achievement {
  id: string
  title: string
  description: string
  icon: "trophy" | "star" | "users" | "sunrise" | "flame" | "shield" | "heart" | "skull" | "sparkles" | "trending" | "alert"
  color: string
  timestamp: number
}

const ICON_MAP = {
  trophy: Trophy,
  star: Star,
  users: Users,
  sunrise: Sunrise,
  flame: Flame,
  shield: Shield,
  heart: Heart,
  skull: Skull,
  sparkles: Sparkles,
  trending: TrendingUp,
  alert: AlertTriangle,
}

// ── Milestone detection logic ───────────────────
function detectAchievements(
  state: WorldState,
  prevStateRef: React.MutableRefObject<{
    day: number
    tick: number
    morale: number
    unrest: number
    population: number
    councilActive: boolean
  } | null>
): Achievement[] {
  const achievements: Achievement[] = []
  const prev = prevStateRef.current
  const now = Date.now()

  if (!prev) return achievements

  // Day milestone achievements
  if (state.day !== prev.day) {
    if (state.day === 5) {
      achievements.push({
        id: `day5_${now}`,
        title: "First Week Survived",
        description: "The settlement has survived 5 days",
        icon: "sunrise",
        color: "hsl(var(--success))",
        timestamp: now,
      })
    }
    if (state.day === 10) {
      achievements.push({
        id: `day10_${now}`,
        title: "Established Settlement",
        description: "10 days of civilization",
        icon: "star",
        color: "#eab308",
        timestamp: now,
      })
    }
    if (state.day === 25) {
      achievements.push({
        id: `day25_${now}`,
        title: "Thriving Community",
        description: "25 days and still going strong",
        icon: "trophy",
        color: "#f97316",
        timestamp: now,
      })
    }
    if (state.day === 50) {
      achievements.push({
        id: `day50_${now}`,
        title: "City Founders",
        description: "50 days -- a city is born",
        icon: "sparkles",
        color: "#a855f7",
        timestamp: now,
      })
    }
    if (state.day % 10 === 0 && state.day > 50) {
      achievements.push({
        id: `day${state.day}_${now}`,
        title: `Day ${state.day} Milestone`,
        description: `The settlement endures after ${state.day} days`,
        icon: "trending",
        color: "hsl(var(--primary))",
        timestamp: now,
      })
    }
  }

  // Morale milestones
  if (state.metrics.morale >= 80 && prev.morale < 80) {
    achievements.push({
      id: `highmorale_${now}`,
      title: "Golden Age",
      description: "Settlement morale has risen above 80%",
      icon: "heart",
      color: "#ec4899",
      timestamp: now,
    })
  }
  if (state.metrics.morale <= 20 && prev.morale > 20) {
    achievements.push({
      id: `lowmorale_${now}`,
      title: "Dark Times",
      description: "Morale has dropped below 20% -- the settlement struggles",
      icon: "skull",
      color: "hsl(var(--live-red))",
      timestamp: now,
    })
  }

  // Unrest milestones
  if (state.metrics.unrest >= 70 && prev.unrest < 70) {
    achievements.push({
      id: `highunrest_${now}`,
      title: "On the Brink",
      description: "Unrest has exceeded 70% -- rebellion looms",
      icon: "flame",
      color: "#ef4444",
      timestamp: now,
    })
  }
  if (state.metrics.unrest <= 10 && prev.unrest > 10) {
    achievements.push({
      id: `peace_${now}`,
      title: "Era of Peace",
      description: "Unrest has dropped below 10%",
      icon: "shield",
      color: "hsl(var(--success))",
      timestamp: now,
    })
  }

  // Council started
  if (state.councilActive && !prev.councilActive) {
    achievements.push({
      id: `council_${now}`,
      title: "Council Convened",
      description: "The council is now in session -- agents debate the future",
      icon: "users",
      color: "hsl(var(--primary))",
      timestamp: now,
    })
  }

  // Critical events
  const criticalEvents = state.recentEvents.filter(
    (e) => e.severity === "critical" && e.timestamp > (prev.tick ?? 0)
  )
  if (criticalEvents.length > 0) {
    achievements.push({
      id: `critical_${now}`,
      title: "Crisis Event",
      description: criticalEvents[0].description,
      icon: "alert",
      color: "hsl(var(--live-red))",
      timestamp: now,
    })
  }

  return achievements
}

// ── Toast component ─────────────────────────────
function AchievementToast({
  achievement,
  onDismiss,
}: {
  achievement: Achievement
  onDismiss: () => void
}) {
  const Icon = ICON_MAP[achievement.icon]

  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <motion.div
      layout
      initial={{ x: 320, opacity: 0, scale: 0.8 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 320, opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="glass-panel-strong rounded-xl px-4 py-3 flex items-start gap-3 max-w-xs cursor-pointer hover:bg-secondary/30 transition-colors"
      onClick={onDismiss}
    >
      <div
        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${achievement.color}20` }}
      >
        <Icon className="h-5 w-5" style={{ color: achievement.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground leading-tight">{achievement.title}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{achievement.description}</p>
      </div>
      <button type="button" onClick={onDismiss} className="text-muted-foreground/50 hover:text-foreground shrink-0 mt-0.5">
        <X className="h-3 w-3" />
      </button>
      {/* Auto-dismiss progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 6, ease: "linear" }}
        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl origin-left"
        style={{ backgroundColor: achievement.color }}
      />
    </motion.div>
  )
}

// ── Main export ─────────────────────────────────
interface AchievementToastsProps {
  state: WorldState
}

export function AchievementToasts({ state }: AchievementToastsProps) {
  const [toasts, setToasts] = useState<Achievement[]>([])
  const prevStateRef = useRef<{
    day: number
    tick: number
    morale: number
    unrest: number
    population: number
    councilActive: boolean
  } | null>(null)

  useEffect(() => {
    if (prevStateRef.current) {
      const newAchievements = detectAchievements(state, prevStateRef)
      if (newAchievements.length > 0) {
        setToasts((prev) => [...prev, ...newAchievements].slice(-5))
      }
    }
    prevStateRef.current = {
      day: state.day,
      tick: state.tick,
      morale: state.metrics.morale,
      unrest: state.metrics.unrest,
      population: state.metrics.population,
      councilActive: state.councilActive,
    }
  }, [state.day, state.tick, state.metrics.morale, state.metrics.unrest, state.councilActive])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <div className="fixed top-16 right-4 z-[70] flex flex-col gap-2 pointer-events-auto">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <AchievementToast
            key={toast.id}
            achievement={toast}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
