import { Redis } from "@upstash/redis"
import type { WorldState, Snapshot, WorldEvent, ChronicleEntry } from "./types"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export default redis

// ── World State ──
export async function getWorldState(): Promise<WorldState | null> {
  return redis.get<WorldState>("world_state")
}

export async function setWorldState(state: WorldState): Promise<void> {
  await redis.set("world_state", state)
}

// ── Snapshots ──
export async function pushSnapshot(snapshot: Snapshot): Promise<void> {
  await redis.lpush("world_snapshots", snapshot)
  await redis.ltrim("world_snapshots", 0, 199)
}

export async function getSnapshots(count = 50): Promise<Snapshot[]> {
  return redis.lrange<Snapshot>("world_snapshots", 0, count - 1)
}

// ── Event Log ──
export async function pushEvent(event: WorldEvent): Promise<void> {
  await redis.lpush("event_log", event)
  await redis.ltrim("event_log", 0, 1999)
}

export async function getEvents(count = 50): Promise<WorldEvent[]> {
  return redis.lrange<WorldEvent>("event_log", 0, count - 1)
}

// ── Chronicle ──
export async function pushChronicle(entry: ChronicleEntry): Promise<void> {
  await redis.lpush("chronicles", entry)
  await redis.ltrim("chronicles", 0, 99)
}

export async function getChronicles(count = 30): Promise<ChronicleEntry[]> {
  return redis.lrange<ChronicleEntry>("chronicles", 0, count - 1)
}

// ── Spectator Count (heartbeat-based) ──
const SPECTATOR_KEY = "spectators"
const SPECTATOR_TTL = 45 // seconds before a viewer is considered gone

export async function registerSpectator(viewerId: string): Promise<number> {
  const now = Date.now()
  await redis.zadd(SPECTATOR_KEY, { score: now, member: viewerId })
  // Remove stale viewers (older than TTL)
  await redis.zremrangebyscore(SPECTATOR_KEY, 0, now - SPECTATOR_TTL * 1000)
  return redis.zcard(SPECTATOR_KEY)
}

export async function getSpectatorCount(): Promise<number> {
  const now = Date.now()
  await redis.zremrangebyscore(SPECTATOR_KEY, 0, now - SPECTATOR_TTL * 1000)
  return redis.zcard(SPECTATOR_KEY)
}

// ── Community Voting ──
const VOTE_KEY = "community_vote"
const VOTE_RESULTS_KEY = "community_vote_results"
const VOTE_VOTERS_KEY = "community_vote_voters"

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
  const proposal = await redis.get<CommunityProposal>(VOTE_KEY)
  if (!proposal || Date.now() > proposal.expiresAt) {
    return { proposal: null, results: { a: 0, b: 0 }, totalVoters: 0 }
  }
  const results = await redis.get<{ a: number; b: number }>(VOTE_RESULTS_KEY) ?? { a: 0, b: 0 }
  const totalVoters = await redis.scard(VOTE_VOTERS_KEY)
  return { proposal, results, totalVoters }
}

export async function castVote(viewerId: string, choice: "a" | "b"): Promise<{ success: boolean; results: { a: number; b: number } }> {
  const proposal = await redis.get<CommunityProposal>(VOTE_KEY)
  if (!proposal || Date.now() > proposal.expiresAt) {
    return { success: false, results: { a: 0, b: 0 } }
  }
  const alreadyVoted = await redis.sismember(VOTE_VOTERS_KEY, viewerId)
  if (alreadyVoted) {
    const results = await redis.get<{ a: number; b: number }>(VOTE_RESULTS_KEY) ?? { a: 0, b: 0 }
    return { success: false, results }
  }
  await redis.sadd(VOTE_VOTERS_KEY, viewerId)
  const results = await redis.get<{ a: number; b: number }>(VOTE_RESULTS_KEY) ?? { a: 0, b: 0 }
  if (choice === "a") results.a++
  else results.b++
  await redis.set(VOTE_RESULTS_KEY, results)
  return { success: true, results }
}

export async function setNewVote(proposal: CommunityProposal): Promise<void> {
  await redis.set(VOTE_KEY, proposal)
  await redis.set(VOTE_RESULTS_KEY, { a: 0, b: 0 })
  await redis.del(VOTE_VOTERS_KEY)
}

// ── Settings ──
export async function getSettings(): Promise<Record<string, unknown>> {
  const s = await redis.get<Record<string, unknown>>("settings")
  return s ?? {}
}

export async function setSettings(settings: Record<string, unknown>): Promise<void> {
  await redis.set("settings", settings)
}
