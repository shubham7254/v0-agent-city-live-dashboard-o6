import type {
  Agent,
  AgeGroup,
  Biome,
  BuildingType,
  CouncilSession,
  DailySchedule,
  MapTile,
  WorldMetrics,
  WorldState,
} from "../types"

// ── Name pools ──
const FIRST_NAMES_M = ["Kael","Dax","Tor","Vex","Fenris","Ashka","Rowan","Jace","Theron","Malik","Orin","Silas","Bram","Niko","Hugo","Cass","Remy","Ezra","Flynn","Aldric","Talon","Zeke"]
const FIRST_NAMES_F = ["Mira","Suri","Liora","Zara","Elara","Freya","Ivy","Nyla","Petra","Sage","Cora","Luna","Ada","Ren","Thea","Wren","Iris","Nell","Greta","Faye","Maeve","Lyra"]
const CHILD_NAMES = ["Pip","Kit","Boo","Twig","Fern","Moss","Pebble","Dew","Spark","Bean","Nix","Rune","Leaf","Ember","Clover","Wisp"]

// ── Archetypes for diverse roles ──
const ADULT_ROLES = [
  "Doctor","Nurse","Teacher","Professor","Farmer","Builder","Shopkeeper","Baker",
  "Blacksmith","Guard","Scout","Healer","Merchant","Carpenter","Librarian","Cook",
  "Tailor","Herbalist","Fisher","Mason",
]
const TEEN_ROLES = ["Student","Apprentice"]
const CHILD_ROLES = ["Schoolchild"]
const ELDER_ROLES = ["Elder","Retired Doctor","Village Historian","Master Craftsman","Councilmember"]

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

// Schedules by age group
function getSchedule(ageGroup: AgeGroup, archetype: string): DailySchedule {
  switch (ageGroup) {
    case "child":
      return { wakeHour: 7, sleepHour: 20, workStartHour: 8, workEndHour: 14, lunchHour: 12 }
    case "teen":
      return { wakeHour: 7, sleepHour: 22, workStartHour: 8, workEndHour: 15, lunchHour: 12 }
    case "elder":
      return { wakeHour: 5, sleepHour: 21, workStartHour: 9, workEndHour: 14, lunchHour: 12 }
    default:
      if (archetype === "Guard" || archetype === "Scout")
        return { wakeHour: 5, sleepHour: 22, workStartHour: 6, workEndHour: 18, lunchHour: 12 }
      if (archetype === "Farmer" || archetype === "Fisher")
        return { wakeHour: 5, sleepHour: 21, workStartHour: 6, workEndHour: 17, lunchHour: 12 }
      if (archetype === "Baker")
        return { wakeHour: 4, sleepHour: 20, workStartHour: 4, workEndHour: 14, lunchHour: 11 }
      if (archetype === "Doctor" || archetype === "Nurse")
        return { wakeHour: 6, sleepHour: 23, workStartHour: 7, workEndHour: 19, lunchHour: 13 }
      return { wakeHour: 6, sleepHour: 22, workStartHour: 8, workEndHour: 17, lunchHour: 12 }
  }
}

function createAgent(id: number, ageGroup: AgeGroup): Agent {
  const isMale = Math.random() > 0.5
  let name: string
  let archetype: string
  let age: number

  switch (ageGroup) {
    case "child":
      name = randomPick(CHILD_NAMES)
      archetype = randomPick(CHILD_ROLES)
      age = 5 + Math.floor(Math.random() * 7)
      break
    case "teen":
      name = randomPick(isMale ? FIRST_NAMES_M : FIRST_NAMES_F)
      archetype = randomPick(TEEN_ROLES)
      age = 13 + Math.floor(Math.random() * 6)
      break
    case "elder":
      name = randomPick(isMale ? FIRST_NAMES_M : FIRST_NAMES_F)
      archetype = randomPick(ELDER_ROLES)
      age = 60 + Math.floor(Math.random() * 25)
      break
    default:
      name = randomPick(isMale ? FIRST_NAMES_M : FIRST_NAMES_F)
      archetype = randomPick(ADULT_ROLES)
      age = 22 + Math.floor(Math.random() * 35)
      break
  }

  const schedule = getSchedule(ageGroup, archetype)
  const personality = {
    aggression: 10 + Math.floor(Math.random() * 60),
    cooperation: 30 + Math.floor(Math.random() * 60),
    curiosity: ageGroup === "child" ? 70 + Math.floor(Math.random() * 30) : 20 + Math.floor(Math.random() * 60),
    caution: ageGroup === "elder" ? 60 + Math.floor(Math.random() * 30) : 15 + Math.floor(Math.random() * 55),
    leadership: ageGroup === "elder" ? 50 + Math.floor(Math.random() * 40) : ageGroup === "child" ? 5 + Math.floor(Math.random() * 20) : 15 + Math.floor(Math.random() * 60),
  }

  // Home near residential area, work near relevant building
  const homePos = { x: 26 + Math.floor(Math.random() * 10), y: 25 + Math.floor(Math.random() * 6) }
  let workPos: { x: number; y: number }

  if (archetype === "Schoolchild") workPos = { x: 35, y: 27 }
  else if (archetype === "Student" || archetype === "Apprentice") workPos = { x: 37, y: 27 }
  else if (archetype === "Doctor" || archetype === "Nurse") workPos = { x: 25, y: 32 }
  else if (archetype === "Teacher" || archetype === "Librarian" || archetype === "Professor") workPos = { x: 35, y: 27 }
  else if (archetype === "Farmer" || archetype === "Fisher") workPos = { x: 27 + Math.floor(Math.random() * 6), y: 34 + Math.floor(Math.random() * 3) }
  else if (archetype === "Shopkeeper" || archetype === "Baker" || archetype === "Merchant" || archetype === "Tailor") workPos = { x: 32 + Math.floor(Math.random() * 3), y: 29 + Math.floor(Math.random() * 2) }
  else if (archetype === "Guard" || archetype === "Scout") workPos = { x: 25 + Math.floor(Math.random() * 12), y: 25 + Math.floor(Math.random() * 12) }
  else workPos = { x: 28 + Math.floor(Math.random() * 6), y: 28 + Math.floor(Math.random() * 6) }

  return {
    id: `agent-${id}`,
    name,
    archetype,
    ageGroup,
    age,
    position: { ...homePos },
    status: "sleeping",
    energy: 80 + Math.floor(Math.random() * 20),
    hunger: 10 + Math.floor(Math.random() * 30),
    stress: 5 + Math.floor(Math.random() * 25),
    influence: ageGroup === "elder" ? 50 + Math.floor(Math.random() * 40) : ageGroup === "child" ? 5 : 20 + Math.floor(Math.random() * 40),
    reputation: 30 + Math.floor(Math.random() * 50),
    personality,
    schedule,
    homePosition: homePos,
    workPosition: workPos,
    recentQuotes: [],
    recentActions: [],
    voteHistory: [],
    allies: [],
    rivals: [],
    relationships: [],
    storyLog: [],
    moodHistory: [70 + Math.floor(Math.random() * 20)],
  }
}

function generateMap(): MapTile[][] {
  const size = 60
  const map: MapTile[][] = []
  for (let y = 0; y < size; y++) {
    const row: MapTile[] = []
    for (let x = 0; x < size; x++) {
      let biome: Biome = "plains"
      const distFromCenter = Math.sqrt((x - 30) ** 2 + (y - 30) ** 2)

      // River
      if (
        (Math.abs(x - 20) < 2 && y > 10 && y < 50) ||
        (Math.abs(y - 40) < 2 && x > 15 && x < 45)
      ) {
        biome = "water"
      }
      // Forest ring
      else if (distFromCenter > 20 && distFromCenter < 26) {
        biome = "forest"
      }
      // Mountains/desert at edges
      else if (distFromCenter > 28) {
        biome = Math.random() > 0.6 ? "mountain" : "desert"
      }

      row.push({
        biome,
        floodRisk: biome === "water" ? 0.6 : biome === "plains" ? 0.15 : 0.05,
        fireRisk: biome === "forest" ? 0.3 : biome === "desert" ? 0.4 : 0.1,
        hasPath: false,
      })
    }
    map.push(row)
  }

  // ── Road network ──
  // Main roads (cross through town)
  for (let i = 22; i < 39; i++) {
    if (map[30]?.[i]) map[30][i].hasPath = true
    if (map[i]?.[30]) map[i][30].hasPath = true
  }
  // Ring road
  for (let i = 25; i < 36; i++) {
    if (map[25]?.[i]) map[25][i].hasPath = true // North
    if (map[36]?.[i]) map[36][i].hasPath = true // South
    if (map[i]?.[25]) map[i][25].hasPath = true // West
    if (map[i]?.[36]) map[i][36].hasPath = true // East
  }
  // Residential paths
  for (let i = 26; i < 35; i++) {
    if (map[27]?.[i]) map[27][i].hasPath = true
    if (map[28]?.[i]) map[28][i].hasPath = true
  }
  // Market district path
  for (let i = 28; i < 35; i++) {
    if (map[i]?.[32]) map[i][32].hasPath = true
  }
  // Hospital road
  for (let i = 25; i < 33; i++) {
    if (map[32]?.[i]) map[32][i].hasPath = true
  }

  // ── Buildings ──
  const buildings: { x: number; y: number; type: BuildingType }[] = [
    // Town center
    { x: 30, y: 30, type: "council" },
    { x: 29, y: 30, type: "well" },
    { x: 31, y: 30, type: "well" },

    // Residential district (north)
    { x: 26, y: 26, type: "house" }, { x: 27, y: 26, type: "house" }, { x: 28, y: 26, type: "house" },
    { x: 29, y: 26, type: "house" }, { x: 30, y: 26, type: "house" }, { x: 31, y: 26, type: "house" },
    { x: 32, y: 26, type: "house" }, { x: 33, y: 26, type: "house" }, { x: 34, y: 26, type: "house" },
    { x: 26, y: 27, type: "house" }, { x: 27, y: 27, type: "house" }, { x: 28, y: 27, type: "house" },
    { x: 29, y: 27, type: "house" }, { x: 31, y: 27, type: "house" },
    { x: 33, y: 27, type: "house" }, { x: 34, y: 27, type: "house" },
    { x: 26, y: 28, type: "house" }, { x: 27, y: 28, type: "house" },
    { x: 33, y: 28, type: "house" }, { x: 34, y: 28, type: "house" },

    // School & College (east)
    { x: 35, y: 27, type: "school" },
    { x: 36, y: 27, type: "school" },
    { x: 37, y: 27, type: "college" },
    { x: 37, y: 28, type: "college" },

    // Market district (center-east)
    { x: 32, y: 29, type: "shop" }, { x: 33, y: 29, type: "shop" }, { x: 34, y: 29, type: "shop" },
    { x: 32, y: 30, type: "market" }, { x: 33, y: 30, type: "market" },
    { x: 34, y: 30, type: "inn" },

    // Workshop area
    { x: 28, y: 29, type: "workshop" }, { x: 27, y: 29, type: "workshop" },

    // Hospital (south-west)
    { x: 25, y: 32, type: "hospital" }, { x: 26, y: 32, type: "hospital" },
    { x: 25, y: 33, type: "hospital" },

    // Farming district (south)
    { x: 27, y: 34, type: "farm" }, { x: 28, y: 34, type: "farm" }, { x: 29, y: 34, type: "farm" },
    { x: 30, y: 34, type: "farm" }, { x: 31, y: 34, type: "farm" }, { x: 32, y: 34, type: "farm" },
    { x: 27, y: 35, type: "farm" }, { x: 28, y: 35, type: "farm" }, { x: 29, y: 35, type: "farm" },
    { x: 30, y: 35, type: "farm" }, { x: 31, y: 35, type: "farm" }, { x: 32, y: 35, type: "farm" },

    // Storage
    { x: 35, y: 31, type: "storehouse" }, { x: 36, y: 31, type: "storehouse" },

    // Watchtowers (corners)
    { x: 24, y: 24, type: "watchtower" }, { x: 37, y: 24, type: "watchtower" },
    { x: 24, y: 37, type: "watchtower" }, { x: 37, y: 37, type: "watchtower" },

    // Walls (partial perimeter)
    { x: 25, y: 24, type: "wall" }, { x: 26, y: 24, type: "wall" }, { x: 27, y: 24, type: "wall" },
    { x: 34, y: 24, type: "wall" }, { x: 35, y: 24, type: "wall" }, { x: 36, y: 24, type: "wall" },
    { x: 24, y: 25, type: "wall" }, { x: 24, y: 26, type: "wall" },
    { x: 37, y: 25, type: "wall" }, { x: 37, y: 26, type: "wall" },
    { x: 24, y: 35, type: "wall" }, { x: 24, y: 36, type: "wall" },
    { x: 37, y: 35, type: "wall" }, { x: 37, y: 36, type: "wall" },
  ]

  for (const b of buildings) {
    if (map[b.y]?.[b.x]) {
      map[b.y][b.x].building = b.type
      map[b.y][b.x].biome = "plains" // Clear biome under buildings
    }
  }

  return map
}

export function createInitialState(): WorldState {
  const now = Date.now()
  const realDate = new Date(now)
  // Use Michigan (America/Detroit) timezone
  const realHour = parseInt(realDate.toLocaleString("en-US", { timeZone: "America/Detroit", hour: "numeric", hour12: false }), 10) % 24

  // Generate 50 diverse agents
  const agents: Agent[] = []
  let id = 1

  // 8 children (ages 5-11)
  for (let i = 0; i < 8; i++) agents.push(createAgent(id++, "child"))
  // 6 teens (ages 13-18)
  for (let i = 0; i < 6; i++) agents.push(createAgent(id++, "teen"))
  // 28 adults (ages 22-56)
  for (let i = 0; i < 28; i++) agents.push(createAgent(id++, "adult"))
  // 8 elders (ages 60-85)
  for (let i = 0; i < 8; i++) agents.push(createAgent(id++, "elder"))

  // Set initial status based on current real time
  for (const agent of agents) {
    if (realHour >= agent.schedule.sleepHour || realHour < agent.schedule.wakeHour) {
      agent.status = "sleeping"
      agent.position = { ...agent.homePosition }
    } else if (realHour >= agent.schedule.workStartHour && realHour < agent.schedule.workEndHour) {
      agent.status = "working"
      agent.position = { ...agent.workPosition }
    } else {
      agent.status = "idle"
      agent.position = { ...agent.homePosition }
    }
  }

  const metrics: WorldMetrics = {
    population: 50,
    foodDays: 60,
    waterDays: 50,
    morale: 70,
    unrest: 10,
    healthRisk: 15,
    fireStability: 80,
  }

  const council: CouncilSession = {
    day: 1,
    proposals: [],
    currentSpeaker: null,
    dialogue: [],
    nextCouncilIn: realHour < 18 ? 18 - realHour : 24 - realHour + 18,
    isActive: false,
    startHour: 18,
    endHour: 21,
  }

  return {
    day: 1,
    hour: realHour,
    phase:
      realHour >= 5 && realHour <= 11
        ? "morning"
        : realHour >= 12 && realHour <= 17
          ? "day"
          : realHour >= 18 && realHour <= 21
            ? "evening"
            : "night",
    tick: 0,
    map: generateMap(),
    agents,
    metrics,
    council,
    news: [{
      id: "news-1",
      headline: "Welcome to Agent City - a thriving settlement of 50 souls",
      body: "The town has grown: 8 children attend school, 6 teens study at the college, 28 adults work diverse trades, and 8 elders guide with their wisdom. The market is bustling and the hospital is well-staffed.",
      category: "morning_brief",
      severity: "low",
      day: 1,
      timestamp: now,
    }],
    humanEvents: [
      { headline: "Global temperatures reach record highs", source: "World Climate Report", simEffect: { variable: "fireStability", modifier: -5, description: "Increased fire risk" } },
      { headline: "New water purification tech breakthrough", source: "Science Daily", simEffect: { variable: "waterDays", modifier: 3, description: "Improved water access" } },
      { headline: "Global food supply chain disruptions", source: "Reuters", simEffect: { variable: "foodDays", modifier: -4, description: "Resource scarcity" } },
    ],
    recentEvents: [],
    storyLog: [],
    weather: "clear",
    startedAt: now,
    lastTickAt: now,
    paused: false,
    tickRate: 15000,
    councilActive: false,
    councilAnnouncement: null,
    lastProcessedHour: realHour,
  }
}
