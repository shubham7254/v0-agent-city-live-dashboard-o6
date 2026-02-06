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

// ── Settings ──
export async function getSettings(): Promise<Record<string, unknown>> {
  const s = await redis.get<Record<string, unknown>>("settings")
  return s ?? {}
}

export async function setSettings(settings: Record<string, unknown>): Promise<void> {
  await redis.set("settings", settings)
}
