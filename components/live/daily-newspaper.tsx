"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Newspaper, X, Cloud, Quote } from "lucide-react"
import type { WorldState } from "@/lib/types"
import { generateNewspaper, type NewspaperEdition } from "@/lib/simulation/newspaper"

interface DailyNewspaperProps {
  state: WorldState
}

export function DailyNewspaper({ state }: DailyNewspaperProps) {
  const [open, setOpen] = useState(false)
  const [lastShownDay, setLastShownDay] = useState(0)

  const edition = useMemo(() => generateNewspaper(state), [state.day, state.storyLog])

  // Auto-show on new day (morning phase)
  useEffect(() => {
    if (state.phase === "morning" && state.day > lastShownDay) {
      setOpen(true)
      setLastShownDay(state.day)
    }
  }, [state.phase, state.day, lastShownDay])

  return (
    <>
      {/* Newspaper button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-panel rounded-full px-3 py-1.5 flex items-center gap-2 hover:border-primary/40 transition-colors pointer-events-auto"
      >
        <Newspaper className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
        <span className="font-mono text-[10px] font-bold text-foreground">Day {state.day} Edition</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Newspaper */}
            <motion.div
              initial={{ scale: 0.8, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg"
              style={{
                background: "#f5f0e8",
                color: "#2a2522",
                boxShadow: "0 25px 50px rgba(0,0,0,.4)",
              }}
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 z-10 rounded-full bg-black/10 p-1.5 hover:bg-black/20 transition-colors"
              >
                <X className="h-4 w-4 text-[#2a2522]" />
              </button>

              <div className="p-6 md:p-8">
                {/* Masthead */}
                <div className="text-center border-b-2 border-double border-[#2a2522] pb-3 mb-4">
                  <p className="text-[10px] tracking-[.3em] uppercase text-[#6b5e4f] mb-1">
                    {edition.date}
                  </p>
                  <h1
                    className="text-2xl md:text-3xl font-bold tracking-tight leading-none"
                    style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                  >
                    {edition.masthead}
                  </h1>
                  <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-[#6b5e4f] tracking-wider uppercase">
                    <span>Day {edition.day}</span>
                    <span>|</span>
                    <span>{edition.populationNote}</span>
                  </div>
                </div>

                {/* Headline */}
                <div className="mb-5">
                  <h2
                    className="text-xl md:text-2xl font-bold leading-tight mb-2"
                    style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                  >
                    {edition.headline}
                  </h2>
                  <p className="text-sm leading-relaxed text-[#3a352e]">{edition.headlineBody}</p>
                </div>

                {/* Divider */}
                <div className="border-t border-[#c8bfb0] mb-4" />

                {/* Articles grid */}
                {edition.articles.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    {edition.articles.map((article, i) => (
                      <div key={i} className={`${i === 0 && edition.articles.length > 2 ? "md:col-span-2" : ""}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#2a2522]/10 text-[#6b5e4f]">
                            {article.category}
                          </span>
                        </div>
                        <h3
                          className="text-sm font-bold leading-tight mb-1"
                          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                        >
                          {article.headline}
                        </h3>
                        <p className="text-xs leading-relaxed text-[#4a453e]">{article.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer: weather + quote */}
                <div className="border-t border-[#c8bfb0] pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-2">
                    <Cloud className="h-4 w-4 text-[#6b5e4f] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-[#6b5e4f]">Weather</span>
                      <p className="text-xs text-[#4a453e] mt-0.5">{edition.weatherReport}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Quote className="h-4 w-4 text-[#6b5e4f] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-[#6b5e4f]">Quote of the Day</span>
                      <p className="text-xs italic text-[#4a453e] mt-0.5">
                        {`"${edition.quoteOfTheDay.quote}"`}
                      </p>
                      <p className="text-[10px] text-[#6b5e4f] mt-0.5">-- {edition.quoteOfTheDay.agent}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
