/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show } from "solid-js"
import { computeStats, dayStart, readSteps, type RequestStats } from "./stats"

export default Plugin.define({
  id: "session-stats",
  setup(context) {
    const [stats, setStats] = createSignal<RequestStats | null>(null)
    let busy = false

    const refresh = async () => {
      if (busy) return
      busy = true
      const now = Date.now()
      try {
        const response = await context.client.experimental.session.stats({
          from: dayStart(now),
          to: now,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        setStats(computeStats(readSteps(response), now))
      } catch {
        // Older servers may not expose this endpoint; keep the last value.
      } finally {
        busy = false
      }
    }

    void refresh()
    const timer = setInterval(() => void refresh(), 10_000)

    const disposeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <Show when={stats()}>
          {(value) => (
            <text fg={context.theme.text.muted}>
              LLM today  {value().total} · {Math.round(value().perHour)}/h
            </text>
          )}
        </Show>
      ),
    })

    const disposeComposer = context.ui.slot({
      append: "session.composer.top",
      render: () => (
        <Show when={stats()}>
          {(value) => (
            <text fg={context.theme.text.muted}>
              LLM today  {value().total} · {Math.round(value().perHour)}/h
            </text>
          )}
        </Show>
      ),
    })

    return () => {
      clearInterval(timer)
      disposeSidebar?.()
      disposeComposer?.()
    }
  },
})