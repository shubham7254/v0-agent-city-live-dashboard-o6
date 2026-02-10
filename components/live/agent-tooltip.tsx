"use client"

import { motion } from "framer-motion"
import { Zap, Brain, Activity, MapPin, Eye, X } from "lucide-react"
import type { Agent } from "@/lib/types"

interface AgentTooltipProps {
  agent: Agent
  position: { x: number; y: number }
  onViewProfile: () => void
  onClose: () => void
}

const STATUS_DOT: Record<string, string> = {
  sleeping: "bg-indigo-400",
  working: "bg-emerald-400",
  in_council: "bg-blue-400",
  on_watch: "bg-amber-400",
  idle: "bg-zinc-400",
  exploring: "bg-violet-400",
  studying: "bg-cyan-400",
  shopping: "bg-pink-400",
  socializing: "bg-orange-400",
  commuting: "bg-slate-400",
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 flex-1 rounded-full bg-secondary/50 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  )
}

export function AgentTooltip({ agent, position, onViewProfile, onClose }: AgentTooltipProps) {
  // Position the tooltip near the click, clamped to viewport
  const style: React.CSSProperties = {
    left: Math.min(position.x, window.innerWidth - 220),
    top: Math.max(10, position.y - 160),
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 8 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[80] w-52 glass-panel-strong rounded-xl overflow-hidden"
      style={style}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2.5 border-b border-[hsl(var(--hud-border)/.15)]">
        <div className="h-8 w-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">{agent.name[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground truncate">{agent.name}</p>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status] || "bg-zinc-400"}`} />
            <span className="text-[10px] text-muted-foreground capitalize">{agent.status.replace("_", " ")}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground/50 hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Stats */}
      <div className="px-3 py-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] text-muted-foreground w-5">NRG</span>
          <MiniBar value={agent.energy} color="#34d399" />
          <span className="font-mono text-[10px] text-muted-foreground w-5 text-right">{Math.round(agent.energy)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-[10px] text-muted-foreground w-5">HNG</span>
          <MiniBar value={agent.hunger} color="#fbbf24" />
          <span className="font-mono text-[10px] text-muted-foreground w-5 text-right">{Math.round(agent.hunger)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Brain className="h-3 w-3 text-red-400 shrink-0" />
          <span className="text-[10px] text-muted-foreground w-5">STR</span>
          <MiniBar value={agent.stress} color="#f87171" />
          <span className="font-mono text-[10px] text-muted-foreground w-5 text-right">{Math.round(agent.stress)}</span>
        </div>
      </div>

      {/* Latest quote */}
      {agent.recentQuotes.length > 0 && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed line-clamp-2">
            {`"${agent.recentQuotes[0]}"`}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 pb-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onViewProfile}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
        >
          <Eye className="h-3 w-3" />
          <span className="text-[10px] font-bold">Full Profile</span>
        </button>
        <div className="flex items-center gap-1 text-muted-foreground/50">
          <MapPin className="h-3 w-3" />
          <span className="font-mono text-[9px]">({agent.position.x}, {agent.position.y})</span>
        </div>
      </div>
    </motion.div>
  )
}
