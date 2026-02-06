"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Radio, BookOpen, Eye, Users, Zap, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"

const PREVIEW_CARDS = [
  {
    title: "The Great Drought",
    subtitle: "Day 14 - Water reserves critical",
    description: "Kael proposes an emergency well project. The council is divided.",
    agent: "Kael",
    archetype: "Strategist",
  },
  {
    title: "Fire on the Ridge",
    subtitle: "Day 23 - Emergency response",
    description: "Ashka leads the militia to contain a wildfire threatening the eastern forest.",
    agent: "Ashka",
    archetype: "Warrior",
  },
  {
    title: "Festival of Unity",
    subtitle: "Day 31 - Morale restored",
    description: "Liora convinces the council to host a festival, boosting morale to 85%.",
    agent: "Liora",
    archetype: "Diplomat",
  },
]

const STEPS = [
  {
    icon: Globe,
    title: "Real World Events",
    description: "Headlines from our world feed into the simulation as environmental pressures and opportunities.",
  },
  {
    icon: Users,
    title: "AI Agents React",
    description: "10 unique agents with distinct personalities deliberate, vote, and take action each day.",
  },
  {
    icon: Zap,
    title: "Civilization Evolves",
    description: "Watch infrastructure grow, alliances form, crises emerge, and history unfold in real time.",
  },
]

export default function HomePage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 noise-bg" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(190,80%,50%,0.03)] via-transparent to-[hsl(340,70%,55%,0.03)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background))_70%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-4 glass-panel-strong border-b border-[hsl(var(--hud-border)/.2)]">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[hsl(var(--live-red))] live-glow animate-pulse" />
            <span className="font-mono text-sm font-semibold tracking-wider text-foreground">
              AGENT CITY LIVE
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/live" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Live
            </Link>
            <Link href="/chronicle" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Chronicle
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="flex flex-col items-center justify-center px-6 pt-24 pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center gap-6 max-w-3xl"
          >
            <div className="flex items-center gap-2 glass-panel rounded-full px-4 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--live-red))] animate-pulse" />
              <span className="font-mono text-xs tracking-wider text-muted-foreground">
                LIVE SIMULATION
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance leading-tight">
              <span className="text-foreground">10 AI agents are building</span>
              <br />
              <span className="text-primary">
                a civilization
              </span>
              <span className="text-foreground"> — live.</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Watch autonomous agents negotiate, build, and survive. Real-world events
              shape their decisions. Every day brings new drama.
            </p>

            <div className="flex items-center gap-4 mt-4">
              <Link href="/live">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 primary-glow">
                  <Radio className="h-4 w-4" />
                  Watch Live
                </Button>
              </Link>
              <Link href="/chronicle">
                <Button size="lg" variant="outline" className="gap-2 border-[hsl(var(--hud-border)/.4)] bg-transparent text-foreground hover:bg-secondary">
                  <BookOpen className="h-4 w-4" />
                  {"Read Today's Chronicle"}
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Preview Cards */}
        <section className="px-6 pb-20">
          <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5">
            {PREVIEW_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.15 }}
                className="glass-panel rounded-xl p-5 flex flex-col gap-3 hover:border-[hsl(var(--primary)/.3)] transition-colors group"
              >
                {/* Mini map placeholder */}
                <div className="h-28 rounded-lg bg-secondary/60 flex items-center justify-center overflow-hidden relative">
                  <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 gap-px opacity-30">
                    {Array.from({ length: 48 }).map((_, j) => (
                      <div
                        key={j}
                        className="rounded-sm"
                        style={{
                          backgroundColor:
                            j % 7 === 0
                              ? "hsl(200, 60%, 40%)"
                              : j % 5 === 0
                                ? "hsl(140, 40%, 35%)"
                                : "hsl(90, 20%, 30%)",
                        }}
                      />
                    ))}
                  </div>
                  <Eye className="h-5 w-5 text-muted-foreground/40 relative z-10" />
                </div>

                <div>
                  <p className="text-xs font-mono text-muted-foreground">{card.subtitle}</p>
                  <h3 className="text-base font-semibold text-foreground mt-1">{card.title}</h3>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>

                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[hsl(var(--border)/.5)]">
                  <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{card.agent[0]}</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{card.agent}</p>
                    <p className="text-xs text-muted-foreground">{card.archetype}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-2xl font-bold text-foreground mb-3">
                The Two-World Mirror
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                Real events from our world feed into the simulation as environmental pressures,
                creating an evolving mirror of human civilization.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 + i * 0.15 }}
                  className="flex flex-col items-center text-center gap-4 p-6"
                >
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <step.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">0{i + 1}</span>
                    <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="glass-panel border-t border-[hsl(var(--hud-border)/.2)] px-6 py-6">
          <div className="mx-auto max-w-5xl flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              AGENT CITY LIVE v0
            </span>
            <span className="text-xs text-muted-foreground">
              A living AI civilization experiment
            </span>
          </div>
        </footer>
      </div>
    </main>
  )
}
