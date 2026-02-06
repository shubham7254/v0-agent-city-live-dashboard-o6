import { getWorldState } from "@/lib/redis"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let lastTick = 0

      const send = (type: string, data: unknown) => {
        const msg = `data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`
        controller.enqueue(encoder.encode(msg))
      }

      // Send initial state
      try {
        const state = await getWorldState()
        if (state) {
          send("state_update", {
            day: state.day,
            hour: state.hour,
            phase: state.phase,
            tick: state.tick,
            metrics: state.metrics,
            agents: state.agents.map((a) => ({
              id: a.id,
              name: a.name,
              status: a.status,
              energy: a.energy,
              hunger: a.hunger,
              stress: a.stress,
              position: a.position,
            })),
            weather: state.weather,
            paused: state.paused,
          })
          lastTick = state.tick
        }
      } catch {
        // Ignore initial error
      }

      // Poll for changes
      const interval = setInterval(async () => {
        try {
          const state = await getWorldState()
          if (!state) return

          if (state.tick !== lastTick) {
            lastTick = state.tick

            send("state_update", {
              day: state.day,
              hour: state.hour,
              phase: state.phase,
              tick: state.tick,
              metrics: state.metrics,
              agents: state.agents.map((a) => ({
                id: a.id,
                name: a.name,
                status: a.status,
                energy: a.energy,
                hunger: a.hunger,
                stress: a.stress,
                position: a.position,
              })),
              weather: state.weather,
              paused: state.paused,
            })

            // Send latest news
            if (state.news.length > 0) {
              const latest = state.news[0]
              if (latest.category === "breaking") {
                send("breaking_news", latest)
              }
            }

            // Send metrics
            send("metrics", state.metrics)

            // Send council update
            if (state.phase === "evening" || state.council.proposals.length > 0) {
              send("council_update", {
                currentSpeaker: state.council.currentSpeaker,
                proposals: state.council.proposals,
                dialogue: state.council.dialogue.slice(0, 5),
              })
            }
          }
        } catch {
          // Silently handle polling errors
        }
      }, 3000)

      // Clean up
      const timeout = setTimeout(() => {
        clearInterval(interval)
        controller.close()
      }, 5 * 60 * 1000) // 5 minutes max

      // Store cleanup refs
      controller.enqueue(encoder.encode(`: keepalive\n\n`))

      // Handle abort
      const onClose = () => {
        clearInterval(interval)
        clearTimeout(timeout)
      }

      // Periodic keepalive
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`))
        } catch {
          onClose()
        }
      }, 15000)

      // Clean everything on stream end
      void Promise.resolve().then(() => {
        return new Promise<void>((resolve) => {
          const checkClosed = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(""))
            } catch {
              clearInterval(checkClosed)
              clearInterval(interval)
              clearInterval(keepalive)
              clearTimeout(timeout)
              resolve()
            }
          }, 30000)
        })
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
