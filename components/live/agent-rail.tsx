"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Shield, Swords, Heart } from "lucide-react"
import type { Agent } from "@/lib/types"
import { ScrollArea } from "@/components/ui/scroll-area" // force HMR reload

interface AgentRailProps {
  agents: Agent[]
  onAgentClick?: (agentId: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  sleeping: "bg-muted-foreground/40",
  working: "bg-[hsl(var(--success))]",
  in_council: "bg-[hsl(var(--primary))]",
  on_watch: "bg-[hsl(var(--warning))]",
  idle: "bg-muted-foreground/60",
  exploring: "bg-[hsl(var(--chart-5))]",
  studying: "bg-[hsl(var(--primary)/.7)]",
  shopping: "bg-pink-500/70",
  socializing: "bg-amber-400/70",
  commuting: "bg-muted-foreground/50",
}

function MeterBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 w-full">
      <span className="font-mono text-[10px] text-muted-foreground w-6 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground w-6 text-right">{Math.round(value)}</span>
    </div>
  )
}

function AgentChip({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full glass-panel rounded-lg p-3 flex flex-col gap-2 hover:border-[hsl(var(--primary)/.3)] transition-all text-left"
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">{agent.name[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{agent.name}</p>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${STATUS_COLORS[agent.status]} text-foreground`}>
              {agent.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{agent.archetype}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <MeterBar value={agent.energy} color="hsl(var(--success))" label="NRG" />
        <MeterBar value={agent.hunger} color="hsl(var(--warning))" label="HNG" />
        <MeterBar value={agent.stress} color="hsl(var(--live-red))" label="STR" />
      </div>

      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${agent.influence}%` }}
        />
      </div>
    </button>
  )
}

function AgentDrawer({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className="absolute inset-0 z-50 glass-panel-strong overflow-auto"
    >
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{agent.name[0]}</span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{agent.name}</h3>
          <p className="text-xs text-muted-foreground">{agent.archetype} &middot; {agent.age}y</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close drawer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Personality sliders */}
        <div className="flex flex-col gap-2">
          <h4 className="font-mono text-xs text-muted-foreground tracking-wider">PERSONALITY</h4>
          {Object.entries(agent.personality).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 capitalize">{key}</span>
              <div className="flex-1 h-1.5 rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary/50" style={{ width: `${val}%` }} />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground w-6 text-right">{val}</span>
            </div>
          ))}
        </div>

        {/* Recent quotes */}
        <div className="flex flex-col gap-2">
          <h4 className="font-mono text-xs text-muted-foreground tracking-wider">RECENT QUOTES</h4>
          {agent.recentQuotes.map((q, i) => (
            <p key={i} className="text-sm text-foreground/80 italic pl-3 border-l-2 border-primary/30">
              {`"${q}"`}
            </p>
          ))}
        </div>

        {/* Recent actions */}
        <div className="flex flex-col gap-1.5">
          <h4 className="font-mono text-xs text-muted-foreground tracking-wider">RECENT ACTIONS</h4>
          {agent.recentActions.slice(0, 5).map((a, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {a}
            </p>
          ))}
        </div>

        {/* Relationships */}
        <div className="flex flex-col gap-2">
          <h4 className="font-mono text-xs text-muted-foreground tracking-wider">RELATIONSHIPS</h4>
          {agent.allies.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Heart className="h-3 w-3 text-[hsl(var(--success))]" />
              {agent.allies.map((id) => (
                <span key={id} className="text-xs glass-panel rounded px-1.5 py-0.5 text-foreground">{id}</span>
              ))}
            </div>
          )}
          {agent.rivals.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Swords className="h-3 w-3 text-[hsl(var(--live-red))]" />
              {agent.rivals.map((id) => (
                <span key={id} className="text-xs glass-panel rounded px-1.5 py-0.5 text-foreground">{id}</span>
              ))}
            </div>
          )}
        </div>

        {/* Vote history */}
        <div className="flex flex-col gap-2">
          <h4 className="font-mono text-xs text-muted-foreground tracking-wider">VOTE HISTORY</h4>
          <div className="flex items-center gap-1">
            {agent.voteHistory.map((v, i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                  v === "yes"
                    ? "bg-[hsl(var(--success)/.3)] text-[hsl(var(--success))]"
                    : v === "no"
                      ? "bg-[hsl(var(--live-red)/.3)] text-[hsl(var(--live-red))]"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {v === "yes" ? "Y" : v === "no" ? "N" : "A"}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function AgentRail({ agents, onAgentClick }: AgentRailProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  return (
    <div className="relative w-64 shrink-0 flex flex-col glass-panel rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-[hsl(var(--hud-border)/.2)] flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-xs font-semibold tracking-wider text-foreground">AGENTS</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{agents.length}</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-2">
          {agents.map((agent) => (
            <AgentChip key={agent.id} agent={agent} onClick={() => {
              if (onAgentClick) onAgentClick(agent.id)
              else setSelectedAgent(agent)
            }} />
          ))}
        </div>
      </ScrollArea>

      <AnimatePresence>
        {selectedAgent && <AgentDrawer agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
      </AnimatePresence>
    </div>
  )
}
