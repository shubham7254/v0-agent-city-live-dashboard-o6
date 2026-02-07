"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Users, Vote, ChevronUp, ChevronDown, Check, Clock } from "lucide-react"

function generateViewerId(): string {
  if (typeof window === "undefined") return "ssr"
  let id = localStorage.getItem("viewer_id")
  if (!id) {
    id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem("viewer_id", id)
  }
  return id
}

interface VoteData {
  proposal: {
    id: string
    title: string
    description: string
    optionA: string
    optionB: string
    expiresAt: number
  } | null
  results: { a: number; b: number }
  totalVoters: number
}

export function SpectatorBar() {
  const [count, setCount] = useState(0)
  const [voteData, setVoteData] = useState<VoteData | null>(null)
  const [voteOpen, setVoteOpen] = useState(false)
  const [hasVoted, setHasVoted] = useState<"a" | "b" | null>(null)
  const [voting, setVoting] = useState(false)
  const [timeLeft, setTimeLeft] = useState("")
  const viewerIdRef = useRef<string>("")

  // Initialize viewer ID on mount
  useEffect(() => {
    viewerIdRef.current = generateViewerId()
  }, [])

  // Heartbeat: ping every 30s
  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch("/api/spectators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ viewerId: viewerIdRef.current }),
        })
        const data = await res.json()
        if (data.count) setCount(data.count)
      } catch { /* silent */ }
    }
    ping()
    const id = setInterval(ping, 30000)
    return () => clearInterval(id)
  }, [])

  // Fetch vote status
  const fetchVote = useCallback(async () => {
    try {
      const res = await fetch("/api/vote")
      const data: VoteData = await res.json()
      setVoteData(data)
      // Check if we already voted (stored in localStorage)
      if (data.proposal) {
        const voted = localStorage.getItem(`voted_${data.proposal.id}`)
        if (voted === "a" || voted === "b") setHasVoted(voted)
        else setHasVoted(null)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchVote()
    const id = setInterval(fetchVote, 15000)
    return () => clearInterval(id)
  }, [fetchVote])

  // Countdown timer
  useEffect(() => {
    if (!voteData?.proposal) return
    const update = () => {
      const remaining = Math.max(0, voteData.proposal!.expiresAt - Date.now())
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [voteData?.proposal])

  const handleVote = async (choice: "a" | "b") => {
    if (hasVoted || voting || !voteData?.proposal) return
    setVoting(true)
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vote", viewerId: viewerIdRef.current, choice }),
      })
      const data = await res.json()
      if (data.success) {
        setHasVoted(choice)
        localStorage.setItem(`voted_${voteData.proposal!.id}`, choice)
        setVoteData((prev) => prev ? { ...prev, results: data.results, totalVoters: prev.totalVoters + 1 } : prev)
      }
    } catch { /* silent */ }
    setVoting(false)
  }

  // Auto-create a vote if none exists (trigger once)
  useEffect(() => {
    if (voteData && !voteData.proposal) {
      fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "new_proposal" }),
      }).then(() => fetchVote()).catch(() => {})
    }
  }, [voteData, fetchVote])

  const totalVotes = voteData ? voteData.results.a + voteData.results.b : 0
  const pctA = totalVotes > 0 ? Math.round((voteData!.results.a / totalVotes) * 100) : 50
  const pctB = totalVotes > 0 ? 100 - pctA : 50

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Spectator count pill */}
      <div className="glass-panel rounded-full px-3 py-1.5 flex items-center gap-2">
        <Users className="h-3 w-3 text-primary" />
        <span className="font-mono text-xs font-bold text-foreground">{count}</span>
        <span className="font-mono text-[10px] text-muted-foreground">watching</span>
        <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--live-red))] animate-pulse" />
      </div>

      {/* Vote button / panel */}
      {voteData?.proposal && (
        <>
          <button
            type="button"
            onClick={() => setVoteOpen(!voteOpen)}
            className="glass-panel rounded-full px-3 py-1.5 flex items-center gap-2 hover:border-primary/40 transition-colors"
          >
            <Vote className="h-3 w-3 text-[hsl(var(--warning))]" />
            <span className="font-mono text-[10px] font-bold text-foreground uppercase">Vote Now</span>
            <span className="font-mono text-[10px] text-muted-foreground">{timeLeft}</span>
            {voteOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" />}
          </button>

          <AnimatePresence>
            {voteOpen && (
              <motion.div
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                className="glass-panel-strong rounded-xl p-3 w-72"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Vote className="h-4 w-4 text-[hsl(var(--warning))]" />
                  <h3 className="font-mono text-xs font-bold text-foreground leading-tight">{voteData.proposal.title}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">{voteData.proposal.description}</p>

                {/* Option A */}
                <button
                  type="button"
                  onClick={() => handleVote("a")}
                  disabled={!!hasVoted || voting}
                  className={`w-full mb-1.5 rounded-lg border transition-all text-left px-3 py-2 ${
                    hasVoted === "a"
                      ? "border-primary/50 bg-primary/10"
                      : hasVoted
                        ? "border-[hsl(var(--hud-border)/.15)] opacity-60"
                        : "border-[hsl(var(--hud-border)/.2)] hover:border-primary/30 hover:bg-primary/5"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-foreground font-medium">{voteData.proposal.optionA}</span>
                    {hasVoted === "a" && <Check className="h-3 w-3 text-primary" />}
                  </div>
                  {hasVoted && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-secondary/40 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pctA}%` }}
                          className="h-full rounded-full bg-primary/60"
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">{pctA}%</span>
                    </div>
                  )}
                </button>

                {/* Option B */}
                <button
                  type="button"
                  onClick={() => handleVote("b")}
                  disabled={!!hasVoted || voting}
                  className={`w-full rounded-lg border transition-all text-left px-3 py-2 ${
                    hasVoted === "b"
                      ? "border-[hsl(var(--warning))/.5] bg-[hsl(var(--warning))/.1]"
                      : hasVoted
                        ? "border-[hsl(var(--hud-border)/.15)] opacity-60"
                        : "border-[hsl(var(--hud-border)/.2)] hover:border-[hsl(var(--warning))/.3] hover:bg-[hsl(var(--warning))/.05]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-foreground font-medium">{voteData.proposal.optionB}</span>
                    {hasVoted === "b" && <Check className="h-3 w-3 text-[hsl(var(--warning))]" />}
                  </div>
                  {hasVoted && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-secondary/40 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pctB}%` }}
                          className="h-full rounded-full bg-[hsl(var(--warning))/.6]"
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">{pctB}%</span>
                    </div>
                  )}
                </button>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[hsl(var(--hud-border)/.1)]">
                  <span className="font-mono text-[10px] text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""} cast</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground">{timeLeft} left</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
