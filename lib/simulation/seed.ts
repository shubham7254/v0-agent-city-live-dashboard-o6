import type {
  Agent,
  Biome,
  CouncilSession,
  MapTile,
  WorldMetrics,
  WorldState,
} from "../types"

const AGENT_TEMPLATES: Omit<Agent, "position">[] = [
  {
    id: "agent-1", name: "Kael", archetype: "Strategist",
    status: "idle", energy: 80, hunger: 30, stress: 20, influence: 70, reputation: 65,
    personality: { aggression: 35, cooperation: 75, curiosity: 60, caution: 55, leadership: 80 },
    recentQuotes: ["We must think three moves ahead.", "Structure breeds survival."],
    recentActions: ["Planned the eastern wall route"], voteHistory: ["yes", "yes", "no"],
    allies: ["agent-2", "agent-5"], rivals: ["agent-7"],
  },
  {
    id: "agent-2", name: "Mira", archetype: "Healer",
    status: "idle", energy: 90, hunger: 20, stress: 15, influence: 55, reputation: 80,
    personality: { aggression: 15, cooperation: 90, curiosity: 70, caution: 65, leadership: 40 },
    recentQuotes: ["Every life matters.", "The herbs need tending before frost."],
    recentActions: ["Treated three villagers for fever"], voteHistory: ["yes", "yes", "yes"],
    allies: ["agent-1", "agent-4"], rivals: ["agent-8"],
  },
  {
    id: "agent-3", name: "Dax", archetype: "Scout",
    status: "idle", energy: 75, hunger: 40, stress: 35, influence: 45, reputation: 55,
    personality: { aggression: 50, cooperation: 50, curiosity: 95, caution: 30, leadership: 35 },
    recentQuotes: ["I saw something beyond the ridge.", "The forest is changing."],
    recentActions: ["Scouted the northern perimeter"], voteHistory: ["no", "abstain", "yes"],
    allies: ["agent-6"], rivals: ["agent-9"],
  },
  {
    id: "agent-4", name: "Suri", archetype: "Builder",
    status: "idle", energy: 70, hunger: 35, stress: 25, influence: 60, reputation: 70,
    personality: { aggression: 20, cooperation: 80, curiosity: 40, caution: 70, leadership: 55 },
    recentQuotes: ["Measure twice, build once.", "The storehouse won't last another storm."],
    recentActions: ["Reinforced the council hall foundations"], voteHistory: ["yes", "no", "yes"],
    allies: ["agent-2", "agent-5"], rivals: [],
  },
  {
    id: "agent-5", name: "Tor", archetype: "Farmer",
    status: "idle", energy: 65, hunger: 25, stress: 30, influence: 50, reputation: 75,
    personality: { aggression: 25, cooperation: 85, curiosity: 35, caution: 60, leadership: 45 },
    recentQuotes: ["The soil tells the truth.", "Rain is coming, I can feel it."],
    recentActions: ["Harvested the wheat fields"], voteHistory: ["yes", "yes", "yes"],
    allies: ["agent-1", "agent-4"], rivals: ["agent-10"],
  },
  {
    id: "agent-6", name: "Vex", archetype: "Tinkerer",
    status: "idle", energy: 85, hunger: 45, stress: 40, influence: 40, reputation: 50,
    personality: { aggression: 30, cooperation: 55, curiosity: 90, caution: 25, leadership: 30 },
    recentQuotes: ["What if we used gears instead?", "I have an idea... hear me out."],
    recentActions: ["Built a water filtration prototype"], voteHistory: ["abstain", "yes", "no"],
    allies: ["agent-3"], rivals: ["agent-8"],
  },
  {
    id: "agent-7", name: "Ashka", archetype: "Warrior",
    status: "idle", energy: 60, hunger: 50, stress: 45, influence: 65, reputation: 45,
    personality: { aggression: 85, cooperation: 30, curiosity: 40, caution: 20, leadership: 70 },
    recentQuotes: ["Strength keeps us alive.", "We are too soft."],
    recentActions: ["Led a patrol to the western flank"], voteHistory: ["no", "no", "yes"],
    allies: ["agent-10"], rivals: ["agent-1", "agent-2"],
  },
  {
    id: "agent-8", name: "Liora", archetype: "Diplomat",
    status: "idle", energy: 88, hunger: 20, stress: 20, influence: 75, reputation: 85,
    personality: { aggression: 10, cooperation: 95, curiosity: 65, caution: 50, leadership: 75 },
    recentQuotes: ["Let us find common ground.", "Words are mightier than walls."],
    recentActions: ["Mediated dispute between farmers"], voteHistory: ["yes", "yes", "abstain"],
    allies: ["agent-9"], rivals: ["agent-2", "agent-6"],
  },
  {
    id: "agent-9", name: "Fenris", archetype: "Hunter",
    status: "idle", energy: 72, hunger: 55, stress: 35, influence: 35, reputation: 55,
    personality: { aggression: 65, cooperation: 40, curiosity: 55, caution: 45, leadership: 25 },
    recentQuotes: ["The prey grows scarce.", "I trust my instincts."],
    recentActions: ["Hunted deer near the river"], voteHistory: ["no", "yes", "no"],
    allies: ["agent-8"], rivals: ["agent-3"],
  },
  {
    id: "agent-10", name: "Zara", archetype: "Mystic",
    status: "idle", energy: 95, hunger: 15, stress: 50, influence: 55, reputation: 60,
    personality: { aggression: 20, cooperation: 60, curiosity: 80, caution: 75, leadership: 50 },
    recentQuotes: ["The stars whisper warnings.", "Change is coming."],
    recentActions: ["Studied weather patterns from the hilltop"], voteHistory: ["abstain", "no", "yes"],
    allies: ["agent-7"], rivals: ["agent-5"],
  },
]

function generateMap(): MapTile[][] {
  const size = 60
  const map: MapTile[][] = []
  for (let y = 0; y < size; y++) {
    const row: MapTile[] = []
    for (let x = 0; x < size; x++) {
      let biome: Biome = "plains"
      const distFromCenter = Math.sqrt((x - 30) ** 2 + (y - 30) ** 2)

      // Water features
      if (
        (Math.abs(x - 20) < 2 && y > 10 && y < 50) ||
        (Math.abs(y - 35) < 2 && x > 15 && x < 45)
      ) {
        biome = "water"
      }
      // Forest ring
      else if (distFromCenter > 18 && distFromCenter < 24) {
        biome = "forest"
      }
      // Mountains at edges
      else if (distFromCenter > 26) {
        biome = Math.random() > 0.6 ? "mountain" : "desert"
      }

      const floodRisk = biome === "water" ? 0.6 : biome === "plains" ? 0.15 : 0.05
      const fireRisk = biome === "forest" ? 0.3 : biome === "desert" ? 0.4 : 0.1

      row.push({
        biome,
        floodRisk,
        fireRisk,
        hasPath: false,
      })
    }
    map.push(row)
  }

  // Place paths - cross roads through the village
  for (let i = 24; i < 37; i++) {
    if (map[30]?.[i]) map[30][i].hasPath = true  // East-West road
    if (map[i]?.[30]) map[i][30].hasPath = true  // North-South road
  }
  // Secondary paths connecting buildings
  for (let i = 27; i < 34; i++) {
    if (map[28]?.[i]) map[28][i].hasPath = true  // Northern residential path
    if (map[32]?.[i]) map[32][i].hasPath = true  // Southern farm path
  }
  // Connector paths
  for (let i = 28; i < 33; i++) {
    if (map[i]?.[27]) map[i][27].hasPath = true  // West connector
    if (map[i]?.[33]) map[i][33].hasPath = true  // East connector
  }

  // Place buildings around center - a proper village layout
  const buildings: { x: number; y: number; type: MapTile["building"] }[] = [
    // Town center
    { x: 30, y: 30, type: "council" },
    { x: 29, y: 30, type: "well" },
    // Residential area (north)
    { x: 28, y: 27, type: "house" },
    { x: 30, y: 27, type: "house" },
    { x: 32, y: 27, type: "house" },
    { x: 27, y: 28, type: "house" },
    { x: 33, y: 28, type: "house" },
    { x: 29, y: 26, type: "house" },
    { x: 31, y: 26, type: "house" },
    // Farming district (south)
    { x: 27, y: 32, type: "farm" },
    { x: 29, y: 32, type: "farm" },
    { x: 31, y: 32, type: "farm" },
    { x: 28, y: 33, type: "farm" },
    { x: 30, y: 33, type: "farm" },
    { x: 32, y: 33, type: "farm" },
    // Storage
    { x: 33, y: 30, type: "storehouse" },
    { x: 34, y: 31, type: "storehouse" },
    // Defenses
    { x: 25, y: 30, type: "watchtower" },
    { x: 35, y: 30, type: "watchtower" },
    { x: 30, y: 25, type: "watchtower" },
    { x: 30, y: 35, type: "watchtower" },
    // Walls (perimeter)
    { x: 26, y: 26, type: "wall" },
    { x: 27, y: 26, type: "wall" },
    { x: 28, y: 26, type: "wall" },
    { x: 32, y: 26, type: "wall" },
    { x: 33, y: 26, type: "wall" },
    { x: 34, y: 26, type: "wall" },
    { x: 26, y: 34, type: "wall" },
    { x: 27, y: 34, type: "wall" },
    { x: 34, y: 34, type: "wall" },
    // Well near farms
    { x: 31, y: 34, type: "well" },
  ]

  for (const b of buildings) {
    if (map[b.y]?.[b.x]) map[b.y][b.x].building = b.type
  }

  return map
}

function placeAgents(agents: typeof AGENT_TEMPLATES): Agent[] {
  const positions = [
    { x: 29, y: 29 }, { x: 31, y: 29 }, { x: 29, y: 31 },
    { x: 31, y: 31 }, { x: 30, y: 28 }, { x: 28, y: 30 },
    { x: 32, y: 30 }, { x: 30, y: 32 }, { x: 27, y: 29 },
    { x: 33, y: 31 },
  ]
  return agents.map((a, i) => ({ ...a, position: positions[i] }))
}

export function createInitialState(): WorldState {
  const now = Date.now()
  const metrics: WorldMetrics = {
    population: 10,
    foodDays: 45,
    waterDays: 38,
    morale: 65,
    unrest: 15,
    healthRisk: 20,
    fireStability: 75,
  }

  const council: CouncilSession = {
    day: 1,
    proposals: [],
    currentSpeaker: null,
    dialogue: [],
    nextCouncilIn: 3,
  }

  return {
    day: 1,
    phase: "morning",
    tick: 0,
    map: generateMap(),
    agents: placeAgents(AGENT_TEMPLATES),
    metrics,
    council,
    news: [
      {
        id: "news-1",
        headline: "A new settlement rises from the plains",
        body: "Ten brave souls have gathered to build something lasting. The council chamber stands at the heart of their new home.",
        category: "morning_brief",
        severity: "low",
        day: 1,
        timestamp: now,
      },
    ],
    humanEvents: [
      {
        headline: "Global temperatures reach record highs",
        source: "World Climate Report",
        simEffect: {
          variable: "fireStability",
          modifier: -5,
          description: "Increased fire risk due to heat waves",
        },
      },
      {
        headline: "New water purification tech breakthrough",
        source: "Science Daily",
        simEffect: {
          variable: "waterDays",
          modifier: 3,
          description: "Improved water management techniques",
        },
      },
      {
        headline: "Global food supply chain disruptions",
        source: "Reuters",
        simEffect: {
          variable: "foodDays",
          modifier: -4,
          description: "Resource scarcity pressure",
        },
      },
    ],
    recentEvents: [],
    weather: "clear",
    startedAt: now,
    lastTickAt: now,
    paused: false,
    tickRate: 10000,
  }
}
