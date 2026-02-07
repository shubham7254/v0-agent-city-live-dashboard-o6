import type { Agent, StoryEvent, StoryCategory, WorldState } from "../types"

function uid(): string {
  return `story-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// ── Relationship dynamics ──────────────────────────────
function updateRelationship(agent: Agent, targetId: string, delta: number, reason: string) {
  if (!agent.relationships) agent.relationships = []
  let edge = agent.relationships.find((r) => r.targetId === targetId)
  if (!edge) {
    edge = { targetId, score: 0, history: [] }
    agent.relationships.push(edge)
  }
  edge.score = clamp(edge.score + delta, -100, 100)
  edge.history.push(reason)
  if (edge.history.length > 10) edge.history = edge.history.slice(-10)

  // Update allies/rivals lists based on score thresholds
  if (edge.score >= 40 && !agent.allies.includes(targetId)) {
    agent.allies.push(targetId)
    agent.rivals = agent.rivals.filter((r) => r !== targetId)
  } else if (edge.score <= -40 && !agent.rivals.includes(targetId)) {
    agent.rivals.push(targetId)
    agent.allies = agent.allies.filter((a) => a !== targetId)
  } else if (edge.score > -40 && edge.score < 40) {
    agent.allies = agent.allies.filter((a) => a !== targetId)
    agent.rivals = agent.rivals.filter((r) => r !== targetId)
  }
}

function getRelScore(agent: Agent, targetId: string): number {
  if (!agent.relationships) return 0
  return agent.relationships.find((r) => r.targetId === targetId)?.score ?? 0
}

// ── Story generators ──────────────────────────────────
function makeStory(
  day: number, hour: number, category: StoryCategory,
  title: string, description: string,
  involved: string[], consequence?: string
): StoryEvent {
  return { id: uid(), day, hour, category, title, description, involvedAgents: involved, consequence, timestamp: Date.now() }
}

// ── Friendship / bonding events ──
function tryFriendshipEvent(state: WorldState): StoryEvent | null {
  const awake = state.agents.filter((a) => a.status !== "sleeping")
  if (awake.length < 2) return null
  if (Math.random() > 0.12) return null

  const a = randomPick(awake)
  const candidates = awake.filter((b) =>
    b.id !== a.id &&
    Math.abs(a.position.x - b.position.x) <= 3 &&
    Math.abs(a.position.y - b.position.y) <= 3
  )
  if (candidates.length === 0) return null
  const b = randomPick(candidates)

  const score = getRelScore(a, b.id)
  if (score > 60) return null // already very close

  const templates = [
    {
      title: `${a.name} and ${b.name} bond over shared work`,
      desc: `While working nearby, ${a.name} (${a.archetype}) and ${b.name} (${b.archetype}) discovered they share a love of ${randomPick(["storytelling", "gardening", "cooking", "stargazing", "woodcarving"])}. A new friendship begins to form.`,
      consequence: `${a.name} and ${b.name}'s relationship improved.`,
    },
    {
      title: `${a.name} helps ${b.name} with a difficult task`,
      desc: `${a.name} noticed ${b.name} struggling with ${randomPick(["heavy supplies", "a broken tool", "a tricky repair", "a lost item"])} and offered to help. ${b.name} was grateful.`,
      consequence: `${b.name} now views ${a.name} more favorably.`,
    },
    {
      title: `Lunch together: ${a.name} and ${b.name}`,
      desc: `${a.name} and ${b.name} shared a meal near the ${randomPick(["market square", "well", "inn", "council hall"])}. They talked about ${randomPick(["the future of the settlement", "their families", "the council's recent decisions", "the changing weather"])}.`,
      consequence: `Their friendship deepens slightly.`,
    },
  ]

  const t = randomPick(templates)
  const delta = 8 + Math.floor(Math.random() * 12)
  updateRelationship(a, b.id, delta, t.title)
  updateRelationship(b, a.id, delta, t.title)

  return makeStory(state.day, state.hour, "friendship", t.title, t.desc, [a.id, b.id], t.consequence)
}

// ── Rivalry / conflict events ──
function tryRivalryEvent(state: WorldState): StoryEvent | null {
  const awake = state.agents.filter((a) => a.status !== "sleeping" && a.ageGroup !== "child")
  if (awake.length < 2) return null
  if (Math.random() > 0.08) return null

  const a = randomPick(awake)
  // Prefer agents who are already slightly negative
  let b: Agent | null = null
  const existingRivals = a.relationships.filter((r) => r.score < -10)
  if (existingRivals.length > 0 && Math.random() < 0.6) {
    b = state.agents.find((ag) => ag.id === randomPick(existingRivals).targetId) ?? null
  }
  if (!b) {
    const others = awake.filter((ag) => ag.id !== a.id)
    if (others.length === 0) return null
    b = randomPick(others)
  }

  const triggers = [
    {
      title: `${a.name} accuses ${b.name} of unfair dealings`,
      desc: `A heated argument broke out when ${a.name} publicly accused ${b.name} of ${randomPick(["hoarding supplies", "spreading rumors", "slacking on duty", "taking credit for others' work"])}. Bystanders watched nervously.`,
      consequence: `Tension between them has risen. The settlement feels it.`,
    },
    {
      title: `${a.name} and ${b.name} clash over resources`,
      desc: `${a.name} and ${b.name} both laid claim to ${randomPick(["the last sack of grain", "prime workshop space", "the best market stall", "water rations"])}. Neither backed down. ${randomPick(["An elder had to intervene.", "They stormed off in opposite directions.", "The guard was called."])}`,
      consequence: `Their rivalry deepens. Others are taking sides.`,
    },
    {
      title: `Harsh words: ${a.name} vs ${b.name}`,
      desc: `During a conversation about ${randomPick(["council policies", "work duties", "the town's direction", "personal matters"])}, ${a.name} said something that deeply offended ${b.name}. The atmosphere turned cold.`,
      consequence: `${b.name} won't forget this easily.`,
    },
  ]

  const t = randomPick(triggers)
  const delta = -(10 + Math.floor(Math.random() * 15))
  updateRelationship(a, b.id, delta, t.title)
  updateRelationship(b, a.id, delta, t.title)
  a.stress = clamp(a.stress + 8, 0, 100)
  b.stress = clamp(b.stress + 10, 0, 100)
  state.metrics.unrest = clamp(state.metrics.unrest + 2, 0, 100)

  return makeStory(state.day, state.hour, "rivalry", t.title, t.desc, [a.id, b.id], t.consequence)
}

// ── Romance events ──
function tryRomanceEvent(state: WorldState): StoryEvent | null {
  const eligible = state.agents.filter((a) => a.ageGroup === "adult" && a.status !== "sleeping")
  if (eligible.length < 2) return null
  if (Math.random() > 0.05) return null

  // Find pairs with high relationship scores
  let a: Agent | null = null
  let b: Agent | null = null

  for (const agent of eligible) {
    const closeRels = agent.relationships.filter((r) => r.score >= 30)
    if (closeRels.length > 0) {
      const rel = randomPick(closeRels)
      const partner = eligible.find((e) => e.id === rel.targetId)
      if (partner) {
        a = agent
        b = partner
        break
      }
    }
  }

  if (!a || !b) {
    // No high-score pairs, try a random spark
    if (Math.random() > 0.3) return null
    a = randomPick(eligible)
    b = randomPick(eligible.filter((e) => e.id !== a!.id))
  }

  const score = getRelScore(a, b.id)
  const templates = score >= 50
    ? [
        {
          title: `${a.name} and ${b.name}: a quiet evening together`,
          desc: `${a.name} and ${b.name} were seen walking together along the settlement paths as the sun set. Neighbors smiled knowingly.`,
          consequence: `The settlement's favorite couple grows closer.`,
        },
        {
          title: `Love in Agent City: ${a.name} and ${b.name}`,
          desc: `${a.name} brought ${b.name} a handpicked bouquet of wildflowers. ${b.name}'s smile could be seen from the watchtower.`,
          consequence: `Their bond strengthens. Morale rises among those who notice.`,
        },
      ]
    : [
        {
          title: `${a.name} catches ${b.name}'s eye`,
          desc: `At the ${randomPick(["market", "inn", "well", "council hall"])}, ${a.name} and ${b.name} locked eyes for a moment longer than usual. Something stirred.`,
          consequence: `A new romantic interest may be forming.`,
        },
        {
          title: `${a.name} finds an excuse to talk to ${b.name}`,
          desc: `${a.name} went out of their way to ${randomPick(["borrow a tool from", "ask directions from", "share news with", "bring food to"])} ${b.name}. The excuse was thin. The interest was obvious.`,
          consequence: `Others have started to notice the tension.`,
        },
      ]

  const t = randomPick(templates)
  const delta = 10 + Math.floor(Math.random() * 10)
  updateRelationship(a, b.id, delta, t.title)
  updateRelationship(b, a.id, delta, t.title)
  if (score >= 50) state.metrics.morale = clamp(state.metrics.morale + 1, 0, 100)

  return makeStory(state.day, state.hour, "romance", t.title, t.desc, [a.id, b.id], t.consequence)
}

// ── Business / economic events ──
function tryBusinessEvent(state: WorldState): StoryEvent | null {
  const merchants = state.agents.filter((a) =>
    ["Shopkeeper", "Baker", "Merchant", "Tailor", "Blacksmith"].includes(a.archetype) &&
    a.status !== "sleeping"
  )
  if (merchants.length === 0) return null
  if (Math.random() > 0.06) return null

  const agent = randomPick(merchants)
  const outcomes = [
    {
      title: `${agent.name}'s ${agent.archetype === "Baker" ? "bakery" : "shop"} has a record day`,
      desc: `Customers lined up at ${agent.name}'s establishment today. ${agent.archetype === "Baker" ? "Every loaf sold out by noon." : "Shelves were nearly empty by evening."} Word spread about their quality ${randomPick(["bread", "tools", "goods", "crafts", "fabrics"])}.`,
      consequence: `${agent.name}'s reputation grows.`,
      repDelta: 8,
      moraleDelta: 1,
    },
    {
      title: `Trouble at ${agent.name}'s workshop`,
      desc: `${agent.name} discovered ${randomPick(["spoiled inventory", "a broken oven", "damaged tools", "missing stock"])} this morning. The loss will take days to recover from.`,
      consequence: `${agent.name}'s business suffers a setback.`,
      repDelta: -5,
      moraleDelta: -1,
    },
    {
      title: `${agent.name} launches a new product`,
      desc: `${agent.name} unveiled ${randomPick(["a new type of pastry", "hand-forged decorative ironwork", "imported spices from beyond the mountains", "custom-tailored winter cloaks"])} at the market. The reception was ${Math.random() > 0.4 ? "enthusiastic" : "mixed, but curious"}.`,
      consequence: `The market district buzzes with excitement.`,
      repDelta: 5,
      moraleDelta: 1,
    },
  ]

  const o = randomPick(outcomes)
  agent.reputation = clamp(agent.reputation + o.repDelta, 0, 100)
  state.metrics.morale = clamp(state.metrics.morale + o.moraleDelta, 0, 100)

  return makeStory(state.day, state.hour, "business", o.title, o.desc, [agent.id], o.consequence)
}

// ── Achievement events ──
function tryAchievementEvent(state: WorldState): StoryEvent | null {
  const awake = state.agents.filter((a) => a.status !== "sleeping")
  if (awake.length === 0) return null
  if (Math.random() > 0.04) return null

  const agent = randomPick(awake)
  const achievements = [
    {
      title: `${agent.name} masters a new skill`,
      desc: `After weeks of practice, ${agent.name} has ${randomPick(["learned to read ancient texts", "mastered a new crafting technique", "become proficient in herbal medicine", "completed their first solo hunt", "learned to swim across the river"])}.`,
      consequence: `${agent.name}'s confidence and reputation grow.`,
    },
    {
      title: `${agent.name} saves a neighbor's life`,
      desc: `When ${randomPick(["a fire broke out", "someone fell into the river", "a child wandered too close to the wall", "a worker collapsed from heat"])} , ${agent.name} acted without hesitation. Their quick thinking ${randomPick(["prevented a tragedy", "saved a life", "protected the community"])}.`,
      consequence: `${agent.name} is hailed as a hero.`,
    },
    {
      title: `${agent.name} completes a major project`,
      desc: `${agent.name} finished ${randomPick(["building a new storage shed", "writing the settlement's first history book", "designing an improved water system", "crafting a beautiful memorial for the town square"])}. The settlement celebrates.`,
      consequence: `The town benefits from ${agent.name}'s dedication.`,
    },
  ]

  const t = randomPick(achievements)
  agent.reputation = clamp(agent.reputation + 10, 0, 100)
  agent.influence = clamp(agent.influence + 5, 0, 100)

  return makeStory(state.day, state.hour, "achievement", t.title, t.desc, [agent.id], t.consequence)
}

// ── Misfortune events ──
function tryMisfortuneEvent(state: WorldState): StoryEvent | null {
  const agents = state.agents.filter((a) => a.status !== "sleeping")
  if (agents.length === 0) return null
  if (Math.random() > 0.04) return null

  const agent = randomPick(agents)
  const misfortunes = [
    {
      title: `${agent.name} falls ill`,
      desc: `${agent.name} woke feeling weak and feverish. ${agent.archetype === "Doctor" || agent.archetype === "Nurse" ? "Ironically, the healer needs healing." : `Dr. ${state.agents.find((a) => a.archetype === "Doctor")?.name ?? "the town healer"} was called to help.`}`,
      consequence: `${agent.name} will need rest and may miss work.`,
      stressDelta: 15,
    },
    {
      title: `${agent.name} loses a prized possession`,
      desc: `${agent.name} discovered that their ${randomPick(["grandfather's pocket watch", "favorite tools", "family heirloom ring", "journal of recipes", "hand-carved flute"])} has gone missing. They're devastated.`,
      consequence: `${agent.name} is upset and distracted.`,
      stressDelta: 20,
    },
    {
      title: `${agent.name}'s home needs urgent repair`,
      desc: `${randomPick(["A leak in the roof", "A cracked wall", "A collapsed shelf", "A broken door"])} has made ${agent.name}'s home uncomfortable. They'll need help from the builders.`,
      consequence: `${agent.name} is stressed about their living situation.`,
      stressDelta: 12,
    },
  ]

  const t = randomPick(misfortunes)
  agent.stress = clamp(agent.stress + t.stressDelta, 0, 100)
  agent.energy = clamp(agent.energy - 10, 0, 100)

  return makeStory(state.day, state.hour, "misfortune", t.title, t.desc, [agent.id], t.consequence)
}

// ── Discovery events ──
function tryDiscoveryEvent(state: WorldState): StoryEvent | null {
  const explorers = state.agents.filter((a) =>
    (a.archetype === "Scout" || a.archetype === "Hunter" || a.personality.curiosity > 60) &&
    a.status !== "sleeping"
  )
  if (explorers.length === 0) return null
  if (Math.random() > 0.03) return null

  const agent = randomPick(explorers)
  const discoveries = [
    {
      title: `${agent.name} discovers ancient ruins`,
      desc: `While exploring the ${randomPick(["eastern ridge", "forest edge", "riverbank", "mountain pass"])}, ${agent.name} stumbled upon ${randomPick(["crumbling stone walls covered in vines", "an old cave with wall paintings", "a buried metal chest", "carved stone markers from a forgotten civilization"])}. The scholar is already excited.`,
      consequence: `This could change the settlement's understanding of the land.`,
    },
    {
      title: `${agent.name} finds a new resource deposit`,
      desc: `${agent.name} discovered ${randomPick(["an underground spring", "a clay deposit perfect for pottery", "wild berry bushes in abundance", "a grove of medicinal herbs", "iron ore near the surface"])} beyond the settlement walls.`,
      consequence: `New resources could boost the economy.`,
    },
    {
      title: `${agent.name} spots something unusual`,
      desc: `${agent.name} reported seeing ${randomPick(["campfire smoke beyond the mountains", "a caravan on the distant road", "strange tracks in the mud", "lights in the forest at night"])}. The council should be informed.`,
      consequence: `The settlement buzzes with speculation.`,
    },
  ]

  const t = randomPick(discoveries)
  agent.reputation = clamp(agent.reputation + 5, 0, 100)
  state.metrics.morale = clamp(state.metrics.morale + 2, 0, 100)

  return makeStory(state.day, state.hour, "discovery", t.title, t.desc, [agent.id], t.consequence)
}

// ── Ensure agent has new fields (for agents loaded from old Redis state) ──
function ensureAgentFields(agent: Agent) {
  if (!agent.relationships) agent.relationships = []
  if (!agent.storyLog) agent.storyLog = []
  if (!agent.moodHistory) agent.moodHistory = [100 - (agent.stress ?? 30)]
}

// ── Main story tick ──────────────────────────────────
export function runStoryEngine(state: WorldState): StoryEvent[] {
  // Initialize missing fields on ALL agents first
  for (const agent of state.agents) {
    ensureAgentFields(agent)
  }
  if (!state.storyLog) state.storyLog = []

  const stories: StoryEvent[] = []

  const generators = [
    tryFriendshipEvent,
    tryRivalryEvent,
    tryRomanceEvent,
    tryBusinessEvent,
    tryAchievementEvent,
    tryMisfortuneEvent,
    tryDiscoveryEvent,
  ]

  for (const gen of generators) {
    try {
      const story = gen(state)
      if (story) {
        stories.push(story)
        // Add to involved agents' story logs
        for (const agentId of story.involvedAgents) {
          const agent = state.agents.find((a) => a.id === agentId)
          if (agent) {
            agent.storyLog.push(story)
            if (agent.storyLog.length > 30) agent.storyLog = agent.storyLog.slice(-30)
            const quotes = generateStoryQuote(agent, story)
            if (quotes) {
              agent.recentQuotes.unshift(quotes)
              if (agent.recentQuotes.length > 5) agent.recentQuotes = agent.recentQuotes.slice(0, 5)
            }
          }
        }
      }
    } catch {
      // Skip individual story generator failures silently
    }
  }

  // Record mood history for all agents
  for (const agent of state.agents) {
    agent.moodHistory.push(100 - (agent.stress ?? 30))
    if (agent.moodHistory.length > 48) agent.moodHistory = agent.moodHistory.slice(-48)
  }

  return stories
}

function generateStoryQuote(agent: Agent, story: StoryEvent): string | null {
  if (Math.random() > 0.7) return null

  const quotesByCategory: Record<StoryCategory, string[]> = {
    friendship: [
      "It's good to have someone you can count on.",
      "This settlement is home because of the people in it.",
      "A friend made today is a memory for tomorrow.",
    ],
    rivalry: [
      "Some people just don't understand reason.",
      "I won't be pushed around. Not by anyone.",
      "There are two sides to every story, and mine is right.",
    ],
    romance: [
      "There's something about this place... the sunsets, the company...",
      "I didn't expect to feel this way.",
      "Some things are worth more than gold or grain.",
    ],
    business: [
      "Hard work pays off. Eventually.",
      "The market waits for no one.",
      "Every setback is a setup for a comeback.",
    ],
    achievement: [
      "I proved something today. To myself, mostly.",
      "If I can do this, what else is possible?",
      "The settlement deserves our best effort.",
    ],
    misfortune: [
      "Bad days don't last. At least, that's what I tell myself.",
      "I've survived worse. Probably.",
      "Tomorrow will be better. It has to be.",
    ],
    conflict: [
      "Sometimes you have to stand your ground.",
      "Peace is worth fighting for. Ironic, isn't it?",
      "I hope cooler heads prevail.",
    ],
    discovery: [
      "There's so much we don't know about this land.",
      "Every discovery opens ten new questions.",
      "The world beyond our walls is full of surprises.",
    ],
    celebration: [
      "Days like this remind me why we built this place.",
      "Together, we're capable of wonderful things.",
      "Let the children remember this joy.",
    ],
  }

  const quotes = quotesByCategory[story.category]
  return quotes ? randomPick(quotes) : null
}
