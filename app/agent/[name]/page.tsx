import { getWorldState } from "@/lib/redis"
import { notFound } from "next/navigation"
import { AgentProfileView } from "@/components/agent/agent-profile-view"
import type { Metadata } from "next"

interface PageProps {
  params: Promise<{ name: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params
  const decodedName = decodeURIComponent(name)
  return {
    title: `${decodedName} - Agent City Live`,
    description: `View ${decodedName}'s profile, personality, relationships, and life story in Agent City.`,
    openGraph: {
      title: `${decodedName} - Agent City Live`,
      description: `View ${decodedName}'s profile, personality, relationships, and life story in Agent City.`,
    },
  }
}

export default async function AgentPage({ params }: PageProps) {
  const { name } = await params
  const decodedName = decodeURIComponent(name)

  const state = await getWorldState()
  if (!state) return notFound()

  const agent = state.agents.find(
    (a) => a.name.toLowerCase() === decodedName.toLowerCase() || a.id === decodedName
  )
  if (!agent) return notFound()

  // Resolve relationships
  const relationships = (agent.relationships ?? []).map((rel) => {
    const target = state.agents.find((a) => a.id === rel.targetId)
    return { ...rel, targetName: target?.name ?? "Unknown" }
  })

  const allyNames = (agent.allies ?? []).map((id) => {
    const a = state.agents.find((ag) => ag.id === id || ag.name === id)
    return a?.name ?? id
  })
  const rivalNames = (agent.rivals ?? []).map((id) => {
    const a = state.agents.find((ag) => ag.id === id || ag.name === id)
    return a?.name ?? id
  })

  return (
    <AgentProfileView
      agent={{ ...agent, relationships, allyNames, rivalNames }}
      day={state.day}
      phase={state.phase}
      weather={state.weather}
      allAgentNames={state.agents.map((a) => a.name)}
    />
  )
}
