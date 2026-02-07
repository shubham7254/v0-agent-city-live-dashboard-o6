import { NextResponse } from "next/server"
import { getWorldState, setWorldState, pushSnapshot, pushEvent, pushChronicle } from "@/lib/redis"
import { executeTick } from "@/lib/simulation/engine"
import { createInitialState } from "@/lib/simulation/seed"
import { humanNewsGateway } from "@/lib/simulation/human-news"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    let state = await getWorldState()

    // Re-initialize if no state or if population is outdated (migration to 50 agents)
    if (!state || !state.agents || state.agents.length < 40 || !state.lastProcessedHour && state.lastProcessedHour !== 0) {
      state = createInitialState()
      await setWorldState(state)
      return NextResponse.json({ message: "Initialized world state", day: state.day, phase: state.phase })
    }

    if (state.paused) {
      return NextResponse.json({ message: "Simulation is paused", day: state.day, phase: state.phase })
    }

    // Inject fresh human news each morning
    if (state.phase === "morning") {
      state.humanEvents = humanNewsGateway(state.day)
    }

    // Fetch real Michigan weather
    try {
      const weatherRes = await fetch(new URL("/api/weather", process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000").toString())
      if (weatherRes.ok) {
        const wd = await weatherRes.json()
        if (wd.weather) state.weather = wd.weather
      }
    } catch { /* use existing weather if fetch fails */ }

    const result = executeTick(state)

    // Save state
    await setWorldState(result.state)

    // Push snapshot
    await pushSnapshot({
      day: result.state.day,
      phase: result.state.phase,
      tick: result.state.tick,
      metrics: { ...result.state.metrics },
      timestamp: Date.now(),
    })

    // Push events
    for (const event of result.events) {
      await pushEvent(event)
    }

    // Push chronicle if generated
    if (result.chronicle) {
      await pushChronicle(result.chronicle)
    }

    return NextResponse.json({
      day: result.state.day,
      hour: result.state.hour,
      phase: result.state.phase,
      tick: result.state.tick,
      eventsCount: result.events.length,
      newsCount: result.news.length,
      chronicle: !!result.chronicle,
    })
  } catch (error) {
    console.error("Tick error:", error)
    return NextResponse.json({ error: "Tick failed" }, { status: 500 })
  }
}

// GET can also trigger a tick (for Vercel Cron)
export async function GET() {
  return POST()
}
