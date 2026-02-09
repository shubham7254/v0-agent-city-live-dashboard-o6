import type { WorldState, Snapshot, WorldEvent, ChronicleEntry } from "./types"

// ── In-Memory Store (replaces Redis) ──
// This allows the simulation to run without an external Redis instance.
// Data persists as long as the server process is running.

const store: {
  worldState: WorldState | null
  snapshots: Snapshot[]
  events: WorldEvent[]
  chronicles: ChronicleEntry[]
  spectators: Map<string, number> // viewerId -> lastSeen timestamp
  vote: CommunityProposal | null
  voteResults: { a: number; b: number }
  voters: Set<string>
  settings: Record<string, unknown>
} = {
  worldState: null,
  snapshots: [],
  events: [],
  chronicles: [],
  spectators: new Map(),
  vote: null,
  voteResults: { a: 0, b: 0 },
  voters: new Set(),
  settings: {},
}

// ── World State ──
export async function getWorldState(): Promise<WorldState | null> {
  return store.worldState
}

export async function setWorldState(state: WorldState): Promise<void> {
  store.worldState = state
}

// ── Snapshots ──
export async function pushSnapshot(snapshot: Snapshot): Promise<void> {
  store.snapshots.unshift(snapshot)
  if (store.snapshots.length > 200) {
    store.snapshots = store.snapshots.slice(0, 200)
  }
}

export async function getSnapshots(count = 50): Promise<Snapshot[]> {
  return store.snapshots.slice(0, count)
}

// ── Event Log ──
export async function pushEvent(event: WorldEvent): Promise<void> {
  store.events.unshift(event)
  if (store.events.length > 2000) {
    store.events = store.events.slice(0, 2000)
  }
}

export async function getEvents(count = 50): Promise<WorldEvent[]> {
  return store.events.slice(0, count)
}

// ── Chronicle ──
export async function pushChronicle(entry: ChronicleEntry): Promise<void> {
  store.chronicles.unshift(entry)
  if (store.chronicles.length > 100) {
    store.chronicles = store.chronicles.slice(0, 100)
  }
}

export async function getChronicles(count = 30): Promise<ChronicleEntry[]> {
  return store.chronicles.slice(0, count)
}

// ── Spectator Count (heartbeat-based) ──
const SPECTATOR_TTL = 45 // seconds before a viewer is considered gone

function pruneStaleSpectators() {
  const cutoff = Date.now() - SPECTATOR_TTL * 1000
  for (const [id, lastSeen] of store.spectators) {
    if (lastSeen < cutoff) {
      store.spectators.delete(id)
    }
  }
}

export async function registerSpectator(viewerId: string): Promise<number> {
  store.spectators.set(viewerId, Date.now())
  pruneStaleSpectators()
  return store.spectators.size
}

export async function getSpectatorCount(): Promise<number> {
  pruneStaleSpectators()
  return store.spectators.size
}

// ── Community Voting ──
export interface CommunityProposal {
  id: string
  title: string
  description: string
  optionA: string
  optionB: string
  expiresAt: number
  createdAt: number
}

export async function getCurrentVote(): Promise<{
  proposal: CommunityProposal | null
  results: { a: number; b: number }
  totalVoters: number
}> {
  const proposal = store.vote
  if (!proposal || Date.now() > proposal.expiresAt) {
    return { proposal: null, results: { a: 0, b: 0 }, totalVoters: 0 }
  }
  return {
    proposal,
    results: { ...store.voteResults },
    totalVoters: store.voters.size,
  }
}

export async function castVote(
  viewerId: string,
  choice: "a" | "b"
): Promise<{ success: boolean; results: { a: number; b: number } }> {
  const proposal = store.vote
  if (!proposal || Date.now() > proposal.expiresAt) {
    return { success: false, results: { a: 0, b: 0 } }
  }
  if (store.voters.has(viewerId)) {
    return { success: false, results: { ...store.voteResults } }
  }
  store.voters.add(viewerId)
  if (choice === "a") store.voteResults.a++
  else store.voteResults.b++
  return { success: true, results: { ...store.voteResults } }
}

export async function setNewVote(proposal: CommunityProposal): Promise<void> {
  store.vote = proposal
  store.voteResults = { a: 0, b: 0 }
  store.voters.clear()
}

// ── Settings ──
export async function getSettings(): Promise<Record<string, unknown>> {
  return store.settings
}

export async function setSettings(settings: Record<string, unknown>): Promise<void> {
  store.settings = settings
}
