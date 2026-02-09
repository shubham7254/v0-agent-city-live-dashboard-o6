"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Zap,
  CloudRain,
  Sun,
  Moon,
  Heart,
  Flame,
  Shield,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Megaphone,
  Gift,
  Skull,
  PartyPopper,
  X,
} from "lucide-react"
import type { Agent, WorldState } from "@/lib/types"

// ── Reaction system ─────────────────────────────
interface Reaction {
  id: string
  type: string
  icon: string
  x: number
  timestamp: number
}

const REACTIONS = [
  { type: "cheer", icon: "thumbs-up", label: "Cheer", color: "hsl(var(--success))" },
  { type: "boo", icon: "thumbs-down", label: "Boo", color: "hsl(var(--live-red))" },
  { type: "love", icon: "heart", label: "Love", color: "#ec4899" },
  { type: "fire", icon: "flame", label: "Fire", color: "#f97316" },
  { type: "skull", icon: "skull", label: "RIP", color: "#a1a1aa" },
  { type: "party", icon: "party", label: "Party", color: "#eab308" },
] as const

const ReactionIcon = ({ type, className }: { type: string; className?: string }) => {
  const props = { className: className || "h-4 w-4" }
  switch (type) {
    case "thumbs-up": return <ThumbsUp {...props} />
    case "thumbs-down": return <ThumbsDown {...props} />
    case "heart": return <Heart {...props} />
    case "flame": return <Flame {...props} />
    case "skull": return <Skull {...props} />
    case "party": return <PartyPopper {...props} />
    default: return <Zap {...props} />
  }
}

// ── Floating reaction bubbles ───────────────────
function FloatingReactions({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="fixed bottom-24 left-0 right-0 pointer-events-none z-[60] overflow-hidden h-40">
      <AnimatePresence>
        {reactions.map((r) => {
          const reaction = REACTIONS.find((rx) => rx.type === r.type)
          return (
            <motion.div
              key={r.id}
              initial={{ y: 0, opacity: 1, scale: 0.5 }}
              animate={{ y: -120, opacity: 0, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              className="absolute bottom-0"
              style={{ left: `${r.x}%` }}
            >
              <ReactionIcon type={r.icon} className="h-6 w-6" />
              <span className="sr-only">{reaction?.label}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ── Agent quick search ──────────────────────────
function AgentSearch({
  agents,
  onSelect,
  onClose,
}: {
  agents: Agent[]
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return agents.slice(0, 10)
    const q = query.toLowerCase()
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.archetype.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [query, agents])

  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 10, opacity: 0 }}
      className="absolute bottom-full mb-2 left-0 right-0 glass-panel-strong rounded-xl overflow-hidden max-w-sm mx-auto"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--hud-border)/.2)]">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents by name, role, status..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none font-mono"
        />
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto p-1.5">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No agents found</p>
        )}
        {filtered.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => { onSelect(agent.id); onClose() }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
          >
            <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{agent.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground truncate">{agent.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{agent.archetype}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground capitalize">{agent.status.replace("_", " ")}</span>
                <span className="text-[10px] text-muted-foreground/50">|</span>
                <span className="text-[10px] text-muted-foreground">
                  E:{Math.round(agent.energy)} H:{Math.round(agent.hunger)} S:{Math.round(agent.stress)}
                </span>
              </div>
            </div>
            <Eye className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          </button>
        ))}
      </div>
    </motion.div>
  )
}

// ── Main Command Bar ────────────────────────────
interface SpectatorCommandBarProps {
  state: WorldState
  onAgentClick: (agentId: string) => void
  onTriggerTick: () => void
}

export function SpectatorCommandBar({ state, onAgentClick, onTriggerTick }: SpectatorCommandBarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [reactionCooldown, setReactionCooldown] = useState(false)
  const reactionCountRef = useRef(0)

  // Clean up old reactions
  useEffect(() => {
    const interval = setInterval(() => {
      setReactions((prev) => prev.filter((r) => Date.now() - r.timestamp < 2000))
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const sendReaction = useCallback((type: string, icon: string) => {
    if (reactionCooldown) return
    reactionCountRef.current++
    // Rate limit: 5 per second
    if (reactionCountRef.current > 5) {
      setReactionCooldown(true)
      setTimeout(() => { setReactionCooldown(false); reactionCountRef.current = 0 }, 2000)
      return
    }
    setTimeout(() => { reactionCountRef.current = Math.max(0, reactionCountRef.current - 1) }, 1000)

    const newReaction: Reaction = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      icon,
      x: 20 + Math.random() * 60,
      timestamp: Date.now(),
    }
    setReactions((prev) => [...prev.slice(-20), newReaction])
  }, [reactionCooldown])

  // Quick stats
  const activeAgents = state.agents.filter((a) => a.status !== "sleeping").length
  const avgMorale = Math.round(state.metrics.morale)

  return (
    <>
      <FloatingReactions reactions={reactions} />

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
        {/* Search panel */}
        <AnimatePresence>
          {searchOpen && (
            <div className="w-[340px] relative">
              <AgentSearch
                agents={state.agents}
                onSelect={onAgentClick}
                onClose={() => setSearchOpen(false)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Command bar */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 20 }}
          className="glass-panel-strong rounded-2xl px-2 py-1.5 flex items-center gap-1"
        >
          {/* Quick stats */}
          <div className="flex items-center gap-2 px-2.5 py-1 border-r border-[hsl(var(--hud-border)/.15)] mr-1">
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
              <span className="font-mono text-[10px] text-foreground font-bold">{activeAgents}</span>
              <span className="font-mono text-[10px] text-muted-foreground">awake</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart className="h-3 w-3 text-[hsl(var(--success))]" />
              <span className="font-mono text-[10px] text-foreground font-bold">{avgMorale}%</span>
            </div>
          </div>

          {/* Agent search */}
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors ${
              searchOpen ? "bg-primary/15 text-primary" : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
            title="Search agents"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px] font-semibold hidden sm:inline">Find Agent</span>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-[hsl(var(--hud-border)/.15)]" />

          {/* Reactions */}
          <div className="flex items-center gap-0.5">
            {REACTIONS.map((r) => (
              <button
                key={r.type}
                type="button"
                onClick={() => sendReaction(r.type, r.icon)}
                disabled={reactionCooldown}
                className={`p-1.5 rounded-lg transition-all ${
                  reactionCooldown
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:bg-secondary/50 hover:scale-110 active:scale-95"
                }`}
                title={r.label}
                style={{ color: r.color }}
              >
                <ReactionIcon type={r.icon} className="h-4 w-4" />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-[hsl(var(--hud-border)/.15)]" />

          {/* Phase indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1">
            {state.phase === "night" ? (
              <Moon className="h-3.5 w-3.5 text-indigo-400" />
            ) : state.weather === "rain" || state.weather === "storm" ? (
              <CloudRain className="h-3.5 w-3.5 text-blue-400" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span className="font-mono text-[10px] text-foreground font-bold capitalize">{state.phase}</span>
            <span className="font-mono text-[10px] text-muted-foreground">D{state.day}</span>
          </div>

          {/* Advance time */}
          <button
            type="button"
            onClick={onTriggerTick}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
            title="Advance simulation"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px] font-bold hidden sm:inline">Tick</span>
          </button>
        </motion.div>
      </div>
    </>
  )
}
