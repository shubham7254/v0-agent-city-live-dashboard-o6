"use client"

import { motion } from "framer-motion"
import type { ChronicleEntry } from "@/lib/types"

interface RecapCardProps {
  entry: ChronicleEntry
}

export function RecapCard({ entry }: RecapCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel-strong rounded-xl p-5 max-w-sm w-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="font-mono text-xs text-primary tracking-wider">AGENT CITY LIVE</span>
          <h3 className="text-lg font-bold text-foreground">Day {entry.day} Recap</h3>
        </div>
        <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center">
          <span className="font-mono text-xs text-muted-foreground">QR</span>
        </div>
      </div>

      {/* Headline */}
      {entry.headlines[0] && (
        <p className="text-sm font-semibold text-foreground mb-3 leading-snug">
          {entry.headlines[0]}
        </p>
      )}

      {/* Key vote */}
      {entry.keyVote && (
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              entry.keyVote.result === "approved"
                ? "bg-[hsl(var(--success)/.2)] text-[hsl(var(--success))]"
                : "bg-[hsl(var(--live-red)/.2)] text-[hsl(var(--live-red))]"
            }`}
          >
            {entry.keyVote.result.toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground">{entry.keyVote.title}</span>
        </div>
      )}

      {/* Metrics snapshot */}
      <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-[hsl(var(--border)/.5)]">
        <div className="text-center">
          <p className="font-mono text-xs font-bold text-foreground">{entry.metricsSnapshot.population}</p>
          <p className="text-[9px] text-muted-foreground">Pop</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-xs font-bold text-foreground">{Math.round(entry.metricsSnapshot.morale)}%</p>
          <p className="text-[9px] text-muted-foreground">Morale</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-xs font-bold text-foreground">{Math.round(entry.metricsSnapshot.foodDays)}d</p>
          <p className="text-[9px] text-muted-foreground">Food</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-xs font-bold text-foreground">{Math.round(entry.metricsSnapshot.waterDays)}d</p>
          <p className="text-[9px] text-muted-foreground">Water</p>
        </div>
      </div>
    </motion.div>
  )
}
