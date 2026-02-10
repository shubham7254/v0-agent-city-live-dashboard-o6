import { Redis } from "@upstash/redis"
import type { WorldState, Snapshot, WorldEvent, ChronicleEntry } from "./types"

// ── Redis Client ──
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// ── Keys ──
const KEYS = {
  worldState: "agent_city:world_state",
  snapshots: "agent_city:snapshots",
  events: "agent_city:events",
  chronicles: "agent_city:chronicles",
  spectatorPrefix: "agent_city:spectator:",
  spectatorSet: "agent_city:spectators_set",
  vote: "agent_city:vote",
  voteResults: "agent_city:vote_results",
  voters: "agent_city:voters",
  settings: "agent_city:settings",
}

// ── World State ──
export async function getWorldState(): Promise<WorldState | null> {
  const state = await redis.get<WorldState>(KEYS.worldState)
  return state ?? null
}

export async function setWorldState(state: WorldState): Promise<void> {
  await redis.set(KEYS.worldState, state)
}

// ── Snapshots ──
export async function pushSnapshot(snapshot: Snapshot): Promise<void> {
  await redis.lpush(KEYS.snapshots, snapshot)
  await redis.ltrim(KEYS.snapshots, 0, 199)
}

export async function getSnapshots(count = 50): Promise<Snapshot[]> {
  const snapshots = await redis.lrange<Snapshot>(KEYS.snapshots, 0, count - 1)
  return snapshots ?? []
}

// ── Event Log ──
export async function pushEvent(event: WorldEvent): Promise<void> {
  await redis.lpush(KEYS.events, event)
  await redis.ltrim(KEYS.events, 0, 1999)
}

export async function getEvents(count = 50): Promise<WorldEvent[]> {
  const events = await redis.lrange<WorldEvent>(KEYS.events, 0, count - 1)
  return events ?? []
}

// ── Chronicle ──
export async function pushChronicle(entry: ChronicleEntry): Promise<void> {
  await redis.lpush(KEYS.chronicles, entry)
  await redis.ltrim(KEYS.chronicles, 0, 99)
}

export async function getChronicles(count = 30): Promise<ChronicleEntry[]> {
  const chronicles = await redis.lrange<ChronicleEntry>(KEYS.chronicles, 0, count - 1)
  return chronicles ?? []
}

// ── Spectator Count (heartbeat-based) ──
const SPECTATOR_TTL = 45 // seconds

export async function registerSpectator(viewerId: string): Promise<number> {
  const key = `${KEYS.spectatorPrefix}${viewerId}`
  await redis.set(key, "1", { ex: SPECTATOR_TTL })
  await redis.sadd(KEYS.spectatorSet, viewerId)
  // Prune stale spectators
  const members = await redis.smembers(KEYS.spectatorSet)
  let count = 0
  for (const member of members) {
    const exists = await redis.exists(`${KEYS.spectatorPrefix}${member}`)
    if (exists) {
      count++
    } else {
      await redis.srem(KEYS.spectatorSet, member)
    }
  }
  return count
}

export async function getSpectatorCount(): Promise<number> {
  const members = await redis.smembers(KEYS.spectatorSet)
  let count = 0
  for (const member of members) {
    const exists = await redis.exists(`${KEYS.spectatorPrefix}${member}`)
    if (exists) {
      count++
    } else {
      await redis.srem(KEYS.spectatorSet, member)
    }
  }
  return count
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
  const proposal = await redis.get<CommunityProposal>(KEYS.vote)
  if (!proposal || Date.now() > proposal.expiresAt) {
    return { proposal: null, results: { a: 0, b: 0 }, totalVoters: 0 }
  }
  const results = (await redis.get<{ a: number; b: number }>(KEYS.voteResults)) ?? { a: 0, b: 0 }
  const totalVoters = await redis.scard(KEYS.voters)
  return { proposal, results, totalVoters }
}

export async function castVote(
  viewerId: string,
  choice: "a" | "b"
): Promise<{ success: boolean; results: { a: number; b: number } }> {
  const proposal = await redis.get<CommunityProposal>(KEYS.vote)
  if (!proposal || Date.now() > proposal.expiresAt) {
    return { success: false, results: { a: 0, b: 0 } }
  }
  const alreadyVoted = await redis.sismember(KEYS.voters, viewerId)
  if (alreadyVoted) {
    const results = (await redis.get<{ a: number; b: number }>(KEYS.voteResults)) ?? { a: 0, b: 0 }
    return { success: false, results }
  }
  await redis.sadd(KEYS.voters, viewerId)
  const results = (await redis.get<{ a: number; b: number }>(KEYS.voteResults)) ?? { a: 0, b: 0 }
  if (choice === "a") results.a++
  else results.b++
  await redis.set(KEYS.voteResults, results)
  return { success: true, results }
}

export async function setNewVote(proposal: CommunityProposal): Promise<void> {
  await redis.set(KEYS.vote, proposal)
  await redis.set(KEYS.voteResults, { a: 0, b: 0 })
  await redis.del(KEYS.voters)
}

// ── Settings ──
export async function getSettings(): Promise<Record<string, unknown>> {
  const settings = await redis.get<Record<string, unknown>>(KEYS.settings)
  return settings ?? {}
}

export async function setSettings(settings: Record<string, unknown>): Promise<void> {
  await redis.set(KEYS.settings, settings)
}
