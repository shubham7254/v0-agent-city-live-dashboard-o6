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
const COUNCIL_START_HOUR = 18
const COUNCIL_END_HOUR = 21

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

function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Check if an agent should be awake at this hour ──
function isAwakeAt(agent: Agent, hour: number): boolean {
  if (agent.schedule.sleepHour > agent.schedule.wakeHour) {
    return hour >= agent.schedule.wakeHour && hour < agent.schedule.sleepHour
  }
  return hour >= agent.schedule.wakeHour || hour < agent.schedule.sleepHour
}

function isWorkingAt(agent: Agent, hour: number): boolean {
  return isAwakeAt(agent, hour) && hour >= agent.schedule.workStartHour && hour < agent.schedule.workEndHour
}

// ── Get awake agents ──
function getAwakeAgents(state: WorldState): Agent[] {
  return state.agents.filter((a) => isAwakeAt(a, state.hour))
}

function getSleepingAgents(state: WorldState): Agent[] {
  return state.agents.filter((a) => !isAwakeAt(a, state.hour))
}

// ── Update all agent statuses based on schedule ──
function updateAgentStatuses(state: WorldState): void {
  const hour = state.hour
  for (const agent of state.agents) {
    if (agent.status === "in_council") continue

    if (!isAwakeAt(agent, hour)) {
      agent.status = "sleeping"
      agent.position = { ...agent.homePosition }
    } else if (isWorkingAt(agent, hour)) {
      if (agent.status === "sleeping") {
        agent.status = "commuting"
      }
      // Gradually move towards work position
      const dx = agent.workPosition.x - agent.position.x
      const dy = agent.workPosition.y - agent.position.y
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        agent.position.x += Math.sign(dx) * Math.min(2, Math.abs(dx))
        agent.position.y += Math.sign(dy) * Math.min(2, Math.abs(dy))
        agent.status = "commuting"
      } else {
        agent.position = { ...agent.workPosition }
        agent.status = "working"
      }
    } else if (hour === agent.schedule.lunchHour) {
      // Lunch time - go to market area or stay put
      if (Math.random() < 0.5) {
        agent.status = "socializing"
      } else {
        agent.status = "idle"
      }
    } else {
      // Free time
      const roll = Math.random()
      if (roll < 0.3) agent.status = "socializing"
      else if (roll < 0.5) agent.status = "shopping"
      else agent.status = "idle"

      // Wander a bit
      if (Math.random() < 0.3) {
        agent.position = {
          x: clamp(agent.position.x + Math.floor(Math.random() * 3 - 1), 24, 38),
          y: clamp(agent.position.y + Math.floor(Math.random() * 3 - 1), 24, 38),
        }
      }
    }
  }
}

// ── Generate events appropriate to current time ──
function generateTimeAppropriateEvents(state: WorldState): WorldEvent[] {
  const events: WorldEvent[] = []
  const hour = state.hour
  const awake = getAwakeAgents(state)
  const sleeping = getSleepingAgents(state)
  const phase = state.phase

  if (awake.length === 0) {
    // Everyone is sleeping - only ambient events
    if (Math.random() < 0.4) {
      events.push(generateAmbientEvent(state))
    }
    return events
  }

  // Role-specific activities based on time of day
  if (phase === "morning") {
    if (Math.random() < 0.3) {
      const agent = randomPick(awake)
      const morningActivities: Record<string, string[]> = {
        Schoolchild: [
          `${agent.name} (age ${agent.age}) walks to school, chatting with friends along the road.`,
          `${agent.name} runs ahead of the other children, excited about today's lesson.`,
          `${agent.name} stops to watch a butterfly near the school gate.`,
        ],
        Student: [
          `${agent.name} heads to college with books under their arm.`,
          `${agent.name} reviews notes while walking to the morning lecture.`,
        ],
        Farmer: [
          `${agent.name} checks the crops at dawn. The ${state.weather === "rain" ? "rain is good for the soil" : "morning dew glistens on the leaves"}.`,
          `${agent.name} feeds the livestock before the sun gets too high.`,
        ],
        Doctor: [
          `Dr. ${agent.name} arrives at the hospital for morning rounds.`,
          `Dr. ${agent.name} reviews overnight patient charts at the hospital.`,
        ],
        Nurse: [
          `${agent.name} prepares medical supplies for the day at the hospital.`,
          `${agent.name} checks on patients who stayed overnight.`,
        ],
        Baker: [
          `${agent.name} has been up since 4 AM. Fresh bread is already in the oven.`,
          `The smell of ${agent.name}'s fresh bread drifts through the market square.`,
        ],
        Shopkeeper: [
          `${agent.name} opens their shop for the day, arranging goods in the window.`,
          `${agent.name} sweeps the storefront and greets early customers.`,
        ],
        Guard: [
          `${agent.name} begins the morning patrol around the settlement walls.`,
          `${agent.name} reports to the watchtower for the day shift.`,
        ],
        Elder: [
          `${agent.name} (age ${agent.age}) takes a slow morning walk through the village.`,
          `${agent.name} sits on the bench near the council hall, watching the village wake up.`,
        ],
      }
      const templates = morningActivities[agent.archetype] ?? [
        `${agent.name} starts their day with a walk to work.`,
        `${agent.name} greets neighbors on the way to the ${agent.archetype === "Teacher" ? "school" : "workshop"}.`,
      ]
      events.push({
        id: `evt-${uid()}`, type: "daily_activity", description: randomPick(templates),
        severity: "low", position: agent.position, day: state.day, phase, timestamp: Date.now(),
        involvedAgents: [agent.id],
      })
    }
  }

  if (phase === "day") {
    if (Math.random() < 0.25) {
      const workers = awake.filter((a) => a.status === "working")
      if (workers.length > 0) {
        const agent = randomPick(workers)
        const dayActivities: Record<string, string[]> = {
          Schoolchild: [
            `${agent.name}'s class is learning about ${randomPick(["math", "history", "nature", "reading", "writing"])} today.`,
            `${agent.name} plays with friends during recess in the school yard.`,
            `Teacher catches ${agent.name} daydreaming in class.`,
          ],
          Student: [
            `${agent.name} attends a ${randomPick(["philosophy", "engineering", "medicine", "agriculture", "history"])} lecture at college.`,
            `${agent.name} studies in the college library between classes.`,
          ],
          Doctor: [
            `Dr. ${agent.name} treats a patient with ${randomPick(["a sprained ankle", "a cold", "a minor burn", "stomach ache"])}.`,
            `Dr. ${agent.name} discusses treatment plans with the nursing staff.`,
          ],
          Nurse: [
            `${agent.name} administers ${randomPick(["medicine", "bandages", "a health checkup"])} at the hospital.`,
          ],
          Teacher: [
            `${agent.name} teaches the children about ${randomPick(["the history of the settlement", "basic arithmetic", "reading and writing", "plants and herbs"])}.`,
          ],
          Farmer: [
            `${agent.name} works the fields, ${randomPick(["planting new seeds", "weeding between rows", "checking irrigation", "harvesting ripe crops"])}.`,
          ],
          Shopkeeper: [
            `${agent.name}'s shop is ${state.metrics.morale > 60 ? "busy with customers today" : "quieter than usual"}.`,
          ],
          Blacksmith: [
            `${agent.name} hammers at the forge, sparks flying as they craft ${randomPick(["tools", "nails", "a new gate hinge", "horseshoes"])}.`,
          ],
          Baker: [
            `${agent.name} pulls a batch of ${randomPick(["sourdough", "rye bread", "sweet rolls", "meat pies"])} from the oven.`,
          ],
          Guard: [
            `${agent.name} patrols the ${randomPick(["northern", "southern", "eastern", "western"])} perimeter.`,
          ],
          Merchant: [
            `${agent.name} negotiates with a traveling trader for ${randomPick(["spices", "fabric", "tools", "seeds"])}.`,
          ],
        }
        const templates = dayActivities[agent.archetype] ?? [
          `${agent.name} continues their work as a ${agent.archetype.toLowerCase()}.`,
        ]
        events.push({
          id: `evt-${uid()}`, type: "daily_activity", description: randomPick(templates),
          severity: "low", position: agent.position, day: state.day, phase, timestamp: Date.now(),
          involvedAgents: [agent.id],
        })
      }
    }

    // Social interactions between awake agents
    if (Math.random() < 0.15 && awake.length >= 2) {
      const pair = awake.sort(() => Math.random() - 0.5).slice(0, 2)
      const interactions = [
        `${pair[0].name} and ${pair[1].name} chat near the market square.`,
        `${pair[0].name} helps ${pair[1].name} carry supplies.`,
        `${pair[0].name} (${pair[0].archetype}) and ${pair[1].name} (${pair[1].archetype}) exchange news over lunch.`,
        `${pair[0].name} waves to ${pair[1].name} while passing on the main road.`,
      ]
      if (pair[0].ageGroup === "child" && pair[1].ageGroup === "child") {
        interactions.push(
          `${pair[0].name} and ${pair[1].name} play tag near the school.`,
          `${pair[0].name} shares their lunch with ${pair[1].name}.`,
        )
      }
      events.push({
        id: `evt-${uid()}`, type: "social_interaction", description: randomPick(interactions),
        severity: "low", position: pair[0].position, day: state.day, phase, timestamp: Date.now(),
        involvedAgents: pair.map((a) => a.id),
      })
    }
  }

  if (phase === "evening") {
    if (Math.random() < 0.25) {
      const agent = randomPick(awake)
      const eveningActivities: Record<string, string[]> = {
        Schoolchild: [
          `${agent.name} does homework by candlelight at home.`,
          `${agent.name} plays in the yard before bedtime.`,
        ],
        Student: [
          `${agent.name} reviews today's lessons at home.`,
          `${agent.name} hangs out with other students at the inn.`,
        ],
        Elder: [
          `${agent.name} tells stories to the children before their bedtime.`,
          `${agent.name} sits by the fire, reflecting on the day.`,
        ],
        default: [
          `${agent.name} returns home after a long day of work.`,
          `${agent.name} enjoys dinner with family at home.`,
          `${agent.name} visits the inn for a drink and conversation.`,
        ],
      }
      const templates = eveningActivities[agent.archetype] ?? eveningActivities.default
      events.push({
        id: `evt-${uid()}`, type: "evening_activity", description: randomPick(templates),
        severity: "low", position: agent.position, day: state.day, phase, timestamp: Date.now(),
        involvedAgents: [agent.id],
      })
    }
  }

  if (phase === "night") {
    // Only awake agents generate events
    if (awake.length > 0 && Math.random() < 0.3) {
      const agent = randomPick(awake)
      const nightActivities: Record<string, string[]> = {
        Guard: [
          `${agent.name} patrols the walls by torchlight. ${state.weather === "fog" ? "Visibility is poor." : "The night is clear."}`,
          `${agent.name} reports from the watchtower: "${Math.random() > 0.5 ? "All quiet on the perimeter." : "Movement spotted in the forest."}"`,
        ],
        Doctor: [
          `Dr. ${agent.name} tends to an emergency patient at the hospital.`,
          `Dr. ${agent.name} is on night call, reading medical texts by lamplight.`,
        ],
        Nurse: [
          `${agent.name} monitors patients through the night shift.`,
        ],
        default: [
          `${agent.name} can't sleep and takes a walk around the settlement.`,
          `${agent.name} works late by candlelight.`,
        ],
      }
      const templates = nightActivities[agent.archetype] ?? nightActivities.default
      events.push({
        id: `evt-${uid()}`, type: "night_activity", description: randomPick(templates),
        severity: "low", position: agent.position, day: state.day, phase, timestamp: Date.now(),
        involvedAgents: [agent.id],
      })
    }

    // Dreams from sleeping agents
    if (sleeping.length > 0 && Math.random() < 0.15) {
      const dreamer = randomPick(sleeping)
      const dreams = [
        `${dreamer.name} murmurs in their sleep${dreamer.ageGroup === "child" ? ", dreaming of adventures" : ""}.`,
        `${dreamer.name} ${dreamer.ageGroup === "child" ? "clutches a stuffed toy, sleeping peacefully" : "shifts in bed, the day's worries fading"}.`,
      ]
      events.push({
        id: `evt-${uid()}`, type: "dream", description: randomPick(dreams),
        severity: "low", position: dreamer.homePosition, day: state.day, phase, timestamp: Date.now(),
        involvedAgents: [dreamer.id],
      })
    }
  }

  // Weather-dependent ambient events (any time)
  if (Math.random() < 0.2) {
    events.push(generateAmbientEvent(state))
  }

  return events
}

function generateAmbientEvent(state: WorldState): WorldEvent {
  const timeDesc = state.phase === "night" ? "night" : state.phase === "morning" ? "morning" : state.phase === "evening" ? "evening" : "afternoon"

  const ambients: Record<string, string[]> = {
    clear: [
      `A gentle breeze carries the scent of wildflowers through the settlement this ${timeDesc}.`,
      `Birdsong fills the air as ${state.phase === "night" ? "an owl calls from the oak tree" : "sparrows flit between the rooftops"}.`,
      `${state.phase === "night" ? "Stars blanket the sky. The Milky Way is visible tonight." : "Sunlight glints off the river in the distance."}`,
    ],
    rain: [
      `Rain patters gently on the ${state.phase === "night" ? "sleeping" : "busy"} settlement.`,
      `Puddles form on the main road. ${state.phase === "day" ? "People hurry between buildings with hoods up." : "The sound is oddly soothing."}`,
    ],
    storm: [
      `Thunder rumbles across the sky. ${state.phase === "night" ? "Lightning illuminates the settlement briefly." : "Workers take shelter under the market awnings."}`,
      `The wind howls around the buildings. ${state.phase === "day" ? "The market stalls flap wildly." : "The watchtowers creak."}`,
    ],
    fog: [
      `Fog clings to the ground, making the settlement look ethereal this ${timeDesc}.`,
      `Visibility is low. ${state.phase === "night" ? "Lanterns glow like ghostly orbs." : "People call out to find each other."}`,
    ],
    heat: [
      `The ${state.phase === "night" ? "night" : "air"} is unusually warm. ${state.phase === "day" ? "People seek shade wherever possible." : "Sleep comes fitfully."}`,
    ],
  }
  const options = ambients[state.weather] ?? ambients.clear
  return {
    id: `evt-${uid()}`, type: "ambient", description: randomPick(options),
    severity: "low", day: state.day, phase: state.phase, timestamp: Date.now(), involvedAgents: [],
  }
}

// ── Hour-specific events (only fire once per real hour) ──
function runHourlyEvents(state: WorldState): { events: WorldEvent[]; news: NewsItem[]; chronicle?: ChronicleEntry } {
  const hour = state.hour
  const events: WorldEvent[] = []
  const news: NewsItem[] = []
  let chronicle: ChronicleEntry | undefined

  // Dawn
  if (hour === 5) {
    for (const he of state.humanEvents) {
      const key = he.simEffect.variable as keyof typeof state.metrics
      if (key in state.metrics) {
        ;(state.metrics as Record<string, number>)[key] = clamp(
          (state.metrics as Record<string, number>)[key] + he.simEffect.modifier, 0, 200
        )
      }
    }
    news.push({
      id: `news-${uid()}`,
      headline: generateMorningHeadline(state),
      body: `Day ${state.day} begins. Population: ${state.metrics.population}. Morale: ${state.metrics.morale}%. The ${getAwakeAgents(state).length} early risers begin their routines.`,
      category: "morning_brief",
      severity: "low",
      day: state.day,
      timestamp: Date.now(),
    })
  }

  // School bell
  if (hour === 8) {
    const students = state.agents.filter((a) => a.ageGroup === "child" || (a.ageGroup === "teen" && a.archetype === "Student"))
    if (students.length > 0) {
      events.push({
        id: `evt-${uid()}`, type: "school_bell",
        description: `The school bell rings! ${students.length} students head to class.`,
        severity: "low", position: { x: 35, y: 27 }, day: state.day, phase: state.phase, timestamp: Date.now(),
        involvedAgents: students.map((s) => s.id),
      })
    }
  }

  // Market opens
  if (hour === 9) {
    const merchants = state.agents.filter((a) => ["Shopkeeper", "Baker", "Merchant", "Tailor"].includes(a.archetype))
    if (merchants.length > 0) {
      events.push({
        id: `evt-${uid()}`, type: "market_opens",
        description: `The market opens for business. ${merchants.length} vendors set up their stalls.`,
        severity: "low", position: { x: 32, y: 30 }, day: state.day, phase: state.phase, timestamp: Date.now(),
        involvedAgents: merchants.map((m) => m.id),
      })
    }
  }

  // Lunch rush
  if (hour === 12) {
    events.push({
      id: `evt-${uid()}`, type: "lunch_time",
      description: "The lunch bell rings. Workers stream towards the market and inn for their midday meal.",
      severity: "low", position: { x: 32, y: 30 }, day: state.day, phase: state.phase, timestamp: Date.now(),
      involvedAgents: [],
    })
  }

  // Resource accounting at 14:00
  if (hour === 14) {
    const farmers = state.agents.filter((a) => a.archetype === "Farmer" || a.archetype === "Fisher")
    state.metrics.foodDays = clamp(state.metrics.foodDays + farmers.length * 1.5 - state.metrics.population * 0.3, 0, 200)
    state.metrics.waterDays = clamp(state.metrics.waterDays - state.metrics.population * 0.2 + 4, 0, 200)
  }

  // School ends
  if (hour === 14) {
    const kids = state.agents.filter((a) => a.ageGroup === "child")
    if (kids.length > 0) {
      events.push({
        id: `evt-${uid()}`, type: "school_out",
        description: `School's out! ${kids.length} children pour out of the school, laughing and playing.`,
        severity: "low", position: { x: 35, y: 27 }, day: state.day, phase: state.phase, timestamp: Date.now(),
        involvedAgents: kids.map((k) => k.id),
      })
    }
  }

  // Council meeting at 18:00
  if (hour === COUNCIL_START_HOUR) {
    const adults = state.agents.filter((a) => a.ageGroup === "adult" || a.ageGroup === "elder")
    state.councilActive = true
    state.councilAnnouncement = `Council meeting begins! ${adults.length} adult citizens gather at the Council Hall.`

    for (const agent of adults) {
      agent.status = "in_council"
      agent.position = { x: 30, y: 30 }
    }

    const proposers = [...adults].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2))
    const proposals: Proposal[] = proposers.map((a) => brain.generateProposal(a, state))
    const dialogue: CouncilDialogue[] = []

    const chair = adults.reduce((a, b) => a.influence > b.influence ? a : b)
    dialogue.push({
      agentId: chair.id,
      message: `Welcome, everyone. It's ${formatHour(hour)} and we have ${proposals.length} proposals to discuss tonight. Children are at home, this is adult business.`,
      timestamp: Date.now(), type: "opinion",
    })

    // Discuss human news
    if (state.humanEvents.length > 0) {
      for (const he of state.humanEvents.slice(0, 2)) {
        const reactor = randomPick(adults)
        dialogue.push({ agentId: reactor.id, message: brain.generateHumanNewsReaction(reactor, he, state), timestamp: Date.now(), type: "human_news_reaction", referencedHumanEvent: he.headline })
        const responder = randomPick(adults.filter((a) => a.id !== reactor.id))
        dialogue.push({ agentId: responder.id, message: brain.generateDialogue(responder, he.headline, state), timestamp: Date.now(), type: "debate", referencedHumanEvent: he.headline })
      }
    }

    for (const p of proposals) {
      const proposer = state.agents.find((a) => a.id === p.proposedBy)!
      dialogue.push({ agentId: proposer.id, message: `I propose: "${p.title}". ${brain.generateDialogue(proposer, p.title, state)}`, timestamp: Date.now(), type: "proposal", referencedProposal: p.id })
      const debaters = adults.filter((a) => a.id !== proposer.id).sort(() => Math.random() - 0.5).slice(0, 3)
      for (const d of debaters) {
        dialogue.push({ agentId: d.id, message: brain.generateDialogue(d, p.title, state), timestamp: Date.now(), type: "debate", referencedProposal: p.id })
      }
    }

    for (const proposal of proposals) {
      for (const agent of adults) {
        const vote = brain.generateVote(agent, proposal, state)
        proposal.votes[agent.id] = vote
        dialogue.push({ agentId: agent.id, message: brain.generateVoteStatement(agent, proposal, vote, state), timestamp: Date.now(), type: "vote_statement", referencedProposal: proposal.id })
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
        news.push({ id: `news-${uid()}`, headline: `Council approves: ${proposal.title}`, body: `Passed ${yesCount}-${noCount}.`, category: "breaking", severity: "medium", day: state.day, timestamp: Date.now() })
      }
      dialogue.push({ agentId: chair.id, message: `"${proposal.title}" result: ${proposal.status.toUpperCase()} (${yesCount}-${noCount}).`, timestamp: Date.now(), type: "opinion", referencedProposal: proposal.id })
    }

    dialogue.push({ agentId: chair.id, message: `Meeting adjourned. Good night, everyone.`, timestamp: Date.now(), type: "opinion" })

    state.council = { day: state.day, proposals, currentSpeaker: proposers[0]?.id ?? null, dialogue, nextCouncilIn: 24, isActive: true, startHour: COUNCIL_START_HOUR, endHour: COUNCIL_END_HOUR }
  }

  if (hour === COUNCIL_END_HOUR) {
    state.councilActive = false
    state.councilAnnouncement = null
    if (state.council) state.council.isActive = false
    for (const agent of state.agents) {
      if (agent.status === "in_council") agent.status = "idle"
    }
  }

  // Night report at 4 AM
  if (hour === 4) {
    news.push({
      id: `news-${uid()}`,
      headline: `Night ${state.day} report`,
      body: `Night passes. ${getSleepingAgents(state).length} people sleeping, ${getAwakeAgents(state).length} awake. Morale: ${state.metrics.morale}%.`,
      category: "night_recap",
      severity: "low",
      day: state.day,
      timestamp: Date.now(),
    })

    // Weather is now set from real Michigan data in the tick route

    state.metrics.morale = clamp(state.metrics.morale + (state.metrics.foodDays > 20 ? 2 : -3) + (state.metrics.unrest > 50 ? -3 : 1), 0, 100)
    state.metrics.unrest = clamp(state.metrics.unrest + (state.metrics.morale < 40 ? 3 : -2), 0, 100)

    const allNews = [...state.news, ...news]
    const dayNews = allNews.filter((n) => n.day === state.day)
    chronicle = {
      day: state.day,
      headlines: dayNews.slice(0, 3).map((n) => n.headline),
      keyVote: state.council.proposals[0]
        ? { title: state.council.proposals[0].title, result: state.council.proposals[0].status as "approved" | "rejected" }
        : undefined,
      topMoments: state.recentEvents.filter((e) => e.day === state.day).slice(0, 3).map((e) => e.description),
      metricsSnapshot: { ...state.metrics },
      timestamp: Date.now(),
    }
  }

  // Random hourly events
  if (Math.random() < 0.15) {
    const awake = getAwakeAgents(state)
    if (awake.length > 0) {
      const randomEvents = [
        { type: "minor_accident", desc: `A cart tips over near the market. No one hurt.`, severity: "low" as const },
        { type: "good_news", desc: `A wild apple tree discovered just outside the walls.`, severity: "low" as const },
        { type: "dispute", desc: `Two neighbors argue about fence boundaries.`, severity: "low" as const },
        { type: "celebration", desc: `Someone's birthday! The baker makes a special cake.`, severity: "low" as const },
      ]
      const e = randomPick(randomEvents)
      const agent = randomPick(awake)
      events.push({
        id: `evt-${uid()}`, type: e.type, description: e.desc,
        severity: e.severity, position: agent.position, day: state.day, phase: state.phase, timestamp: Date.now(),
        involvedAgents: [agent.id],
      })
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

  const now = new Date()
  // Use Michigan (America/Detroit) timezone
  const realHour = parseInt(now.toLocaleString("en-US", { timeZone: "America/Detroit", hour: "numeric", hour12: false }), 10) % 24
  const prevHour = s.hour

  if (realHour < prevHour && prevHour >= 22) {
    s.day++
  }

  s.hour = realHour
  s.phase = getPhaseForHour(s.hour)

  if (s.hour < COUNCIL_START_HOUR) {
    s.council.nextCouncilIn = COUNCIL_START_HOUR - s.hour
  } else if (s.hour >= COUNCIL_END_HOUR) {
    s.council.nextCouncilIn = 24 - s.hour + COUNCIL_START_HOUR
  } else {
    s.council.nextCouncilIn = 0
  }

  // Update agent statuses based on their personal schedules
  updateAgentStatuses(s)

  // Passive stat changes for all agents
  for (const agent of s.agents) {
    if (agent.status === "sleeping") {
      agent.energy = clamp(agent.energy + 3, 0, 100)
      agent.stress = clamp(agent.stress - 2, 0, 100)
      agent.hunger = clamp(agent.hunger - 0.5, 0, 100)
    } else if (agent.status === "working") {
      agent.energy = clamp(agent.energy - 1.5, 0, 100)
      agent.hunger = clamp(agent.hunger + 1, 0, 100)
      agent.stress = clamp(agent.stress + (Math.random() * 2 - 0.5), 0, 100)
    }
  }

  let hourEvents: WorldEvent[] = []
  let hourNews: NewsItem[] = []
  let chronicle: ChronicleEntry | undefined

  // Only run hourly events once per real hour change
  const hourChanged = s.hour !== s.lastProcessedHour
  if (hourChanged) {
    const result = runHourlyEvents(s)
    hourEvents = result.events
    hourNews = result.news
    chronicle = result.chronicle
    s.lastProcessedHour = s.hour
  }

  // Generate time-appropriate events every tick
  const tickEvents = generateTimeAppropriateEvents(s)

  const allEvents = [...hourEvents, ...tickEvents]
  const allNews = [...hourNews]

  s.recentEvents = [...allEvents, ...s.recentEvents].slice(0, 50)
  s.news = [...allNews, ...s.news].slice(0, 50)

  return { state: s, events: allEvents, news: allNews, chronicle }
}

function generateMorningHeadline(state: WorldState): string {
  const headlines = [
    `Day ${state.day}: ${state.metrics.population} people wake under ${state.weather} skies`,
    `Dawn breaks over Agent City - Day ${state.day}`,
    `Day ${state.day}: Morale at ${state.metrics.morale}%, ${state.metrics.foodDays.toFixed(0)} days of food remaining`,
  ]
  return randomPick(headlines)
}
