// ── Agent City Live – Core Types ──

export type Phase = "morning" | "day" | "evening" | "night"
export type Biome = "water" | "forest" | "plains" | "mountain" | "desert"
export type BuildingType = "house" | "farm" | "watchtower" | "council" | "storehouse" | "well" | "wall"
export type AgentStatus = "sleeping" | "working" | "in_council" | "on_watch" | "idle" | "exploring"
export type EventSeverity = "low" | "medium" | "high" | "critical"
export type CameraMode = "follow_events" | "free" | "wide"
export type VoteChoice = "yes" | "no" | "abstain"

export interface Position {
  x: number
  y: number
}

export interface MapTile {
  biome: Biome
  building?: BuildingType
  hasPath?: boolean
  floodRisk: number   // 0-1
  fireRisk: number    // 0-1
}

export interface AgentPersonality {
  aggression: number   // 0-100
  cooperation: number
  curiosity: number
  caution: number
  leadership: number
}

export interface Agent {
  id: string
  name: string
  archetype: string
  position: Position
  status: AgentStatus
  energy: number       // 0-100
  hunger: number       // 0-100
  stress: number       // 0-100
  influence: number    // 0-100
  reputation: number   // 0-100
  personality: AgentPersonality
  recentQuotes: string[]
  recentActions: string[]
  voteHistory: VoteChoice[]
  allies: string[]     // agent ids
  rivals: string[]     // agent ids
}

export interface Proposal {
  id: string
  title: string
  description: string
  proposedBy: string   // agent id
  cost: number
  expectedImpact: { metric: string; direction: "up" | "down"; amount: number }[]
  votes: Record<string, VoteChoice>
  status: "pending" | "approved" | "rejected"
}

export interface CouncilDialogue {
  agentId: string
  message: string
  timestamp: number
  type: "proposal" | "opinion" | "debate" | "human_news_reaction" | "vote_statement"
  referencedProposal?: string
  referencedHumanEvent?: string
}

export interface CouncilSession {
  day: number
  proposals: Proposal[]
  currentSpeaker: string | null
  dialogue: CouncilDialogue[]
  nextCouncilIn: number  // ticks
  isActive: boolean
  startHour: number
  endHour: number
}

export interface NewsItem {
  id: string
  headline: string
  body: string
  category: "morning_brief" | "breaking" | "night_recap"
  severity: EventSeverity
  day: number
  timestamp: number
}

export interface HumanWorldEvent {
  headline: string
  source: string
  simEffect: {
    variable: string
    modifier: number
    description: string
  }
}

export interface WorldEvent {
  id: string
  type: string
  description: string
  severity: EventSeverity
  position?: Position
  day: number
  phase: Phase
  timestamp: number
  involvedAgents: string[]
}

export interface WorldMetrics {
  population: number
  foodDays: number
  waterDays: number
  morale: number       // 0-100
  unrest: number       // 0-100
  healthRisk: number   // 0-100
  fireStability: number // 0-100
}

export interface WorldState {
  day: number
  hour: number         // 0-23
  phase: Phase
  tick: number
  map: MapTile[][]     // 60x60
  agents: Agent[]
  metrics: WorldMetrics
  council: CouncilSession
  news: NewsItem[]
  humanEvents: HumanWorldEvent[]
  recentEvents: WorldEvent[]
  weather: "clear" | "rain" | "storm" | "fog" | "heat"
  startedAt: number
  lastTickAt: number
  paused: boolean
  tickRate: number     // ms between ticks
  councilActive: boolean
  councilAnnouncement: string | null
}

export interface Snapshot {
  day: number
  phase: Phase
  tick: number
  metrics: WorldMetrics
  timestamp: number
  mapHash?: string
}

export interface ChronicleEntry {
  day: number
  headlines: string[]
  keyVote?: { title: string; result: "approved" | "rejected" }
  topMoments: string[]
  metricsSnapshot: WorldMetrics
  timestamp: number
}

export interface SSEMessage {
  type: "state_update" | "event" | "breaking_news" | "metrics" | "council_update"
  data: unknown
  timestamp: number
}

// Brain provider interface
export interface BrainProvider {
  generateProposal(agent: Agent, state: WorldState): Proposal
  generateVote(agent: Agent, proposal: Proposal, state: WorldState): VoteChoice
  generateDialogue(agent: Agent, context: string, state: WorldState): string
  decideAction(agent: Agent, state: WorldState): string
}
