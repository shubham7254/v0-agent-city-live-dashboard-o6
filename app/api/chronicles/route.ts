import { NextResponse } from "next/server"
import { getChronicles } from "@/lib/redis"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const chronicles = await getChronicles(30)
    return NextResponse.json({ chronicles })
  } catch (error) {
    console.error("Chronicles fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch chronicles" }, { status: 500 })
  }
}
