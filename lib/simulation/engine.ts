import type {
  Agent,
  ChronicleEntry,
  NewsItem,
  Phase,
  Proposal,
  WorldEvent,
  WorldState,
} from "../types"
import { MockBrain } from "./mock-brain"

const brain = new MockBrain()

const PHASE_ORDER: Phase[] = ["morning", "day", "evening", "night"]
const WEATHERS: WorldState["weather"][] = ["clear", "rain", "storm", "fog", "heat"]

function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Phase Handlers ──

function runMorning(state: WorldState): { events: WorldEvent[]; news: NewsItem[] } {
  const events: WorldEvent[] = []
  const news: NewsItem[] = []

  // Apply human world events
  for (const he of state.humanEvents) {
    const key = he.simEffect.variable as keyof typeof state.metrics
    if (key in state.metrics) {
      ;(state.metrics as Record<string, number>)[key] = clamp(
        (state.metrics as Record<string, number>)[key] + he.simEffect.modifier,
        0,
        100
      )
    }
  }

  // Morning brief
  const headline = generateMorningHeadline(state)
  news.push({
    id: `news-${uid()}`,
    headline,
    body: `Day ${state.day} begins. Population: ${state.metrics.population}. Morale: ${state.metrics.morale}%.`,
    category: "morning_brief",
    severity: "low",
    day: state.day,
    timestamp: Date.now(),
  })

  // Wake agents
  for (const agent of state.agents) {
    agent.status = "idle"
    agent.energy = clamp(agent.energy + 20, 0, 100)
    agent.hunger = clamp(agent.hunger + 10, 0, 100)
  }

  // Random morning event
  if (Math.random() < 0.3) {
    const eventTypes = [
      { type: "wildlife_spotted", desc: "Wild deer spotted near the settlement", severity: "low" as const },
      { type: "resource_found", desc: "A new berry patch discovered", severity: "low" as const },
      { type: "weather_shift", desc: "The wind changes direction", severity: "medium" as const },
    ]
    const e = randomPick(eventTypes)
    const agent = randomPick(state.agents)
    events.push({
      id: `evt-${uid()}`,
      type: e.type,
      description: e.desc,
      severity: e.severity,
      position: agent.position,
      day: state.day,
      phase: "morning",
      timestamp: Date.now(),
      involvedAgents: [agent.id],
    })
  }

  return { events, news }
}

function runDay(state: WorldState): { events: WorldEvent[] } {
  const events: WorldEvent[] = []

  for (const agent of state.agents) {
    agent.status = "working"
    const action = brain.decideAction(agent, state)
    agent.recentActions = [action, ...agent.recentActions.slice(0, 4)]

    // Apply action effects
    agent.energy = clamp(agent.energy - 15, 0, 100)
    agent.hunger = clamp(agent.hunger + 8, 0, 100)
    agent.stress = clamp(agent.stress + (Math.random() * 10 - 3), 0, 100)

    // Move agent slightly
    agent.position = {
      x: clamp(agent.position.x + Math.floor(Math.random() * 3 - 1), 1, 58),
      y: clamp(agent.position.y + Math.floor(Math.random() * 3 - 1), 1, 58),
    }
  }

  // Resource generation
  const farmers = state.agents.filter((a) => a.archetype === "Farmer" || a.archetype === "Hunter")
  state.metrics.foodDays = clamp(state.metrics.foodDays + farmers.length * 2 - state.metrics.population * 0.5, 0, 200)
  state.metrics.waterDays = clamp(state.metrics.waterDays - state.metrics.population * 0.3 + 3, 0, 200)

  // Random day event
  if (Math.random() < 0.4) {
    const eventTypes = [
      { type: "fire_outbreak", desc: "A small fire breaks out near the forest edge", severity: "high" as const },
      { type: "bountiful_harvest", desc: "The crops yield more than expected", severity: "low" as const },
      { type: "illness", desc: "Several settlers report feeling unwell", severity: "medium" as const },
      { type: "discovery", desc: "An old ruin found to the east", severity: "medium" as const },
    ]
    const e = randomPick(eventTypes)
    const agent = randomPick(state.agents)
    events.push({
      id: `evt-${uid()}`,
      type: e.type,
      description: e.desc,
      severity: e.severity,
      position: agent.position,
      day: state.day,
      phase: "day",
      timestamp: Date.now(),
      involvedAgents: [agent.id],
    })

    // Apply event effects
    if (e.type === "fire_outbreak") {
      state.metrics.fireStability = clamp(state.metrics.fireStability - 10, 0, 100)
      state.metrics.unrest = clamp(state.metrics.unrest + 5, 0, 100)
    } else if (e.type === "bountiful_harvest") {
      state.metrics.foodDays = clamp(state.metrics.foodDays + 8, 0, 200)
      state.metrics.morale = clamp(state.metrics.morale + 5, 0, 100)
    } else if (e.type === "illness") {
      state.metrics.healthRisk = clamp(state.metrics.healthRisk + 12, 0, 100)
    }
  }

  return { events }
}

function runEvening(state: WorldState): { events: WorldEvent[]; news: NewsItem[] } {
  const events: WorldEvent[] = []
  const news: NewsItem[] = []

  // Council session
  for (const agent of state.agents) {
    agent.status = "in_council"
  }

  // Generate proposals from 2-3 random agents
  const proposers = [...state.agents].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2))
  const proposals: Proposal[] = proposers.map((a) => brain.generateProposal(a, state))

  // Generate dialogue
  const dialogue: { agentId: string; message: string; timestamp: number }[] = []
  for (const p of proposals) {
    const proposer = state.agents.find((a) => a.id === p.proposedBy)!
    dialogue.push({
      agentId: proposer.id,
      message: `I propose: ${p.title}. ${brain.generateDialogue(proposer, p.title, state)}`,
      timestamp: Date.now(),
    })

    // Random responder
    const responder = randomPick(state.agents.filter((a) => a.id !== proposer.id))
    dialogue.push({
      agentId: responder.id,
      message: brain.generateDialogue(responder, p.title, state),
      timestamp: Date.now(),
    })
  }

  // Voting
  for (const proposal of proposals) {
    for (const agent of state.agents) {
      proposal.votes[agent.id] = brain.generateVote(agent, proposal, state)
    }

    const yesCount = Object.values(proposal.votes).filter((v) => v === "yes").length
    const noCount = Object.values(proposal.votes).filter((v) => v === "no").length
    proposal.status = yesCount > noCount ? "approved" : "rejected"

    // Apply approved proposals
    if (proposal.status === "approved") {
      for (const impact of proposal.expectedImpact) {
        const key = impact.metric as keyof typeof state.metrics
        if (key in state.metrics) {
          const current = state.metrics[key] as number
          const delta = impact.direction === "up" ? impact.amount : -impact.amount
          ;(state.metrics as Record<string, number>)[key] = clamp(current + delta, 0, 200)
        }
      }

      news.push({
        id: `news-${uid()}`,
        headline: `Council approves: ${proposal.title}`,
        body: `The proposal passed with ${yesCount} votes in favor.`,
        category: "breaking",
        severity: "medium",
        day: state.day,
        timestamp: Date.now(),
      })
    }
  }

  state.council = {
    day: state.day,
    proposals,
    currentSpeaker: proposers[0]?.id ?? null,
    dialogue,
    nextCouncilIn: 4,
  }

  // Update vote histories
  for (const agent of state.agents) {
    const lastVote = proposals[0]?.votes[agent.id]
    if (lastVote) {
      agent.voteHistory = [lastVote, ...agent.voteHistory.slice(0, 9)]
    }
  }

  return { events, news }
}

function runNight(state: WorldState): { events: WorldEvent[]; news: NewsItem[]; chronicle?: ChronicleEntry } {
  const events: WorldEvent[] = []
  const news: NewsItem[] = []

  // Assign watchers and sleepers
  const watchers = state.agents.filter((a) => a.archetype === "Warrior" || a.archetype === "Scout")
  for (const agent of state.agents) {
    if (watchers.includes(agent)) {
      agent.status = "on_watch"
      agent.energy = clamp(agent.energy - 10, 0, 100)
    } else {
      agent.status = "sleeping"
      agent.energy = clamp(agent.energy + 25, 0, 100)
      agent.stress = clamp(agent.stress - 15, 0, 100)
      agent.hunger = clamp(agent.hunger - 5, 0, 100)
    }
  }

  // Night random events
  if (Math.random() < 0.25) {
    const nightEvents = [
      { type: "strange_noise", desc: "Strange noises echo from the mountains", severity: "low" as const },
      { type: "night_raid", desc: "Wild animals raid the food stores", severity: "high" as const },
      { type: "meteor_shower", desc: "A meteor shower lights up the sky", severity: "low" as const },
      { type: "flooding", desc: "Heavy rain causes minor flooding", severity: "medium" as const },
    ]
    const e = randomPick(nightEvents)
    events.push({
      id: `evt-${uid()}`,
      type: e.type,
      description: e.desc,
      severity: e.severity,
      day: state.day,
      phase: "night",
      timestamp: Date.now(),
      involvedAgents: watchers.map((w) => w.id),
    })

    if (e.type === "night_raid") {
      state.metrics.foodDays = clamp(state.metrics.foodDays - 6, 0, 200)
      state.metrics.unrest = clamp(state.metrics.unrest + 8, 0, 100)
    }
    if (e.type === "flooding") {
      state.metrics.waterDays = clamp(state.metrics.waterDays + 5, 0, 200)
      state.metrics.healthRisk = clamp(state.metrics.healthRisk + 5, 0, 100)
    }
  }

  // Night recap
  news.push({
    id: `news-${uid()}`,
    headline: `Night ${state.day} recap`,
    body: `The settlement rests. Watchers report ${Math.random() > 0.5 ? "a quiet night" : "some disturbances"}.`,
    category: "night_recap",
    severity: "low",
    day: state.day,
    timestamp: Date.now(),
  })

  // Weather change
  if (Math.random() < 0.3) {
    state.weather = randomPick(WEATHERS)
  }

  // Morale/unrest natural drift
  state.metrics.morale = clamp(
    state.metrics.morale + (state.metrics.foodDays > 20 ? 2 : -3) + (state.metrics.unrest > 50 ? -3 : 1),
    0, 100
  )
  state.metrics.unrest = clamp(
    state.metrics.unrest + (state.metrics.morale < 40 ? 3 : -2),
    0, 100
  )

  // Create chronicle at end of day
  const allNews = [...state.news, ...news]
  const dayNews = allNews.filter((n) => n.day === state.day)
  const chronicle: ChronicleEntry = {
    day: state.day,
    headlines: dayNews.slice(0, 3).map((n) => n.headline),
    keyVote: state.council.proposals[0]
      ? {
          title: state.council.proposals[0].title,
          result: state.council.proposals[0].status as "approved" | "rejected",
        }
      : undefined,
    topMoments: state.recentEvents.filter((e) => e.day === state.day).slice(0, 3).map((e) => e.description),
    metricsSnapshot: { ...state.metrics },
    timestamp: Date.now(),
  }

  return { events, news, chronicle }
}

// ── Main Tick ──

export interface TickResult {
  state: WorldState
  events: WorldEvent[]
  news: NewsItem[]
  chronicle?: ChronicleEntry
}

export function executeTick(state: WorldState): TickResult {
  const s = structuredClone(state)
  s.tick++
  s.lastTickAt = Date.now()

  let events: WorldEvent[] = []
  let news: NewsItem[] = []
  let chronicle: ChronicleEntry | undefined

  const currentPhaseIndex = PHASE_ORDER.indexOf(s.phase)

  switch (s.phase) {
    case "morning": {
      const r = runMorning(s)
      events = r.events
      news = r.news
      break
    }
    case "day": {
      const r = runDay(s)
      events = r.events
      break
    }
    case "evening": {
      const r = runEvening(s)
      events = r.events
      news = r.news
      break
    }
    case "night": {
      const r = runNight(s)
      events = r.events
      news = r.news
      chronicle = r.chronicle
      break
    }
  }

  // Advance phase
  const nextIndex = (currentPhaseIndex + 1) % 4
  s.phase = PHASE_ORDER[nextIndex]
  if (nextIndex === 0) {
    s.day++
  }

  // Merge events and news
  s.recentEvents = [...events, ...s.recentEvents].slice(0, 50)
  s.news = [...news, ...s.news].slice(0, 50)

  // Update council countdown
  if (s.council.nextCouncilIn > 0) {
    s.council.nextCouncilIn--
  }

  return { state: s, events, news, chronicle }
}

function generateMorningHeadline(state: WorldState): string {
  const headlines = [
    `Day ${state.day}: The settlement awakens under ${state.weather} skies`,
    `Dawn breaks over Agent City - Day ${state.day}`,
    `A new day dawns. Morale stands at ${state.metrics.morale}%`,
    `Day ${state.day} begins with ${state.metrics.foodDays} days of food remaining`,
    `The ${state.weather} weather continues as Day ${state.day} starts`,
  ]
  return randomPick(headlines)
}
