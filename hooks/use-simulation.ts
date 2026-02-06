"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import type { WorldState, Snapshot, WorldEvent, WorldMetrics } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface SSEStatus {
  connected: boolean
  lastUpdate: number | null
}

export function useSimulation() {
  const { data, error, mutate } = useSWR<{
    state: WorldState
    snapshots: Snapshot[]
    events: WorldEvent[]
  }>("/api/state", fetcher, {
    refreshInterval: 8000,
    revalidateOnFocus: true,
  })

  const [sseStatus, setSSEStatus] = useState<SSEStatus>({
    connected: false,
    lastUpdate: null,
  })
  const [liveMetrics, setLiveMetrics] = useState<WorldMetrics | null>(null)
  const [breakingNews, setBreakingNews] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource("/api/stream")
    eventSourceRef.current = es

    es.onopen = () => {
      setSSEStatus({ connected: true, lastUpdate: Date.now() })
    }

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        setSSEStatus({ connected: true, lastUpdate: Date.now() })

        if (parsed.type === "state_update") {
          mutate()
        }
        if (parsed.type === "metrics") {
          setLiveMetrics(parsed.data)
        }
        if (parsed.type === "breaking_news") {
          setBreakingNews(parsed.data.headline)
          setTimeout(() => setBreakingNews(null), 8000)
        }
      } catch {
        // Ignore parse errors
      }
    }

    es.onerror = () => {
      setSSEStatus((prev) => ({ ...prev, connected: false }))
    }

    return () => {
      es.close()
    }
  }, [mutate])

  const triggerTick = useCallback(async () => {
    await fetch("/api/tick", { method: "POST" })
    mutate()
  }, [mutate])

  return {
    state: data?.state ?? null,
    snapshots: data?.snapshots ?? [],
    events: data?.events ?? [],
    liveMetrics: liveMetrics ?? data?.state?.metrics ?? null,
    breakingNews,
    sseStatus,
    isLoading: !data && !error,
    error,
    triggerTick,
    mutate,
  }
}
