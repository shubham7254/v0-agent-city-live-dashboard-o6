"use client"

import { motion } from "framer-motion"
import { Newspaper, Globe, AlertTriangle, Sunrise, Moon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { NewsItem, HumanWorldEvent, EventSeverity } from "@/lib/types"

interface NewsModulesProps {
  news: NewsItem[]
  humanEvents: HumanWorldEvent[]
}

const SEVERITY_STYLES: Record<EventSeverity, string> = {
  low: "border-l-muted-foreground/30",
  medium: "border-l-[hsl(var(--warning))]",
  high: "border-l-[hsl(var(--live-red))]",
  critical: "border-l-[hsl(var(--destructive))]",
}

const CATEGORY_ICONS = {
  morning_brief: <Sunrise className="h-3 w-3" />,
  breaking: <AlertTriangle className="h-3 w-3" />,
  night_recap: <Moon className="h-3 w-3" />,
}

export function NewsModules({ news, humanEvents }: NewsModulesProps) {
  const morningNews = news.filter((n) => n.category === "morning_brief")
  const breakingNews = news.filter((n) => n.category === "breaking")
  const nightNews = news.filter((n) => n.category === "night_recap")

  return (
    <div className="flex flex-col gap-3">
      {/* AI World News */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-[hsl(var(--hud-border)/.2)] flex items-center gap-2">
          <Newspaper className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-xs font-semibold tracking-wider text-foreground">AI WORLD NEWS</span>
        </div>

        <Tabs defaultValue="breaking" className="w-full">
          <TabsList className="w-full bg-transparent justify-start rounded-none border-b border-[hsl(var(--hud-border)/.1)] px-2 h-auto py-0">
            <TabsTrigger value="morning" className="text-xs font-mono py-1.5 data-[state=active]:bg-transparent data-[state=active]:text-primary">
              Brief
            </TabsTrigger>
            <TabsTrigger value="breaking" className="text-xs font-mono py-1.5 data-[state=active]:bg-transparent data-[state=active]:text-primary">
              Breaking
            </TabsTrigger>
            <TabsTrigger value="night" className="text-xs font-mono py-1.5 data-[state=active]:bg-transparent data-[state=active]:text-primary">
              Recap
            </TabsTrigger>
          </TabsList>

          <TabsContent value="morning" className="mt-0">
            <ScrollArea className="h-28">
              <div className="p-2 flex flex-col gap-1.5">
                {morningNews.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">No morning briefs yet.</p>
                )}
                {morningNews.slice(0, 5).map((item) => (
                  <NewsItemRow key={item.id} item={item} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="breaking" className="mt-0">
            <ScrollArea className="h-28">
              <div className="p-2 flex flex-col gap-1.5">
                {breakingNews.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">No breaking alerts.</p>
                )}
                {breakingNews.slice(0, 5).map((item) => (
                  <NewsItemRow key={item.id} item={item} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="night" className="mt-0">
            <ScrollArea className="h-28">
              <div className="p-2 flex flex-col gap-1.5">
                {nightNews.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">No night recaps yet.</p>
                )}
                {nightNews.slice(0, 5).map((item) => (
                  <NewsItemRow key={item.id} item={item} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Human World Brief */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-[hsl(var(--hud-border)/.2)] flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />
          <span className="font-mono text-xs font-semibold tracking-wider text-foreground">HUMAN WORLD BRIEF</span>
        </div>
        <ScrollArea className="h-36">
          <div className="p-2 flex flex-col gap-2">
            {humanEvents.map((event, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-secondary/40 rounded-lg p-2.5 flex flex-col gap-1"
              >
                <p className="text-xs font-semibold text-foreground leading-snug">{event.headline}</p>
                <p className="text-[10px] text-muted-foreground">{event.source}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[10px] font-mono ${event.simEffect.modifier > 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--live-red))]"}`}>
                    {event.simEffect.modifier > 0 ? "+" : ""}{event.simEffect.modifier} {event.simEffect.variable}
                  </span>
                  <span className="text-[10px] text-muted-foreground">- {event.simEffect.description}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function NewsItemRow({ item }: { item: NewsItem }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`border-l-2 ${SEVERITY_STYLES[item.severity]} pl-2 py-1`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {CATEGORY_ICONS[item.category]}
        <span className="font-mono text-[10px] text-muted-foreground">Day {item.day}</span>
        {item.category === "breaking" && (
          <span className="text-[9px] font-mono px-1 rounded bg-[hsl(var(--live-red)/.2)] text-[hsl(var(--live-red))]">
            ALERT
          </span>
        )}
      </div>
      <p className="text-xs text-foreground leading-snug">{item.headline}</p>
    </motion.div>
  )
}
