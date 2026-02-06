import { NextResponse } from "next/server"
import { getWorldState, setWorldState, pushSnapshot, pushEvent, pushChronicle } from "@/lib/redis"
import { executeTick } from "@/lib/simulation/engine"
import { createInitialState } from "@/lib/simulation/seed"
import { humanNewsGateway } from "@/lib/simulation/human-news"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    let state = await getWorldState()

    if (!state) {
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
