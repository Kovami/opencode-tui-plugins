/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, For, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import {
  computeSessionTime,
  formatClock,
  formatDuration,
  type SessionMessage,
} from "./time"

const PANEL = "session-clock.timeline"

const mergeMessages = (
  cached: readonly SessionMessage[],
  local: readonly SessionMessage[],
): SessionMessage[] => {
  const byID = new Map<string, SessionMessage>()
  for (const message of cached) {
    if (message.id) byID.set(message.id, message)
  }
  for (const message of local) {
    if (message.id) byID.set(message.id, message)
  }
  return [...byID.values()]
}

export default Plugin.define({
  id: "session-clock",
  setup(context) {
    // One tick drives every slot. Server events make the numbers react to new
    // messages immediately; the timer keeps the wall clock and the open agent
    // step moving while they are running.
    const [tick, setTick] = createSignal(0)
    const bump = () => setTick((value) => value + 1)
    const unlisten = context.data.listen(() => bump())
    const timer = setInterval(bump, 1_000)

    // The TUI store keeps only a window of recent messages. Load the complete
    // history once per session so old assistant turns are not left out of the
    // active total. New messages keep arriving through the reactive local list.
    const [history, setHistory] = createSignal<Record<string, SessionMessage[]>>({})
    const loading = new Set<string>()
    const forcedAt = new Map<string, number>()

    const overlaps = (cached: readonly SessionMessage[], local: readonly SessionMessage[]) => {
      const ids = new Set(local.map((message) => message.id).filter(Boolean))
      return cached.some((message) => message.id && ids.has(message.id))
    }

    const loadHistory = async (sessionID: string) => {
      const messages: SessionMessage[] = []
      let cursor: string | undefined
      for (let page = 0; page < 100; page++) {
        const response = (await context.client.message.list(
          cursor
            ? { sessionID, limit: 200, cursor }
            : { sessionID, limit: 200, order: "asc" },
        )) as {
          data?: SessionMessage[]
          cursor?: { next?: string | null }
        }
        messages.push(...(response.data ?? []))
        const next = response.cursor?.next
        if (!next || next === cursor) break
        cursor = next
      }
      return messages
    }

    const ensureHistory = (sessionID: string, force = false) => {
      if (loading.has(sessionID)) return
      if (!force && history()[sessionID]) return
      loading.add(sessionID)
      void loadHistory(sessionID)
        .then((messages) => {
          setHistory((previous) => ({ ...previous, [sessionID]: messages }))
          bump()
        })
        .catch(() => {
          // Keep the local window as a fallback and retry on the next render.
        })
        .finally(() => loading.delete(sessionID))
    }

    const read = (sessionID: string) => {
      tick()
      const session = context.data.session.get(sessionID)
      const local = (context.data.session.message.list(sessionID) ?? []) as SessionMessage[]
      const cached = history()[sessionID] ?? []

      // Once the live message window no longer overlaps the cached history, the
      // cache is too old to merge correctly. Reload it, but not more than once
      // every ten seconds if the request keeps failing.
      if (cached.length > 0 && local.length > 0 && !overlaps(cached, local)) {
        const now = Date.now()
        if (now - (forcedAt.get(sessionID) ?? 0) > 10_000) {
          forcedAt.set(sessionID, now)
          ensureHistory(sessionID, true)
        }
      } else {
        ensureHistory(sessionID)
      }

      const messages = mergeMessages(cached, local)
      return computeSessionTime(messages, session?.time?.created ?? 0)
    }

    const currentSessionID = () => {
      const route = context.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }

    const disposeSidebar = context.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }) => {
        const time = read(sessionID)
        return (
          <box flexDirection="column">
            <text fg={context.theme.text.base} attributes={TextAttributes.BOLD}>
              Session time
            </text>
            <text fg={context.theme.text.base}>Agent  {formatDuration(time.activeMs)}</text>
            <text fg={context.theme.text.muted}>Idle   {formatDuration(time.idleMs)}</text>
            <text fg={context.theme.text.base}>Total  {formatDuration(time.totalMs)}</text>
          </box>
        )
      },
    })

    const disposeComposer = context.ui.slot({
      prepend: "session.composer.top",
      render: ({ sessionID }) => {
        const time = read(sessionID)
        return (
          <text fg={context.theme.text.muted}>
            Agent {formatDuration(time.activeMs)} · Idle {formatDuration(time.idleMs)} · Total{" "}
            {formatDuration(time.totalMs)}
          </text>
        )
      },
    })

    const disposePanel = context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === PANEL}>
          {(() => {
            const sessionID = currentSessionID()
            if (!sessionID) {
              return <text fg={context.theme.text.muted}>No active session</text>
            }
            const time = read(sessionID)
            const steps = time.steps.slice(-12)
            return (
              <box flexDirection="column">
                <text fg={context.theme.text.base} attributes={TextAttributes.BOLD}>
                  Session time
                </text>
                <text fg={context.theme.text.base}>
                  Agent {formatDuration(time.activeMs)} · Idle {formatDuration(time.idleMs)} · Total{" "}
                  {formatDuration(time.totalMs)}
                </text>
                <text fg={context.theme.text.muted}>
                  {Math.round(time.activePercent)}% of the session was agent work
                </text>
                <text fg={context.theme.text.base} attributes={TextAttributes.BOLD}>
                  Recent agent steps
                </text>
                <Show
                  when={steps.length > 0}
                  fallback={<text fg={context.theme.text.muted}>No agent steps yet</text>}
                >
                  <For each={steps}>
                    {(step) => (
                      <text fg={context.theme.text.muted}>
                        {formatClock(step.createdAt)}  {formatDuration(step.durationMs)}
                        {step.gapMs >= 1_000
                          ? `  (+${formatDuration(step.gapMs, true)} idle)`
                          : ""}
                      </text>
                    )}
                  </For>
                </Show>
              </box>
            )
          })()}
        </Show>
      ),
    })

    try {
      // The layer is removed automatically when the plugin deactivates.
      context.keymap.layer(() => ({
        mode: "global",
        commands: [
          {
            id: PANEL,
            title: "Session time: timeline",
            slash: { name: "time" },
            run: () => {
              context.ui.panel.open(PANEL)
            },
          },
        ],
      }))
    } catch {
      // A headless client has no keymap provider; the panel simply stays closed.
    }

    return () => {
      clearInterval(timer)
      unlisten()
      disposeSidebar?.()
      disposeComposer?.()
      disposePanel?.()
    }
  },
})