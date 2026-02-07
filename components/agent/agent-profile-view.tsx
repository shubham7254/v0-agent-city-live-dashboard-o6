"use client"

import Link from "next/link"
import { ArrowLeft, MapPin, Zap, Brain, Heart, Swords, BookOpen, Clock, Activity, Share2, Copy, Check } from "lucide-react"
import type { Agent, Phase, StoryCategory } from "@/lib/types"
import { useState } from "react"

interface RelationshipWithName {
  targetId: string
  score: number
  history: string[]
  targetName: string
}

interface AgentWithNames extends Omit<Agent, "relationships"> {
  relationships: RelationshipWithName[]
  allyNames: string[]
  rivalNames: string[]
}

interface AgentProfileViewProps {
  agent: AgentWithNames
  day: number
  phase: Phase
  weather: string
  allAgentNames: string[]
}

const STATUS_LABELS: Record<string, string> = {
  sleeping: "Sleeping", working: "Working", in_council: "In Council",
  on_watch: "On Watch", idle: "Idle", exploring: "Exploring",
  studying: "Studying", shopping: "Shopping", socializing: "Socializing",
  commuting: "Commuting",
}

const CATEGORY_COLORS: Record<StoryCategory, string> = {
  romance: "border-l-pink-500", rivalry: "border-l-red-500", business: "border-l-amber-500",
  achievement: "border-l-emerald-500", misfortune: "border-l-orange-500", friendship: "border-l-blue-500",
  conflict: "border-l-red-400", discovery: "border-l-violet-500", celebration: "border-l-yellow-400",
}

function TraitBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-28 capitalize">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ backgroundColor: color, width: `${value}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground w-8 text-right">{Math.round(value)}</span>
    </div>
  )
}

function VitalCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Zap; color: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col items-center gap-2">
      <div className="relative h-14 w-14">
        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
          <circle
            cx="22" cy="22" r="18" fill="none"
            stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 18}
            strokeDashoffset={2 * Math.PI * 18 - (Math.max(0, Math.min(100, value)) / 100) * 2 * Math.PI * 18}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-bold" style={{ color }}>{Math.round(value)}</span>
    </div>
  )
}

export function AgentProfileView({ agent, day, phase, weather, allAgentNames }: AgentProfileViewProps) {
  const [copied, setCopied] = useState(false)
  const ageLabel = agent.ageGroup === "child" ? "Child" : agent.ageGroup === "teen" ? "Teen" : agent.ageGroup === "elder" ? "Elder" : "Adult"

  const handleShare = async () => {
    const url = `${window.location.origin}/agent/${encodeURIComponent(agent.name)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 noise-bg" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-8">
        {/* Nav bar */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/live" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="font-mono text-sm">Back to Live</span>
          </Link>
          <button
            type="button"
            onClick={handleShare}
            className="glass-panel rounded-full px-4 py-2 flex items-center gap-2 hover:border-primary/40 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> : <Share2 className="h-3.5 w-3.5 text-primary" />}
            <span className="font-mono text-xs">{copied ? "Copied!" : "Share Profile"}</span>
          </button>
        </div>

        {/* Hero */}
        <div className="glass-panel-strong rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-5">
            <div className="h-20 w-20 rounded-2xl bg-primary/15 border-2 border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-3xl font-bold text-primary">{agent.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground text-balance">{agent.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{agent.archetype} &middot; {ageLabel}, age {agent.age}</p>
              <div className="flex items-center flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                  {STATUS_LABELS[agent.status] ?? agent.status}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-muted-foreground bg-secondary/40">
                  <MapPin className="h-3 w-3" />
                  ({agent.position.x}, {agent.position.y})
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Rep: <span className="text-foreground font-semibold">{agent.reputation}</span>
                  &ensp;Influence: <span className="text-foreground font-semibold">{agent.influence}</span>
                </span>
              </div>
            </div>
          </div>

          {/* World context bar */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[hsl(var(--hud-border)/.15)] text-xs text-muted-foreground font-mono">
            <span>Day {day}</span>
            <span className="capitalize">{phase}</span>
            <span className="capitalize">{weather}</span>
          </div>
        </div>

        {/* Vitals */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <VitalCard label="Energy" value={agent.energy} icon={Zap} color="hsl(var(--success))" />
          <VitalCard label="Hunger" value={agent.hunger} icon={Activity} color="hsl(var(--warning))" />
          <VitalCard label="Stress" value={agent.stress} icon={Brain} color="hsl(var(--live-red, 0 84% 60%))" />
        </div>

        {/* Mood History */}
        {agent.moodHistory && agent.moodHistory.length > 1 && (
          <div className="glass-panel rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">Mood Over Time</h2>
              <span className="font-mono text-xs text-muted-foreground">
                Current: <span className="text-foreground font-semibold">{agent.moodHistory[agent.moodHistory.length - 1]}</span>
              </span>
            </div>
            <div className="h-16 rounded-lg bg-secondary/20 overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${agent.moodHistory.length - 1} 100`}>
                <defs>
                  <linearGradient id="mood-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path
                  d={`M0,${100 - agent.moodHistory[0]} ${agent.moodHistory.map((v, i) => `L${i},${100 - v}`).join(" ")} L${agent.moodHistory.length - 1},100 L0,100 Z`}
                  fill="url(#mood-fill)"
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

        {/* Personality */}
        <div className="glass-panel rounded-2xl p-5 mb-6">
          <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase mb-4">Personality</h2>
          <div className="flex flex-col gap-2.5">
            <TraitBar label="Aggression" value={agent.personality.aggression} color="#ef4444" />
            <TraitBar label="Cooperation" value={agent.personality.cooperation} color="#22c55e" />
            <TraitBar label="Curiosity" value={agent.personality.curiosity} color="#a855f7" />
            <TraitBar label="Caution" value={agent.personality.caution} color="#eab308" />
            <TraitBar label="Leadership" value={agent.personality.leadership} color="#3b82f6" />
          </div>
        </div>

        {/* Schedule */}
        <div className="glass-panel rounded-2xl p-5 mb-6">
          <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase mb-4 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Daily Schedule
          </h2>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { label: "Wake", hour: agent.schedule.wakeHour },
              { label: "Work", hour: agent.schedule.workStartHour },
              { label: "Lunch", hour: agent.schedule.lunchHour },
              { label: "Off", hour: agent.schedule.workEndHour },
              { label: "Sleep", hour: agent.schedule.sleepHour },
            ].map((s) => {
              const h = s.hour % 24
              const ampm = h >= 12 ? "PM" : "AM"
              const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
              return (
                <div key={s.label} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  <span className="font-mono text-sm text-foreground font-semibold">{h12}:00</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{ampm}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Relationships */}
        {agent.relationships.length > 0 && (
          <div className="glass-panel rounded-2xl p-5 mb-6">
            <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase mb-4 flex items-center gap-2">
              <Heart className="h-3.5 w-3.5" /> Relationships ({agent.relationships.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[...agent.relationships]
                .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
                .slice(0, 12)
                .map((rel) => {
                  const isPositive = rel.score >= 0
                  return (
                    <Link
                      key={rel.targetId}
                      href={`/agent/${encodeURIComponent(rel.targetName)}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-secondary/20 hover:bg-secondary/40 transition-colors"
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isPositive ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                        <span className={`text-sm font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>{rel.targetName[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground font-medium block truncate">{rel.targetName}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isPositive ? "bg-emerald-500/60" : "bg-red-500/60"}`}
                              style={{ width: `${Math.abs(rel.score)}%` }}
                            />
                          </div>
                          <span className={`font-mono text-[11px] ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {isPositive ? "+" : ""}{rel.score}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
            </div>
          </div>
        )}

        {/* Allies & Rivals */}
        {(agent.allyNames.length > 0 || agent.rivalNames.length > 0) && (
          <div className="glass-panel rounded-2xl p-5 mb-6">
            <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase mb-4 flex items-center gap-2">
              <Swords className="h-3.5 w-3.5" /> Allies & Rivals
            </h2>
            {agent.allyNames.length > 0 && (
              <div className="mb-3">
                <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider">Allies</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {agent.allyNames.map((name) => (
                    <Link
                      key={name}
                      href={`/agent/${encodeURIComponent(name)}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    >
                      <span className="text-xs text-emerald-300 font-medium">{name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {agent.rivalNames.length > 0 && (
              <div>
                <span className="text-[11px] font-mono text-red-400 uppercase tracking-wider">Rivals</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {agent.rivalNames.map((name) => (
                    <Link
                      key={name}
                      href={`/agent/${encodeURIComponent(name)}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      <span className="text-xs text-red-300 font-medium">{name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Life Story Timeline */}
        {agent.storyLog && agent.storyLog.length > 0 && (
          <div className="glass-panel rounded-2xl p-5 mb-6">
            <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase mb-4 flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5" /> Life Story ({agent.storyLog.length} events)
            </h2>
            <div className="relative pl-5">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-[hsl(var(--hud-border)/.2)]" />
              {[...agent.storyLog].reverse().map((story) => (
                <div
                  key={story.id}
                  className={`relative pb-4 last:pb-0 border-l-2 pl-4 ml-[-1px] ${CATEGORY_COLORS[story.category] ?? "border-l-primary/40"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-muted-foreground">Day {story.day}, {story.hour}:00</span>
                    <span className="text-[10px] font-mono capitalize px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground">{story.category}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground leading-tight">{story.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{story.description}</p>
                  {story.consequence && (
                    <p className="text-xs text-primary/70 italic mt-1">{story.consequence}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Quotes */}
        {agent.recentQuotes && agent.recentQuotes.length > 0 && (
          <div className="glass-panel rounded-2xl p-5 mb-6">
            <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase mb-4">Recent Quotes</h2>
            <div className="flex flex-col gap-3">
              {agent.recentQuotes.slice(-5).reverse().map((quote, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-primary/40 text-lg leading-none shrink-0">{'"'}</span>
                  <p className="text-sm text-foreground/85 italic leading-relaxed">{quote}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other agents browse */}
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase mb-3">All Citizens</h2>
          <div className="flex flex-wrap gap-2">
            {allAgentNames.map((name) => (
              <Link
                key={name}
                href={`/agent/${encodeURIComponent(name)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  name === agent.name
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {name}
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 pb-4">
          <Link href="/live" className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors">
            Agent City Live &middot; Watch the simulation
          </Link>
        </div>
      </div>
    </div>
  )
}
