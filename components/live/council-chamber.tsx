"use client"

import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X as XIcon } from "lucide-react"
import type { Agent, CouncilSession, HumanWorldEvent } from "@/lib/types"

interface CouncilChamberProps {
  council: CouncilSession
  agents: Agent[]
  humanEvents: HumanWorldEvent[]
}

const AGENT_COLORS = [
  "#26c6da", "#66bb6a", "#ef5350", "#ffa726", "#ab47bc",
  "#42a5f5", "#ec407a", "#8d6e63", "#78909c", "#ffca28",
]

function getAgentColor(agentId: string, agents: Agent[]): string {
  const idx = agents.findIndex((a) => a.id === agentId)
  return AGENT_COLORS[idx >= 0 ? idx % AGENT_COLORS.length : 0]
}

function getAgentInfo(agentId: string, agents: Agent[]) {
  return agents.find((a) => a.id === agentId)
}

const TYPE_BADGES: Record<string, { label: string; bgClass: string; textClass: string }> = {
  proposal: { label: "PROPOSAL", bgClass: "bg-[hsl(var(--primary)/.15)]", textClass: "text-primary" },
  opinion: { label: "OPINION", bgClass: "bg-[hsl(var(--success)/.12)]", textClass: "text-[hsl(var(--success))]" },
  debate: { label: "DEBATE", bgClass: "bg-[hsl(var(--warning)/.12)]", textClass: "text-[hsl(var(--warning))]" },
  human_news_reaction: { label: "HUMAN NEWS", bgClass: "bg-[hsl(var(--accent)/.12)]", textClass: "text-[hsl(var(--accent))]" },
  vote_statement: { label: "VOTE", bgClass: "bg-secondary", textClass: "text-muted-foreground" },
}

export function CouncilChamber({ council, agents, humanEvents }: CouncilChamberProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [council.dialogue.length])

  if (council.dialogue.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <p className="font-mono text-sm text-muted-foreground">No council session recorded yet.</p>
          <p className="font-mono text-xs text-muted-foreground/60">
            The council meets each evening (6 PM - 9 PM) to discuss the settlement and react to world news.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main conversation feed */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Session header */}
          <div className="text-center py-3 border-b border-border/40 mb-2">
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground/50">
              COUNCIL SESSION &mdash; DAY {council.day}
            </p>
            <p className="font-mono text-xs text-muted-foreground mt-1">
              {council.proposals.length} proposal{council.proposals.length !== 1 ? "s" : ""} &middot;{" "}
              {council.dialogue.length} messages
            </p>
          </div>

          {/* Dialogue messages */}
          <AnimatePresence mode="popLayout">
            {council.dialogue.map((msg, i) => {
              const agent = getAgentInfo(msg.agentId, agents)
              const color = getAgentColor(msg.agentId, agents)
              const badge = TYPE_BADGES[msg.type] || TYPE_BADGES.opinion
              const isHumanNews = msg.type === "human_news_reaction"
              const relatedEvent =
                isHumanNews && msg.referencedHumanEvent
                  ? humanEvents.find((e) => e.headline === msg.referencedHumanEvent)
                  : null

              return (
                <motion.div
                  key={`${msg.agentId}-${msg.timestamp}-${i}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                >
                  {/* Human event callout above the message */}
                  {relatedEvent && (
                    <div className="ml-11 mb-1.5 px-3 py-2 rounded-lg bg-[hsl(var(--accent)/.08)] border border-[hsl(var(--accent)/.15)]">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[8px] font-bold tracking-widest text-[hsl(var(--accent))]">
                          REACTING TO HUMAN NEWS
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground italic leading-relaxed">
                        {`"${relatedEvent.headline}"`}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        Source: {relatedEvent.source} &middot; Effect: {relatedEvent.simEffect.description}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="shrink-0 pt-0.5">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2"
                        style={{
                          backgroundColor: color + "20",
                          color,
                          borderColor: color + "40",
                        }}
                      >
                        {agent?.name?.[0] || "?"}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color }}>
                          {agent?.name || msg.agentId}
                        </span>
                        {agent && (
                          <span className="font-mono text-[9px] text-muted-foreground/50 capitalize">
                            {agent.archetype}
                          </span>
                        )}
                        <span
                          className={`font-mono text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded ${badge.bgClass} ${badge.textClass}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-sm text-foreground/90 mt-1 leading-relaxed">
                        {msg.message}
                      </p>

                      {msg.referencedProposal && (
                        <div className="mt-1.5 px-2.5 py-1 rounded-md bg-primary/8 border border-primary/15 inline-block">
                          <span className="font-mono text-[10px] text-primary/70">
                            Re: {msg.referencedProposal}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Typing indicator */}
          {council.isActive && council.currentSpeaker && (
            <div className="flex items-center gap-3 pl-1 pt-1">
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
                style={{
                  backgroundColor: getAgentColor(council.currentSpeaker, agents) + "20",
                  color: getAgentColor(council.currentSpeaker, agents),
                  borderColor: getAgentColor(council.currentSpeaker, agents) + "40",
                }}
              >
                {getAgentInfo(council.currentSpeaker, agents)?.name?.[0] || "?"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {getAgentInfo(council.currentSpeaker, agents)?.name} is speaking
                </span>
                <motion.span
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
                  className="inline-flex gap-0.5"
                >
                  <span className="h-1 w-1 rounded-full bg-primary" />
                  <span className="h-1 w-1 rounded-full bg-primary" />
                  <span className="h-1 w-1 rounded-full bg-primary" />
                </motion.span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-60 shrink-0 border-l border-border/30 overflow-y-auto bg-secondary/20">
        {/* Participants */}
        <div className="p-3 border-b border-border/30">
          <h3 className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground/70 mb-2">
            PARTICIPANTS
          </h3>
          <div className="space-y-1">
            {agents.map((agent, idx) => {
              const isSpeaking = council.currentSpeaker === agent.id
              const msgs = council.dialogue.filter((d) => d.agentId === agent.id).length
              const color = AGENT_COLORS[idx % AGENT_COLORS.length]

              return (
                <div
                  key={agent.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                    isSpeaking ? "bg-primary/10" : "hover:bg-secondary/60"
                  }`}
                >
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 border"
                    style={{
                      backgroundColor: color + "18",
                      color,
                      borderColor: color + "30",
                    }}
                  >
                    {agent.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">{agent.name}</p>
                    <p className="text-[9px] text-muted-foreground/50 capitalize">{agent.archetype}</p>
                  </div>
                  {msgs > 0 && (
                    <span className="font-mono text-[9px] text-muted-foreground/60 bg-secondary rounded px-1">
                      {msgs}
                    </span>
                  )}
                  {isSpeaking && (
                    <motion.div
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ duration: 0.8, repeat: Number.POSITIVE_INFINITY }}
                      className="h-2 w-2 rounded-full bg-primary shrink-0"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Proposals */}
        <div className="p-3 border-b border-border/30">
          <h3 className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground/70 mb-2">
            PROPOSALS
          </h3>
          {council.proposals.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 italic">No proposals yet</p>
          ) : (
            <div className="space-y-2">
              {council.proposals.map((prop) => {
                const proposerColor = getAgentColor(prop.proposedBy, agents)
                const proposer = getAgentInfo(prop.proposedBy, agents)
                const yesCount = Object.values(prop.votes).filter((v) => v === "yes").length
                const noCount = Object.values(prop.votes).filter((v) => v === "no").length

                return (
                  <div key={prop.id} className="rounded-lg bg-card/60 border border-border/30 p-2.5">
                    <p className="text-[11px] font-semibold text-foreground leading-snug">{prop.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{prop.description}</p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[9px] font-mono" style={{ color: proposerColor }}>
                        {proposer?.name || "Unknown"}
                      </span>
                      <span className="text-[9px] text-muted-foreground/40">&middot;</span>
                      <span className="font-mono text-[9px] text-muted-foreground">Cost: {prop.cost}</span>
                    </div>

                    {/* Expected impact */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {prop.expectedImpact.map((impact, i) => (
                        <span
                          key={i}
                          className={`text-[9px] font-mono ${
                            impact.direction === "up"
                              ? "text-[hsl(var(--success))]"
                              : "text-[hsl(var(--live-red))]"
                          }`}
                        >
                          {impact.direction === "up" ? "+" : "-"}
                          {impact.amount} {impact.metric}
                        </span>
                      ))}
                    </div>

                    {/* Vote chips */}
                    <div className="flex items-center gap-0.5 mt-2">
                      {agents.map((agent) => {
                        const vote = prop.votes[agent.id]
                        return (
                          <motion.div
                            key={agent.id}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.04 * agents.indexOf(agent) }}
                            className={`h-4 w-4 rounded-full flex items-center justify-center ${
                              vote === "yes"
                                ? "bg-[hsl(var(--success)/.3)]"
                                : vote === "no"
                                  ? "bg-[hsl(var(--live-red)/.3)]"
                                  : "bg-muted"
                            }`}
                          >
                            <span className="text-[7px] font-bold text-foreground">
                              {vote === "yes" ? "Y" : vote === "no" ? "N" : "-"}
                            </span>
                          </motion.div>
                        )
                      })}
                    </div>

                    {/* Status stamp */}
                    {prop.status !== "pending" && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={`flex items-center gap-1 mt-1.5 ${
                          prop.status === "approved"
                            ? "text-[hsl(var(--success))]"
                            : "text-[hsl(var(--live-red))]"
                        }`}
                      >
                        {prop.status === "approved" ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <XIcon className="h-3 w-3" />
                        )}
                        <span className="font-mono text-[10px] font-bold tracking-wider uppercase">
                          {prop.status}
                        </span>
                        <span className="text-[9px] text-muted-foreground ml-0.5">
                          ({yesCount}Y / {noCount}N)
                        </span>
                      </motion.div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Human world events discussed */}
        {humanEvents.length > 0 && (
          <div className="p-3">
            <h3 className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground/70 mb-2">
              HUMAN NEWS DISCUSSED
            </h3>
            <div className="space-y-2">
              {humanEvents.slice(-4).map((event) => {
                const reactionsCount = council.dialogue.filter(
                  (d) => d.type === "human_news_reaction" && d.referencedHumanEvent === event.headline
                ).length
                return (
                  <div
                    key={event.headline}
                    className="rounded-md bg-[hsl(var(--accent)/.05)] border border-[hsl(var(--accent)/.12)] p-2"
                  >
                    <p className="text-[10px] text-foreground/80 leading-relaxed font-medium">
                      {event.headline}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-muted-foreground/50">{event.source}</span>
                      {reactionsCount > 0 && (
                        <span className="text-[9px] font-mono text-[hsl(var(--accent))]">
                          {reactionsCount} reaction{reactionsCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                      Effect: {event.simEffect.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
