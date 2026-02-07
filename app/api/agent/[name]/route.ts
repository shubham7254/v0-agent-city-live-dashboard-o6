import { NextResponse } from "next/server"
import { getWorldState } from "@/lib/redis"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const decodedName = decodeURIComponent(name)

  const state = await getWorldState()
  if (!state) {
    return NextResponse.json({ error: "World not initialized" }, { status: 503 })
  }

  const agent = state.agents.find(
    (a) => a.name.toLowerCase() === decodedName.toLowerCase() || a.id === decodedName
  )

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  }

  // Resolve relationship names
  const relationships = (agent.relationships ?? []).map((rel) => {
    const target = state.agents.find((a) => a.id === rel.targetId)
    return { ...rel, targetName: target?.name ?? "Unknown" }
  })

  // Resolve ally/rival names
  const allyNames = (agent.allies ?? []).map((id) => {
    const a = state.agents.find((ag) => ag.id === id || ag.name === id)
    return a?.name ?? id
  })
  const rivalNames = (agent.rivals ?? []).map((id) => {
    const a = state.agents.find((ag) => ag.id === id || ag.name === id)
    return a?.name ?? id
  })

  return NextResponse.json({
    agent: {
      ...agent,
      relationships,
      allyNames,
      rivalNames,
    },
    day: state.day,
    phase: state.phase,
    weather: state.weather,
  })
}
