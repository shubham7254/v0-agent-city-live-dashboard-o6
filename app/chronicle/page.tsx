"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowLeft, Share2, Newspaper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RecapCard } from "@/components/chronicle/recap-card"
import type { ChronicleEntry } from "@/lib/types"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ChroniclePage() {
  const { data } = useSWR<{ chronicles: ChronicleEntry[] }>("/api/chronicles", fetcher, {
    refreshInterval: 15000,
  })
  const [selectedCard, setSelectedCard] = useState<ChronicleEntry | null>(null)

  const chronicles = data?.chronicles ?? []

  return (
    <main className="min-h-screen bg-background relative">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 noise-bg" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="glass-panel-strong border-b border-[hsl(var(--hud-border)/.2)] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/live">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                Live
              </Button>
            </Link>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-primary" />
              <h1 className="font-bold text-lg text-foreground">The Agent City Chronicle</h1>
            </div>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {chronicles.length} entries
          </span>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-10">
          {chronicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <Newspaper className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground text-center">
                No chronicles yet. The first entry will appear after a full day cycle in the simulation.
              </p>
              <Link href="/live">
                <Button variant="outline" className="bg-transparent text-foreground">
                  Watch Live
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {chronicles.map((entry, i) => (
                <motion.article
                  key={`day-${entry.day}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel rounded-xl p-6"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <span className="font-mono text-xs text-primary tracking-wider">DAY {entry.day}</span>
                      <div className="flex flex-col gap-1 mt-2">
                        {entry.headlines.map((h, j) => (
                          <h2
                            key={j}
                            className={`font-semibold text-foreground ${j === 0 ? "text-xl" : "text-sm text-muted-foreground"}`}
                          >
                            {h}
                          </h2>
                        ))}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setSelectedCard(entry)}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Key vote */}
                  {entry.keyVote && (
                    <div className="glass-panel rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          entry.keyVote.result === "approved"
                            ? "bg-[hsl(var(--success)/.2)] text-[hsl(var(--success))]"
                            : "bg-[hsl(var(--live-red)/.2)] text-[hsl(var(--live-red))]"
                        }`}
                      >
                        {entry.keyVote.result.toUpperCase()}
                      </span>
                      <span className="text-sm text-foreground">{entry.keyVote.title}</span>
                    </div>
                  )}

                  {/* Top moments */}
                  {entry.topMoments.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-mono text-xs text-muted-foreground tracking-wider mb-2">TOP MOMENTS</h4>
                      <div className="flex flex-col gap-1.5">
                        {entry.topMoments.map((m, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="font-mono text-xs text-primary mt-0.5">{j + 1}.</span>
                            <p className="text-sm text-foreground/80">{m}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metrics bar */}
                  <div className="flex items-center gap-4 pt-3 border-t border-[hsl(var(--border)/.3)]">
                    <MetricChip label="Pop" value={entry.metricsSnapshot.population} />
                    <MetricChip label="Food" value={`${Math.round(entry.metricsSnapshot.foodDays)}d`} />
                    <MetricChip label="H2O" value={`${Math.round(entry.metricsSnapshot.waterDays)}d`} />
                    <MetricChip label="Morale" value={`${Math.round(entry.metricsSnapshot.morale)}%`} />
                    <MetricChip label="Unrest" value={`${Math.round(entry.metricsSnapshot.unrest)}%`} />
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recap Card Modal */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="relative">
            <RecapCard entry={selectedCard} />
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-10 right-0 text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedCard(null)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}

function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-bold text-foreground">{value}</span>
    </div>
  )
}
