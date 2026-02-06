"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import type { Snapshot } from "@/lib/types"

interface TimelapseScrubberProps {
  snapshots: Snapshot[]
  currentTick: number
}

export function TimelapseScrubber({ snapshots, currentTick }: TimelapseScrubberProps) {
  const reversedSnapshots = useMemo(() => [...snapshots].reverse(), [snapshots])

  if (reversedSnapshots.length === 0) {
    return (
      <div className="glass-panel rounded-lg px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">No timeline data yet</span>
      </div>
    )
  }

  const maxMorale = Math.max(...reversedSnapshots.map((s) => s.metrics.morale), 1)

  return (
    <div className="glass-panel rounded-lg px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] text-muted-foreground tracking-wider">TIMELINE</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {reversedSnapshots.length} snapshots
        </span>
      </div>

      <div className="flex items-end gap-px h-8">
        {reversedSnapshots.slice(-40).map((snap, i) => {
          const height = (snap.metrics.morale / maxMorale) * 100
          const isCurrent = snap.tick === currentTick

          return (
            <motion.div
              key={snap.tick}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: i * 0.01 }}
              className={`flex-1 rounded-t-sm min-w-[3px] ${
                isCurrent
                  ? "bg-primary"
                  : snap.metrics.morale > 50
                    ? "bg-[hsl(var(--success)/.4)]"
                    : "bg-[hsl(var(--warning)/.4)]"
              }`}
              title={`Day ${snap.day} - ${snap.phase} - Morale: ${snap.metrics.morale}%`}
            />
          )
        })}
      </div>

      {/* Sparkline labels */}
      <div className="flex items-center justify-between mt-1">
        {reversedSnapshots.length > 0 && (
          <>
            <span className="font-mono text-[9px] text-muted-foreground">
              D{reversedSnapshots[0]?.day ?? "?"}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              D{reversedSnapshots[reversedSnapshots.length - 1]?.day ?? "?"}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
