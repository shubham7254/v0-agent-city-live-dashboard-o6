import { NextRequest, NextResponse } from "next/server"
import { getWorldState, setWorldState } from "@/lib/redis"
import { createInitialState } from "@/lib/simulation/seed"
import { executeTick } from "@/lib/simulation/engine"

export const dynamic = "force-dynamic"

function checkAuth(request: NextRequest): boolean {
  const password = request.headers.get("x-admin-password")
  const envPassword = process.env.ADMIN_PASSWORD
  if (!envPassword) return true // No password set = open
  return password === envPassword
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const state = await getWorldState()
  return NextResponse.json({ state })
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { action, tickRate } = body

  let state = await getWorldState()

  switch (action) {
    case "pause":
      if (state) {
        state.paused = true
        await setWorldState(state)
      }
      return NextResponse.json({ message: "Paused", paused: true })

    case "resume":
      if (state) {
        state.paused = false
        await setWorldState(state)
      }
      return NextResponse.json({ message: "Resumed", paused: false })

    case "reset":
      state = createInitialState()
      await setWorldState(state)
      return NextResponse.json({ message: "Reset complete", day: state.day })

    case "tick_once":
      if (!state) {
        state = createInitialState()
      }
      const wasPaused = state.paused
      state.paused = false
      const result = executeTick(state)
      result.state.paused = wasPaused
      await setWorldState(result.state)
      return NextResponse.json({
        message: "Single tick executed",
        day: result.state.day,
        phase: result.state.phase,
        tick: result.state.tick,
      })

    case "set_tick_rate":
      if (state && typeof tickRate === "number") {
        state.tickRate = tickRate
        await setWorldState(state)
      }
      return NextResponse.json({ message: "Tick rate updated", tickRate })

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
}
