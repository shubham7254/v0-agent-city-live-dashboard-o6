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

  // ── 22:00 - Night shift begins ──
  if (hour === 22) {
    const watchers = state.agents.filter((a) => a.archetype === "Warrior" || a.archetype === "Scout")
    const campfireGroup = state.agents.filter((a) => a.archetype === "Elder" || a.archetype === "Scholar" || a.archetype === "Artisan")
    const nightWorkers = state.agents.filter((a) => a.archetype === "Healer" || a.archetype === "Builder")

    for (const agent of state.agents) {
      if (watchers.includes(agent)) {
        agent.status = "on_watch"
      } else if (campfireGroup.includes(agent)) {
        agent.status = "idle" // at campfire
      } else if (nightWorkers.includes(agent)) {
        agent.status = "working" // night repairs/medicine
      } else {
        agent.status = "sleeping"
      }
    }

    news.push({
      id: `news-${uid()}`,
      headline: "Night falls over the settlement",
      body: `${watchers.length} sentries take their posts on the watchtowers. ${campfireGroup.length} settlers gather around the campfire. ${nightWorkers.length} continue essential work by lantern light.`,
      category: "night_update",
      severity: "low",
      day: state.day,
      timestamp: Date.now(),
    })
  }

  // ── Campfire stories (23:00) ──
  if (hour === 23) {
    const storytellers = state.agents.filter((a) => a.archetype === "Elder" || a.archetype === "Scholar")
    if (storytellers.length > 0) {
      const teller = randomPick(storytellers)
      const stories = [
        `${teller.name} tells the tale of the first settlers who crossed the mountains in winter.`,
        `${teller.name} recounts the legend of the River Spirit who protected the ancient village.`,
        `${teller.name} shares memories of a great harvest festival from years past, when the fields were golden.`,
        `${teller.name} warns of the "Hollow Season" - a famine from long ago that nearly ended everything.`,
        `${teller.name} speaks of distant lands across the ocean, where cities shine like stars.`,
        `${teller.name} tells a story about a scout who discovered a hidden valley filled with medicinal herbs.`,
      ]
      events.push({
        id: `evt-${uid()}`,
        type: "campfire_story",
        description: randomPick(stories),
        severity: "low",
        position: { x: 31, y: 31 },
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: [teller.id],
      })
      state.metrics.morale = clamp(state.metrics.morale + 2, 0, 100)

      // Listeners react
      const listeners = state.agents.filter((a) => a.id !== teller.id && a.status !== "sleeping")
      if (listeners.length > 0) {
        const reactor = randomPick(listeners)
        const reactions = [
          `${reactor.name} nods thoughtfully, gazing into the embers.`,
          `${reactor.name} asks "${teller.name}, do you think that could happen here?"`,
          `${reactor.name} smiles and adds their own memory to the tale.`,
          `${reactor.name} looks troubled, connecting the story to their current worries.`,
        ]
        events.push({
          id: `evt-${uid()}`,
          type: "campfire_reaction",
          description: randomPick(reactions),
          severity: "low",
          position: { x: 31, y: 31 },
          day: state.day,
          phase: "night",
          timestamp: Date.now(),
          involvedAgents: [reactor.id],
        })
      }
    }
  }

  // ── Midnight (00:00) - Deepest night ──
  if (hour === 0) {
    // Night patrol reports
    const watchers = state.agents.filter((a) => a.status === "on_watch")
    if (watchers.length > 0) {
      const sentry = randomPick(watchers)
      const patrols = [
        `${sentry.name} reports movement in the treeline. Likely deer, but they remain vigilant.`,
        `${sentry.name} spots distant lights on the horizon. Campfires? Travelers? Unknown.`,
        `${sentry.name} hears wolves howling to the north. The pack seems closer than last night.`,
        `${sentry.name} reports all clear from the eastern watchtower. Stars are bright tonight.`,
        `${sentry.name} notices the river level has ${Math.random() > 0.5 ? "risen" : "dropped"} since evening.`,
        `${sentry.name} spots an owl hunting near the granary. A good omen, they say.`,
      ]
      events.push({
        id: `evt-${uid()}`,
        type: "night_patrol",
        description: randomPick(patrols),
        severity: "low",
        position: sentry.position,
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: [sentry.id],
      })
    }

    // Midnight weather shift
    if (Math.random() < 0.25) {
      const oldWeather = state.weather
      state.weather = randomPick(WEATHERS)
      if (oldWeather !== state.weather) {
        events.push({
          id: `evt-${uid()}`,
          type: "weather_change",
          description: `The weather shifts at midnight. ${state.weather === "rain" ? "Rain begins to fall softly on the rooftops." : state.weather === "storm" ? "Thunder rumbles in the distance as a storm approaches." : state.weather === "fog" ? "A thick fog rolls in from the river." : state.weather === "clear" ? "The clouds part, revealing a brilliant starry sky." : "A warm front pushes through the valley."}`,
          severity: state.weather === "storm" ? "medium" : "low",
          day: state.day,
          phase: "night",
          timestamp: Date.now(),
          involvedAgents: [],
        })
      }
    }
  }

  // ── 1:00 AM - Night workers and dreams ──
  if (hour === 1) {
    // Healer night rounds
    const healers = state.agents.filter((a) => a.archetype === "Healer")
    if (healers.length > 0) {
      const healer = randomPick(healers)
      const rounds = [
        `${healer.name} makes night rounds, checking on settlers with fevers.`,
        `${healer.name} brews a remedy by candlelight. The herbs smell of lavender and eucalyptus.`,
        `${healer.name} sits by a sick child's bedside, applying cool compresses.`,
        `${healer.name} records health observations by lamplight: "${state.metrics.healthRisk > 30 ? "Cases rising. Need more supplies." : "Settlement health is stable. Continue preventive measures."}"`,
      ]
      events.push({
        id: `evt-${uid()}`,
        type: "night_work",
        description: randomPick(rounds),
        severity: "low",
        position: healer.position,
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: [healer.id],
      })
    }

    // Sleeper dreams
    const sleepers = state.agents.filter((a) => a.status === "sleeping")
    if (sleepers.length > 0) {
      const dreamer = randomPick(sleepers)
      const dreams = [
        `${dreamer.name} murmurs in their sleep, dreaming of ${dreamer.archetype === "Farmer" ? "endless golden fields" : dreamer.archetype === "Warrior" ? "battles yet to come" : dreamer.archetype === "Scout" ? "uncharted territories" : "their life before the settlement"}.`,
        `${dreamer.name} tosses restlessly. ${dreamer.stress > 50 ? "The weight of recent events haunts their dreams." : "Tomorrow's plans fill their sleeping mind."}`,
        `${dreamer.name} sleeps peacefully, a rare smile crossing their face.`,
      ]
      events.push({
        id: `evt-${uid()}`,
        type: "dream",
        description: randomPick(dreams),
        severity: "low",
        position: dreamer.position,
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: [dreamer.id],
      })
    }
  }

  // ── 2:00 AM - Deep night encounters ──
  if (hour === 2) {
    const encounterRoll = Math.random()
    if (encounterRoll < 0.35) {
      const encounters = [
        { type: "night_raid", desc: `Wild animals raid the food stores! A fox slips through the fence near the granary.`, severity: "high" as const, foodLoss: 6, unrest: 8 },
        { type: "strange_lights", desc: "Strange lights appear over the eastern mountains. The sentries watch in silence.", severity: "medium" as const, foodLoss: 0, unrest: 3 },
        { type: "night_visitor", desc: "A lone figure approaches the settlement gate. The watchers call for identification.", severity: "medium" as const, foodLoss: 0, unrest: 2 },
        { type: "wildlife_encounter", desc: "A family of deer wanders through the settlement, grazing on garden plants.", severity: "low" as const, foodLoss: 2, unrest: 0 },
        { type: "night_construction", desc: "A builder who couldn't sleep makes repairs to the south wall by moonlight.", severity: "low" as const, foodLoss: 0, unrest: 0 },
        { type: "meteor_shower", desc: "A brilliant meteor streaks across the sky. Watchers pause to make wishes.", severity: "low" as const, foodLoss: 0, unrest: 0 },
      ]
      const e = randomPick(encounters)
      const involved = state.agents.filter((a) => a.status === "on_watch")
      events.push({
        id: `evt-${uid()}`,
        type: e.type,
        description: e.desc,
        severity: e.severity,
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: involved.map((a) => a.id),
      })

      if (e.foodLoss > 0) state.metrics.foodDays = clamp(state.metrics.foodDays - e.foodLoss, 0, 200)
      if (e.unrest > 0) state.metrics.unrest = clamp(state.metrics.unrest + e.unrest, 0, 100)

      if (e.severity === "high") {
        news.push({
          id: `news-${uid()}`,
          headline: e.desc.slice(0, 80),
          body: `Night sentries responded to the incident at ${formatHour(hour)}. The settlement is on alert.`,
          category: "breaking",
          severity: "high",
          day: state.day,
          timestamp: Date.now(),
        })
        // Wake some agents
        for (const agent of state.agents.filter((a) => a.status === "sleeping").slice(0, 3)) {
          agent.status = "idle"
          agent.energy = clamp(agent.energy - 10, 0, 100)
          agent.stress = clamp(agent.stress + 10, 0, 100)
        }
      }
    }
  }

  // ── 3:00 AM - The quiet hour ──
  if (hour === 3) {
    const watchers = state.agents.filter((a) => a.status === "on_watch")
    if (watchers.length > 0) {
      const sentry = randomPick(watchers)
      const thoughts = [
        `${sentry.name} stands alone on the watchtower, contemplating the settlement's future.`,
        `${sentry.name} marks another hour on the watch log. Dawn is still far away.`,
        `${sentry.name} shares a flask of warm broth with a fellow sentry. Small comforts matter.`,
        `${sentry.name} notices the ${state.weather === "clear" ? "first hints of dawn on the eastern horizon" : state.weather === "rain" ? "rain intensifying as the night deepens" : "fog thickening around the watchtowers"}.`,
      ]
      events.push({
        id: `evt-${uid()}`,
        type: "night_watch_log",
        description: randomPick(thoughts),
        severity: "low",
        position: sentry.position,
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: [sentry.id],
      })
    }

    // Relationship building during shared watch
    if (watchers.length >= 2) {
      const pair = watchers.sort(() => Math.random() - 0.5).slice(0, 2)
      const convos = [
        `${pair[0].name} and ${pair[1].name} share quiet conversation on the night watch, strengthening their bond.`,
        `${pair[0].name} teaches ${pair[1].name} to read the stars for navigation.`,
        `${pair[0].name} and ${pair[1].name} debate whether the settlement should expand east or north.`,
      ]
      events.push({
        id: `evt-${uid()}`,
        type: "night_bonding",
        description: randomPick(convos),
        severity: "low",
        position: pair[0].position,
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: pair.map((a) => a.id),
      })
      // Improve relationship
      if (!pair[0].allies.includes(pair[1].id)) {
        if (Math.random() < 0.3) {
          pair[0].allies = [...pair[0].allies, pair[1].id].slice(0, 5)
          pair[1].allies = [...pair[1].allies, pair[0].id].slice(0, 5)
        }
      }
    }
  }

  // ── 4:00 AM - Pre-dawn, end of day ──
  if (hour === 4) {
    // Pre-dawn awakening
    const earlyRisers = state.agents.filter((a) => a.archetype === "Farmer" || a.archetype === "Hunter")
    for (const agent of earlyRisers) {
      agent.status = "idle"
    }
    if (earlyRisers.length > 0) {
      events.push({
        id: `evt-${uid()}`,
        type: "pre_dawn",
        description: `${earlyRisers.map((a) => a.name).join(" and ")} rise before dawn to prepare for the day ahead.`,
        severity: "low",
        day: state.day,
        phase: "night",
        timestamp: Date.now(),
        involvedAgents: earlyRisers.map((a) => a.id),
      })
    }

    news.push({
      id: `news-${uid()}`,
      headline: `Night ${state.day} report`,
      body: `The long night ends. Watchers report ${state.recentEvents.filter((e) => e.phase === "night" && e.day === state.day).length} events overnight. Settlement status: morale ${state.metrics.morale}%, food ${state.metrics.foodDays.toFixed(0)} days, unrest ${state.metrics.unrest}%.`,
      category: "night_recap",
      severity: "low",
      day: state.day,
      timestamp: Date.now(),
    })

    // Weather change chance at pre-dawn
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

  // ── Passive effects every night hour ──
  for (const agent of state.agents) {
    if (agent.status === "sleeping") {
      agent.energy = clamp(agent.energy + 4, 0, 100)
      agent.stress = clamp(agent.stress - 2, 0, 100)
      agent.hunger = clamp(agent.hunger - 1, 0, 100)
    } else if (agent.status === "on_watch") {
      agent.energy = clamp(agent.energy - 2, 0, 100)
      agent.stress = clamp(agent.stress + 1, 0, 100)
    } else if (agent.status === "working") {
      agent.energy = clamp(agent.energy - 1, 0, 100)
    }
    // Slight night movement for non-sleepers
    if (agent.status !== "sleeping" && Math.random() < 0.3) {
      agent.position = {
        x: clamp(agent.position.x + Math.floor(Math.random() * 3 - 1), 1, 58),
        y: clamp(agent.position.y + Math.floor(Math.random() * 3 - 1), 1, 58),
      }
    }
  }

  // ── Ambient event every tick (regardless of hour) - weather-dependent ──
  if (Math.random() < 0.4) {
    const weatherAmbient: Record<string, string[]> = {
      clear: [
        "The stars wheel slowly overhead. The Milky Way stretches from horizon to horizon.",
        "Crickets chirp steadily. An owl calls from the ancient oak near the council hall.",
        "The moonlight casts long shadows across the settlement paths.",
        "Fireflies dance near the river, their tiny lights mirroring the stars above.",
      ],
      rain: [
        "Rain drums steadily on the rooftops. Puddles form along the main path.",
        "The sound of rain creates a soothing rhythm. Water barrels slowly fill.",
        "Lightning flickers in the distance, briefly illuminating the landscape.",
        "The river swells with rainwater. Its rushing sound fills the night air.",
      ],
      storm: [
        "Thunder cracks overhead. The watchtowers groan in the wind.",
        "A fierce gust tears a tarp from the storehouse. Supplies scatter.",
        "Lightning strikes a tree near the perimeter. The sentries shout warnings.",
        "The storm howls around the settlement walls. Everyone huddles close.",
      ],
      fog: [
        "Thick fog blankets everything. Watchers can barely see past the gate.",
        "The fog muffles all sound. The settlement feels suspended in silence.",
        "Shapes move in the fog - trees? Animals? The sentries grip their weapons tighter.",
        "Lanterns glow like ghostly orbs in the dense mist.",
      ],
      heat: [
        "The night air remains warm and heavy. Few can sleep comfortably.",
        "Heat lightning flickers silently on the horizon.",
        "The warm breeze carries the scent of dry grass and distant wildflowers.",
        "Even at night, the heat persists. Water consumption rises.",
      ],
    }
    const ambients = weatherAmbient[state.weather] ?? weatherAmbient.clear
    events.push({
      id: `evt-${uid()}`,
      type: "ambient",
      description: randomPick(ambients),
      severity: "low",
      day: state.day,
      phase: "night",
      timestamp: Date.now(),
      involvedAgents: [],
    })
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
