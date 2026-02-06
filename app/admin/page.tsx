"use client"

import { useCallback, useState } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import { Shield, Play, Pause, RotateCcw, Zap, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { WorldState } from "@/lib/types"

const fetcher = (url: string) =>
  fetch(url, {
    headers: { "x-admin-password": typeof window !== "undefined" ? sessionStorage.getItem("admin_pw") ?? "" : "" },
  }).then((r) => r.json())

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [authed, setAuthed] = useState(false)
  const [message, setMessage] = useState("")

  const { data, mutate } = useSWR<{ state: WorldState }>(
    authed ? "/api/admin" : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const handleAuth = useCallback(() => {
    sessionStorage.setItem("admin_pw", password)
    setAuthed(true)
  }, [password])

  const adminAction = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": sessionStorage.getItem("admin_pw") ?? "",
          },
          body: JSON.stringify({ action, ...extra }),
        })
        const data = await res.json()
        setMessage(data.message || JSON.stringify(data))
        mutate()
      } catch {
        setMessage("Action failed")
      }
    },
    [mutate]
  )

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="glass-panel rounded-xl p-8 max-w-sm w-full flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-lg text-foreground">Admin Access</h1>
          </div>
          <p className="text-sm text-muted-foreground">Enter admin password to access simulation controls.</p>
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            className="bg-secondary text-foreground"
          />
          <Button onClick={handleAuth} className="bg-primary text-primary-foreground">
            Authenticate
          </Button>
        </div>
      </main>
    )
  }

  const state = data?.state

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 noise-bg" />
      </div>

      <div className="relative z-10">
        <header className="glass-panel-strong border-b border-[hsl(var(--hud-border)/.2)] px-6 py-4 flex items-center gap-3">
          <Shield className="h-4 w-4 text-primary" />
          <h1 className="font-bold text-foreground">Admin Control Panel</h1>
          {state && (
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              Day {state.day} | {state.phase} | Tick {state.tick} | {state.paused ? "PAUSED" : "RUNNING"}
            </span>
          )}
        </header>

        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
          {/* Controls */}
          <div className="glass-panel rounded-xl p-5">
            <h2 className="font-mono text-xs text-muted-foreground tracking-wider mb-4">SIMULATION CONTROLS</h2>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => adminAction(state?.paused ? "resume" : "pause")}
                variant="outline"
                className="gap-2 bg-transparent text-foreground"
              >
                {state?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {state?.paused ? "Resume" : "Pause"}
              </Button>
              <Button onClick={() => adminAction("tick_once")} variant="outline" className="gap-2 bg-transparent text-foreground">
                <Zap className="h-4 w-4" />
                Tick Once
              </Button>
              <Button onClick={() => adminAction("reset")} variant="outline" className="gap-2 bg-transparent text-destructive hover:text-destructive">
                <RotateCcw className="h-4 w-4" />
                Reset Seed
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="w-24 bg-secondary text-foreground"
                  placeholder="Rate (ms)"
                  defaultValue={state?.tickRate ?? 10000}
                  onBlur={(e) => adminAction("set_tick_rate", { tickRate: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          {/* Status message */}
          {message && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-panel rounded-lg px-4 py-2"
            >
              <span className="font-mono text-xs text-primary">{message}</span>
            </motion.div>
          )}

          {/* State viewer */}
          {state && (
            <div className="glass-panel rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--hud-border)/.2)]">
                <h2 className="font-mono text-xs text-muted-foreground tracking-wider">WORLD STATE</h2>
              </div>

              {[
                { key: "metrics", label: "Metrics", data: state.metrics },
                { key: "agents", label: `Agents (${state.agents.length})`, data: state.agents.map((a) => ({ id: a.id, name: a.name, status: a.status, energy: a.energy })) },
                { key: "council", label: "Council", data: state.council },
                { key: "news", label: `News (${state.news.length})`, data: state.news.slice(0, 10) },
                { key: "events", label: `Events (${state.recentEvents.length})`, data: state.recentEvents.slice(0, 10) },
              ].map((section) => (
                <div key={section.key} className="border-b border-[hsl(var(--hud-border)/.1)]">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-secondary/30 transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-foreground">{section.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {expandedSections[section.key] ? "collapse" : "expand"}
                    </span>
                  </button>
                  {expandedSections[section.key] && (
                    <div className="px-4 pb-3">
                      <pre className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3 overflow-x-auto font-mono max-h-64 overflow-y-auto">
                        {JSON.stringify(section.data, null, 2)}
                      </pre>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 text-xs text-muted-foreground"
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(section.data, null, 2))}
                      >
                        Copy JSON
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
