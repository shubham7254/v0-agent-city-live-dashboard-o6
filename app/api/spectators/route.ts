import { NextResponse } from "next/server"
import { registerSpectator, getSpectatorCount } from "@/lib/redis"

// POST: heartbeat from a viewer
export async function POST(req: Request) {
  try {
    const { viewerId } = await req.json()
    if (!viewerId || typeof viewerId !== "string") {
      return NextResponse.json({ error: "Missing viewerId" }, { status: 400 })
    }
    const count = await registerSpectator(viewerId)
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ error: "Failed to register" }, { status: 500 })
  }
}

// GET: just return current count
export async function GET() {
  try {
    const count = await getSpectatorCount()
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
