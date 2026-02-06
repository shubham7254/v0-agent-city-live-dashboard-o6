import type {
  Agent,
  ChronicleEntry,
  CouncilDialogue,
  NewsItem,
  Phase,
  Proposal,
  WorldEvent,
  WorldState,
} from "../types"
import { MockBrain } from "./mock-brain"

const brain = new MockBrain()

const WEATHERS: WorldState["weather"][] = ["clear", "rain", "storm", "fog", "heat"]

// 24-hour day: each tick = 1 hour
// Phase mapping: morning 5-11, day 12-17, evening 18-21, night 22-4
function getPhaseForHour(hour: number): Phase {
  if (hour >= 5 && hour <= 11) return "morning"
  if (hour >= 12 && hour <= 17) return "day"
  if (hour >= 18 && hour <= 21) return "evening"
  return "night"
}

function formatHour(hour: number): string {
  const h = hour % 24
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:00 ${ampm}`
}

// Council meeting scheduled at 18:00 (6 PM) every day
const COUNCIL_START_HOUR = 18
const COUNCIL_END_HOUR = 21

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

function runMorningHour(state: WorldState, hour: number): { events: WorldEvent[]; news: NewsItem[] } {
  const events: WorldEvent[] = []
  const news: NewsItem[] = []

  // First morning hour: apply human events + morning brief
  if (hour === 5) {
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

    news.push({
      id: `news-${uid()}`,
      headline: generateMorningHeadline(state),
      body: `Day ${state.day} begins at dawn (${formatHour(hour)}). Population: ${state.metrics.population}. Morale: ${state.metrics.morale}%.`,
      category: "morning_brief",
      severity: "low",
      day: state.day,
      timestamp: Date.now(),
    })

    // Wake agents
    for (const agent of state.agents) {
      agent.status = "idle"
      agent.energy = clamp(agent.energy + 20, 0, 100)
      agent.hunger = clamp(agent.hunger + 5, 0, 100)
    }
  }

  // Random morning events
  if (Math.random() < 0.12) {
    const eventTypes = [
      { type: "wildlife_spotted", desc: `Wild deer spotted near the settlement at ${formatHour(hour)}`, severity: "low" as const },
      { type: "resource_found", desc: `A new berry patch discovered this morning`, severity: "low" as const },
      { type: "weather_shift", desc: `The wind changes direction at ${formatHour(hour)}`, severity: "medium" as const },
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

function runDayHour(state: WorldState, hour: number): { events: WorldEvent[] } {
  const events: WorldEvent[] = []

  // Agents work during the day
  for (const agent of state.agents) {
    if (agent.status !== "in_council") {
      agent.status = "working"
      if (hour === 12) {
        const action = brain.decideAction(agent, state)
        agent.recentActions = [action, ...agent.recentActions.slice(0, 4)]
      }
      agent.energy = clamp(agent.energy - 3, 0, 100)
      agent.hunger = clamp(agent.hunger + 2, 0, 100)
      agent.stress = clamp(agent.stress + (Math.random() * 3 - 1), 0, 100)

      // Slight movement each hour
      if (Math.random() < 0.4) {
        agent.position = {
          x: clamp(agent.position.x + Math.floor(Math.random() * 3 - 1), 1, 58),
          y: clamp(agent.position.y + Math.floor(Math.random() * 3 - 1), 1, 58),
        }
      }
    }
  }

  // Resource generation (spread across day hours)
  if (hour === 14) {
    const farmers = state.agents.filter((a) => a.archetype === "Farmer" || a.archetype === "Hunter")
    state.metrics.foodDays = clamp(state.metrics.foodDays + farmers.length * 2 - state.metrics.population * 0.5, 0, 200)
    state.metrics.waterDays = clamp(state.metrics.waterDays - state.metrics.population * 0.3 + 3, 0, 200)
  }

  // Random day events
  if (Math.random() < 0.1) {
    const eventTypes = [
      { type: "fire_outbreak", desc: `A small fire breaks out near the forest edge at ${formatHour(hour)}`, severity: "high" as const },
      { type: "bountiful_harvest", desc: "The crops yield more than expected today", severity: "low" as const },
      { type: "illness", desc: `Several settlers report feeling unwell around ${formatHour(hour)}`, severity: "medium" as const },
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

function runEveningHour(state: WorldState, hour: number): { events: WorldEvent[]; news: NewsItem[] } {
  const events: WorldEvent[] = []
  const news: NewsItem[] = []

  // Council meeting starts at 18:00
  if (hour === COUNCIL_START_HOUR) {
    state.councilActive = true
    state.councilAnnouncement = `Council meeting begins now at ${formatHour(hour)}! All agents gather at the Council Hall.`

    // Move agents to council position and set status
    for (const agent of state.agents) {
      agent.status = "in_council"
      agent.position = { x: 30, y: 30 } // Council hall
    }

    // Generate proposals
    const proposers = [...state.agents].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2))
    const proposals: Proposal[] = proposers.map((a) => brain.generateProposal(a, state))

    // Build rich dialogue
    const dialogue: CouncilDialogue[] = []

    // Opening statement
    const chair = state.agents.reduce((a, b) => a.influence > b.influence ? a : b)
    dialogue.push({
      agentId: chair.id,
      message: `Welcome, everyone. It's ${formatHour(hour)} and we have ${proposals.length} proposals to discuss tonight. Let's begin.`,
      timestamp: Date.now(),
      type: "opinion",
    })

    // Agents discuss human news first
    if (state.humanEvents.length > 0) {
      const newsToDiscuss = state.humanEvents.slice(0, 2)
      for (const he of newsToDiscuss) {
        const reactor = randomPick(state.agents)
        dialogue.push({
          agentId: reactor.id,
          message: brain.generateHumanNewsReaction(reactor, he, state),
          timestamp: Date.now(),
          type: "human_news_reaction",
          referencedHumanEvent: he.headline,
        })

        // Another agent responds
        const responder = randomPick(state.agents.filter(a => a.id !== reactor.id))
        dialogue.push({
          agentId: responder.id,
          message: brain.generateDialogue(responder, he.headline, state),
          timestamp: Date.now(),
          type: "debate",
          referencedHumanEvent: he.headline,
        })
      }
    }

    // Proposals presented and debated
    for (const p of proposals) {
      const proposer = state.agents.find((a) => a.id === p.proposedBy)!
      dialogue.push({
        agentId: proposer.id,
        message: `I formally propose: "${p.title}". ${brain.generateDialogue(proposer, p.title, state)}`,
        timestamp: Date.now(),
        type: "proposal",
        referencedProposal: p.id,
      })

      // 2-3 agents debate each proposal
      const debaters = state.agents.filter((a) => a.id !== proposer.id).sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2))
      for (const debater of debaters) {
        dialogue.push({
          agentId: debater.id,
          message: brain.generateDialogue(debater, p.title, state),
          timestamp: Date.now(),
          type: "debate",
          referencedProposal: p.id,
        })
      }
    }

    // Voting
    for (const proposal of proposals) {
      for (const agent of state.agents) {
        const vote = brain.generateVote(agent, proposal, state)
        proposal.votes[agent.id] = vote

        // Each agent announces their vote
        dialogue.push({
          agentId: agent.id,
          message: brain.generateVoteStatement(agent, proposal, vote, state),
          timestamp: Date.now(),
          type: "vote_statement",
          referencedProposal: proposal.id,
        })
      }

      const yesCount = Object.values(proposal.votes).filter((v) => v === "yes").length
      const noCount = Object.values(proposal.votes).filter((v) => v === "no").length
      proposal.status = yesCount > noCount ? "approved" : "rejected"

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
          body: `The proposal passed with ${yesCount} votes in favor, ${noCount} against.`,
          category: "breaking",
          severity: "medium",
          day: state.day,
          timestamp: Date.now(),
        })
      }

      // Closing remark for this proposal
      dialogue.push({
        agentId: chair.id,
        message: `The vote on "${proposal.title}" is concluded: ${proposal.status.toUpperCase()} (${yesCount} for, ${noCount} against).`,
        timestamp: Date.now(),
        type: "opinion",
        referencedProposal: proposal.id,
      })
    }

    // Closing statement
    dialogue.push({
      agentId: chair.id,
      message: `That concludes tonight's council session. All proposals have been voted on. Meeting adjourned at ${formatHour(COUNCIL_END_HOUR)}.`,
      timestamp: Date.now(),
      type: "opinion",
    })

    state.council = {
      day: state.day,
      proposals,
      currentSpeaker: proposers[0]?.id ?? null,
      dialogue,
      nextCouncilIn: 24,
      isActive: true,
      startHour: COUNCIL_START_HOUR,
      endHour: COUNCIL_END_HOUR,
    }

    // Update vote histories
    for (const agent of state.agents) {
      const lastVote = proposals[0]?.votes[agent.id]
      if (lastVote) {
        agent.voteHistory = [lastVote, ...agent.voteHistory.slice(0, 9)]
      }
    }
  }

  // Council ends at 21:00
  if (hour === COUNCIL_END_HOUR) {
    state.councilActive = false
    state.councilAnnouncement = null
    if (state.council) {
      state.council.isActive = false
    }
    for (const agent of state.agents) {
      agent.status = "idle"
    }
  }

  // Non-council evening activities
  if (hour > COUNCIL_END_HOUR || hour < COUNCIL_START_HOUR) {
    for (const agent of state.agents) {
      if (agent.status !== "in_council") {
        agent.energy = clamp(agent.energy - 2, 0, 100)
      }
    }
  }

  return { events, news }
}

function runNightHour(state: WorldState, hour: number): { events: WorldEvent[]; news: NewsItem[]; chronicle?: ChronicleEntry } {
  const events: WorldEvent[] = []
  const news: NewsItem[] = []
  let chronicle: ChronicleEntry | undefined

  // Assign watchers/sleepers at 22:00
  if (hour === 22) {
    const watchers = state.agents.filter((a) => a.archetype === "Warrior" || a.archetype === "Scout")
    for (const agent of state.agents) {
      if (watchers.includes(agent)) {
        agent.status = "on_watch"
      } else {
        agent.status = "sleeping"
      }
    }
  }

  // Passive effects each night hour
  for (const agent of state.agents) {
    if (agent.status === "sleeping") {
      agent.energy = clamp(agent.energy + 4, 0, 100)
      agent.stress = clamp(agent.stress - 2, 0, 100)
      agent.hunger = clamp(agent.hunger - 1, 0, 100)
    } else if (agent.status === "on_watch") {
      agent.energy = clamp(agent.energy - 2, 0, 100)
    }
  }

  // Night random events
  if (Math.random() < 0.06) {
    const nightEvents = [
      { type: "strange_noise", desc: `Strange noises echo from the mountains at ${formatHour(hour)}`, severity: "low" as const },
      { type: "night_raid", desc: `Wild animals raid the food stores around ${formatHour(hour)}!`, severity: "high" as const },
      { type: "meteor_shower", desc: "A meteor shower lights up the sky", severity: "low" as const },
      { type: "flooding", desc: "Heavy rain causes minor flooding", severity: "medium" as const },
    ]
    const e = randomPick(nightEvents)
    const watchers = state.agents.filter(a => a.status === "on_watch")
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

  // End-of-day at hour 4 (before dawn)
  if (hour === 4) {
    news.push({
      id: `news-${uid()}`,
      headline: `Night ${state.day} recap`,
      body: `The settlement rests. Watchers report ${Math.random() > 0.5 ? "a quiet night" : "some disturbances"}.`,
      category: "night_recap",
      severity: "low",
      day: state.day,
      timestamp: Date.now(),
    })

    // Weather change chance
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
    chronicle = {
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

  // Sync hour with real-world clock
  const now = new Date()
  const realHour = now.getHours()
  const prevHour = s.hour

  // Detect if we crossed midnight (new day)
  if (realHour < prevHour && prevHour >= 22) {
    s.day++
  }

  s.hour = realHour
  s.phase = getPhaseForHour(s.hour)

  // Update council countdown based on real time
  if (s.hour < COUNCIL_START_HOUR) {
    s.council.nextCouncilIn = COUNCIL_START_HOUR - s.hour
  } else if (s.hour >= COUNCIL_END_HOUR) {
    s.council.nextCouncilIn = 24 - s.hour + COUNCIL_START_HOUR
  } else {
    s.council.nextCouncilIn = 0
  }

  let events: WorldEvent[] = []
  let news: NewsItem[] = []
  let chronicle: ChronicleEntry | undefined

  switch (s.phase) {
    case "morning": {
      const r = runMorningHour(s, s.hour)
      events = r.events
      news = r.news
      break
    }
    case "day": {
      const r = runDayHour(s, s.hour)
      events = r.events
      break
    }
    case "evening": {
      const r = runEveningHour(s, s.hour)
      events = r.events
      news = r.news
      break
    }
    case "night": {
      const r = runNightHour(s, s.hour)
      events = r.events
      news = r.news
      chronicle = r.chronicle
      break
    }
  }

  // Merge events and news
  s.recentEvents = [...events, ...s.recentEvents].slice(0, 50)
  s.news = [...news, ...s.news].slice(0, 50)

  return { state: s, events, news, chronicle }
}

function generateMorningHeadline(state: WorldState): string {
  const headlines = [
    `Day ${state.day}: The settlement awakens under ${state.weather} skies`,
    `Dawn breaks over Agent City - Day ${state.day}`,
    `A new day dawns. Morale stands at ${state.metrics.morale}%`,
    `Day ${state.day} begins with ${state.metrics.foodDays.toFixed(0)} days of food remaining`,
    `The ${state.weather} weather continues as Day ${state.day} starts`,
  ]
  return randomPick(headlines)
}
