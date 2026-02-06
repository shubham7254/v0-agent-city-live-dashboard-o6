"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Gavel, Timer, Check, X as XIcon } from "lucide-react"
import type { Agent, CouncilSession } from "@/lib/types"

interface CouncilChamberProps {
  council: CouncilSession
  agents: Agent[]
}

export function CouncilChamber({ council, agents }: CouncilChamberProps) {
  const agentMap = new Map(agents.map((a) => [a.id, a]))

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-[hsl(var(--hud-border)/.2)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gavel className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-xs font-semibold tracking-wider text-foreground">COUNCIL CHAMBER</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Timer className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">
            Next in {council.nextCouncilIn} ticks
          </span>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* Speaker stage */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {agents.slice(0, 6).map((agent) => (
            <div
              key={agent.id}
              className={`flex flex-col items-center gap-1 shrink-0 ${
                council.currentSpeaker === agent.id ? "opacity-100" : "opacity-40"
              }`}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${
                  council.currentSpeaker === agent.id
                    ? "bg-primary/20 border-primary scale-110"
                    : "bg-secondary border-border"
                }`}
              >
                <span className="text-[10px] font-bold text-foreground">{agent.name[0]}</span>
              </div>
              <span className="text-[9px] text-muted-foreground font-mono">{agent.name.slice(0, 4)}</span>
            </div>
          ))}
        </div>

        {/* Dialogue */}
        <div className="flex flex-col gap-1.5 max-h-24 overflow-y-auto">
          <AnimatePresence>
            {council.dialogue.slice(0, 4).map((d, i) => {
              const agent = agentMap.get(d.agentId)
              return (
                <motion.div
                  key={`${d.agentId}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2"
                >
                  <span className="text-xs font-semibold text-primary shrink-0">
                    {agent?.name ?? "?"}:
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {d.message}
                  </p>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {/* Proposals */}
        <div className="flex flex-col gap-2">
          {council.proposals.slice(0, 2).map((proposal) => {
            const yesCount = Object.values(proposal.votes).filter((v) => v === "yes").length
            const noCount = Object.values(proposal.votes).filter((v) => v === "no").length

            return (
              <div key={proposal.id} className="bg-secondary/40 rounded-lg p-2.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-foreground">{proposal.title}</p>
                  <span className="font-mono text-[10px] text-muted-foreground">Cost: {proposal.cost}</span>
                </div>

                {/* Impact icons */}
                <div className="flex items-center gap-2 mb-2">
                  {proposal.expectedImpact.map((impact, i) => (
                    <span
                      key={i}
                      className={`text-[10px] font-mono ${
                        impact.direction === "up" ? "text-[hsl(var(--success))]" : "text-[hsl(var(--live-red))]"
                      }`}
                    >
                      {impact.direction === "up" ? "+" : "-"}{impact.amount} {impact.metric}
                    </span>
                  ))}
                </div>

                {/* Vote dots */}
                <div className="flex items-center gap-1 mb-1.5">
                  {agents.map((agent) => {
                    const vote = proposal.votes[agent.id]
                    return (
                      <motion.div
                        key={agent.id}
                        initial={{ rotateY: 90 }}
                        animate={{ rotateY: 0 }}
                        transition={{ delay: 0.05 * agents.indexOf(agent) }}
                        className={`h-3.5 w-3.5 rounded-full flex items-center justify-center ${
                          vote === "yes"
                            ? "bg-[hsl(var(--success)/.4)]"
                            : vote === "no"
                              ? "bg-[hsl(var(--live-red)/.4)]"
                              : "bg-muted"
                        }`}
                      >
                        <span className="text-[7px] font-bold text-foreground">
                          {vote === "yes" ? "Y" : vote === "no" ? "N" : "A"}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Result stamp */}
                {proposal.status !== "pending" && (
                  <motion.div
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className={`flex items-center gap-1 ${
                      proposal.status === "approved" ? "text-[hsl(var(--success))]" : "text-[hsl(var(--live-red))]"
                    }`}
                  >
                    {proposal.status === "approved" ? <Check className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
                    <span className="font-mono text-xs font-bold tracking-wider uppercase">
                      {proposal.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      ({yesCount}Y / {noCount}N)
                    </span>
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
