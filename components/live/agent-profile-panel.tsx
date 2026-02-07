"use client"

import React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  X,
  Heart,
  Swords,
  MapPin,
  Briefcase,
  BookOpen,
  Moon,
  Zap,
  Brain,
  MessageCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react"
import type { Agent, StoryCategory } from "@/lib/types"

// ── Personality radar bar ────────────────────────
function TraitBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-20 capitalize font-medium">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground w-7 text-right">{Math.round(value)}</span>
    </div>
  )
}

// ── Status badge ─────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  sleeping: { bg: "bg-indigo-500/20", text: "text-indigo-300", label: "Sleeping" },
  working: { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "Working" },
  in_council: { bg: "bg-blue-500/20", text: "text-blue-300", label: "In Council" },
  on_watch: { bg: "bg-amber-500/20", text: "text-amber-300", label: "On Watch" },
  idle: { bg: "bg-zinc-500/20", text: "text-zinc-300", label: "Idle" },
  exploring: { bg: "bg-violet-500/20", text: "text-violet-300", label: "Exploring" },
  studying: { bg: "bg-cyan-500/20", text: "text-cyan-300", label: "Studying" },
  shopping: { bg: "bg-pink-500/20", text: "text-pink-300", label: "Shopping" },
  socializing: { bg: "bg-orange-500/20", text: "text-orange-300", label: "Socializing" },
  commuting: { bg: "bg-slate-500/20", text: "text-slate-300", label: "Commuting" },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { bg: "bg-zinc-500/20", text: "text-zinc-300", label: status }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      {cfg.label}
    </span>
  )
}

// ── Mini vitals gauge ────────────────────────────
function VitalGauge({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Zap; color: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const circumference = 2 * Math.PI * 18
  const offset = circumference - (pct / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-12 w-12">
        <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
          <motion.circle
            cx="22" cy="22" r="18" fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-bold" style={{ color }}>{Math.round(value)}</span>
    </div>
  )
}

// ── Expandable section ───────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = true }: { title: string; icon: typeof Heart; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-[hsl(var(--hud-border)/.15)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-secondary/20 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-primary/70" />
        <span className="font-mono text-[11px] font-bold tracking-wider text-muted-foreground uppercase flex-1 text-left">{title}</span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

// ── Main profile panel ───────────────────────────
interface AgentProfilePanelProps {
  agent: Agent
  allAgents: Agent[]
  onClose: () => void
  onSelectAgent: (agent: Agent) => void
}

export function AgentProfilePanel({ agent, allAgents, onClose, onSelectAgent }: AgentProfilePanelProps) {
  const ageLabel = agent.ageGroup === "child" ? "Child" : agent.ageGroup === "teen" ? "Teen" : agent.ageGroup === "elder" ? "Elder" : "Adult"

  // Resolve names from IDs
  const resolveNames = (ids: string[]) =>
    ids.map((id) => {
      const a = allAgents.find((ag) => ag.id === id || ag.name === id)
      return a ? a : null
    }).filter(Boolean) as Agent[]

  const allies = resolveNames(agent.allies)
  const rivals = resolveNames(agent.rivals)

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute right-0 top-0 bottom-0 w-80 z-50 flex flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, hsl(var(--card)/.97) 0%, hsl(var(--card)/.92) 100%)",
        backdropFilter: "blur(20px)",
        borderLeft: "1px solid hsl(var(--hud-border)/.25)",
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary">{agent.name[0]}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">{agent.name}</h2>
              <p className="text-xs text-muted-foreground">{agent.archetype} &middot; {ageLabel}, {agent.age}y</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close profile"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <StatusBadge status={agent.status} />

        {/* Location */}
        <div className="flex items-center gap-1.5 mt-2 text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span className="text-[11px] font-mono">
            ({agent.position.x}, {agent.position.y})
          </span>
          <span className="text-[10px] ml-auto">
            Rep: <span className="text-foreground font-semibold">{agent.reputation}</span>
            &ensp;Inf: <span className="text-foreground font-semibold">{agent.influence}</span>
          </span>
        </div>
      </div>

      {/* Vitals ring gauges */}
      <div className="px-4 pb-3 flex items-center justify-around shrink-0">
        <VitalGauge label="Energy" value={agent.energy} icon={Zap} color="hsl(var(--success))" />
        <VitalGauge label="Hunger" value={agent.hunger} icon={Activity} color="hsl(var(--warning))" />
        <VitalGauge label="Stress" value={agent.stress} icon={Brain} color="hsl(var(--live-red, 0 84% 60%))" />
      </div>

      {/* Mood History Sparkline */}
      {agent.moodHistory && agent.moodHistory.length > 1 && (
        <div className="px-4 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Mood Over Time</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              Current: <span className="text-foreground font-semibold">{agent.moodHistory[agent.moodHistory.length - 1]}</span>
            </span>
          </div>
          <div className="h-8 rounded-md bg-secondary/30 overflow-hidden relative">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${agent.moodHistory.length - 1} 100`}>
              <defs>
                <linearGradient id={`mood-grad-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={`M0,${100 - agent.moodHistory[0]} ${agent.moodHistory.map((v, i) => `L${i},${100 - v}`).join(" ")} L${agent.moodHistory.length - 1},100 L0,100 Z`}
                fill={`url(#mood-grad-${agent.id})`}
              />
              <polyline
                points={agent.moodHistory.map((v, i) => `${i},${100 - v}`).join(" ")}
                fill="none"
                stroke="hsl(var(--success))"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Life Story */}
        {agent.storyLog && agent.storyLog.length > 0 && (
          <Section title={`Life Story (${agent.storyLog.length})`} icon={BookOpen} defaultOpen={true}>
            <div className="relative pl-4">
              <div className="absolute left-1.5 top-0 bottom-0 w-px bg-[hsl(var(--hud-border)/.2)]" />
              {[...agent.storyLog].reverse().slice(0, 10).map((story) => {
                const categoryColors: Record<StoryCategory, string> = {
                  romance: "bg-pink-500/60",
                  rivalry: "bg-red-500/60",
                  business: "bg-amber-500/60",
                  achievement: "bg-emerald-500/60",
                  misfortune: "bg-orange-500/60",
                  friendship: "bg-blue-500/60",
                  conflict: "bg-red-400/60",
                  discovery: "bg-violet-500/60",
                  celebration: "bg-yellow-400/60",
                }
                return (
                  <div key={story.id} className="relative pb-3 last:pb-0">
                    <div className={`absolute left-[-13px] top-1.5 h-2 w-2 rounded-full ${categoryColors[story.category] ?? "bg-primary/40"}`} />
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-mono text-muted-foreground">Day {story.day}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">|</span>
                      <span className="text-[10px] font-mono capitalize text-muted-foreground">{story.category}</span>
                    </div>
                    <p className="text-[11px] text-foreground/85 font-medium leading-tight">{story.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{story.description}</p>
                    {story.consequence && (
                      <p className="text-[10px] text-primary/70 italic mt-0.5">{story.consequence}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Personality */}
        <Section title="Personality" icon={Brain}>
          <div className="flex flex-col gap-1.5">
            <TraitBar label="Aggression" value={agent.personality.aggression} color="#ef4444" />
            <TraitBar label="Cooperation" value={agent.personality.cooperation} color="#22c55e" />
            <TraitBar label="Curiosity" value={agent.personality.curiosity} color="#a855f7" />
            <TraitBar label="Caution" value={agent.personality.caution} color="#eab308" />
            <TraitBar label="Leadership" value={agent.personality.leadership} color="#3b82f6" />
          </div>
        </Section>

        {/* Schedule */}
        <Section title="Daily Schedule" icon={Clock} defaultOpen={false}>
          <div className="flex flex-col gap-1">
            {[
              { label: "Wake", hour: agent.schedule.wakeHour },
              { label: "Work start", hour: agent.schedule.workStartHour },
              { label: "Lunch", hour: agent.schedule.lunchHour },
              { label: "Work end", hour: agent.schedule.workEndHour },
              { label: "Sleep", hour: agent.schedule.sleepHour },
            ].map((s) => {
              const h = s.hour % 24
              const ampm = h >= 12 ? "PM" : "AM"
              const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
              return (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{s.label}</span>
                  <span className="font-mono text-[11px] text-foreground">{h12}:00 {ampm}</span>
                </div>
              )
            })}
          </div>
          {/* 24h timeline bar */}
          <div className="mt-2 h-3 rounded-full bg-secondary/40 overflow-hidden flex">
            <div
              className="h-full bg-indigo-500/30"
              style={{ width: `${(agent.schedule.wakeHour / 24) * 100}%` }}
              title="Sleeping"
            />
            <div
              className="h-full bg-emerald-500/40"
              style={{ width: `${((agent.schedule.workStartHour - agent.schedule.wakeHour) / 24) * 100}%` }}
              title="Morning free"
            />
            <div
              className="h-full bg-blue-500/40"
              style={{ width: `${((agent.schedule.lunchHour - agent.schedule.workStartHour) / 24) * 100}%` }}
              title="Working (AM)"
            />
            <div
              className="h-full bg-amber-500/30"
              style={{ width: `${(1 / 24) * 100}%` }}
              title="Lunch"
            />
            <div
              className="h-full bg-blue-500/40"
              style={{ width: `${((agent.schedule.workEndHour - agent.schedule.lunchHour - 1) / 24) * 100}%` }}
              title="Working (PM)"
            />
            <div
              className="h-full bg-orange-500/20"
              style={{ width: `${((agent.schedule.sleepHour - agent.schedule.workEndHour) / 24) * 100}%` }}
              title="Evening free"
            />
            <div
              className="h-full bg-indigo-500/30 flex-1"
              title="Sleeping"
            />
          </div>
        </Section>

        {/* Relationship Scores */}
        {agent.relationships && agent.relationships.length > 0 && (
          <Section title={`Relationship Map (${agent.relationships.length})`} icon={Heart}>
            <div className="flex flex-col gap-2">
              {[...agent.relationships]
                .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
                .slice(0, 8)
                .map((rel) => {
                  const target = allAgents.find((ag) => ag.id === rel.targetId)
                  if (!target) return null
                  const isPositive = rel.score >= 0
                  const absScore = Math.abs(rel.score)
                  return (
                    <button
                      key={rel.targetId}
                      type="button"
                      onClick={() => onSelectAgent(target)}
                      className="flex items-center gap-2 hover:bg-secondary/20 rounded-md px-1 py-0.5 transition-colors"
                    >
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${isPositive ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                        <span className={`text-[8px] font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>{target.name[0]}</span>
                      </div>
                      <span className="text-[11px] text-foreground w-16 truncate text-left">{target.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isPositive ? "bg-emerald-500/60" : "bg-red-500/60"}`}
                          style={{ width: `${absScore}%` }}
                        />
                      </div>
                      <span className={`font-mono text-[10px] w-8 text-right ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                        {isPositive ? "+" : ""}{rel.score}
                      </span>
                    </button>
                  )
                })}
            </div>
          </Section>
        )}

        {/* Relationships */}
        <Section title="Allies & Rivals" icon={Heart} defaultOpen={false}>
          {allies.length === 0 && rivals.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No known relationships yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {allies.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-mono text-emerald-400/80 uppercase tracking-wider">Allies</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allies.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelectAgent(a)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <div className="h-4 w-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-emerald-400">{a.name[0]}</span>
                        </div>
                        <span className="text-[11px] text-emerald-300 font-medium">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rivals.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-mono text-red-400/80 uppercase tracking-wider">Rivals</span>
                  <div className="flex flex-wrap gap-1.5">
                    {rivals.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectAgent(r)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      >
                        <div className="h-4 w-4 rounded-full bg-red-500/20 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-red-400">{r.name[0]}</span>
                        </div>
                        <span className="text-[11px] text-red-300 font-medium">{r.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Recent quotes */}
        <Section title="Recent Quotes" icon={MessageCircle}>
          {agent.recentQuotes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No quotes recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {agent.recentQuotes.slice(0, 5).map((q, i) => (
                <div key={i} className="pl-3 border-l-2 border-primary/25">
                  <p className="text-[12px] text-foreground/85 italic leading-relaxed">{`"${q}"`}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Recent actions / timeline */}
        <Section title="Activity Timeline" icon={Briefcase}>
          {agent.recentActions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No actions recorded yet.</p>
          ) : (
            <div className="relative pl-4">
              <div className="absolute left-1.5 top-0 bottom-0 w-px bg-[hsl(var(--hud-border)/.2)]" />
              {agent.recentActions.slice(0, 8).map((action, i) => (
                <div key={i} className="relative pb-2.5 last:pb-0">
                  <div className="absolute left-[-13px] top-1 h-2 w-2 rounded-full bg-primary/40 border border-primary/60" />
                  <p className="text-[11px] text-foreground/75 leading-relaxed">{action}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Vote history */}
        <Section title="Vote History" icon={Moon} defaultOpen={false}>
          {agent.voteHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No votes cast yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {agent.voteHistory.map((v, i) => (
                <div
                  key={i}
                  className={`h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
                    v === "yes"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : v === "no"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                  }`}
                  title={`Vote ${i + 1}: ${v}`}
                >
                  {v === "yes" ? "Y" : v === "no" ? "N" : "A"}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </motion.div>
  )
}
