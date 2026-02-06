import { NextResponse } from "next/server"
import { getWorldState, getSnapshots, getEvents } from "@/lib/redis"
import { createInitialState } from "@/lib/simulation/seed"
import { setWorldState } from "@/lib/redis"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    let state = await getWorldState()

    if (!state) {
      state = createInitialState()
      await setWorldState(state)
    }

    const [snapshots, events] = await Promise.all([
      getSnapshots(60),
      getEvents(30),
    ])

    return NextResponse.json({
      state,
      snapshots,
      events,
    })
  } catch (error) {
    console.error("State fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch state" }, { status: 500 })
  }
}
