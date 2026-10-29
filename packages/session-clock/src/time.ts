export type SessionMessage = {
  id?: string
  type?: string
  agent?: string
  model?: { id?: string } | string
  time?: {
    created?: number
    completed?: number
  }
}

export type AgentStep = {
  createdAt: number
  completedAt: number
  durationMs: number
  gapMs: number
}

export type SessionTime = {
  startedAt: number
  totalMs: number
  activeMs: number
  idleMs: number
  activePercent: number
  steps: AgentStep[]
}

/**
 * Active time is the sum of assistant-message durations: from the moment a
 * model request starts until its reply (including tool execution) completes.
 * Gaps between requests are idle, so waiting for the user never counts.
 *
 * Total is wall-clock time from the session start to `now`, so it intentionally
 * includes idle time. For a live session it keeps ticking.
 */
export function computeSessionTime(
  messages: readonly SessionMessage[],
  startedAt: number,
  now = Date.now(),
): SessionTime {
  const start = startedAt || firstMessageTime(messages)
  const totalMs = start > 0 ? Math.max(0, now - start) : 0

  const steps: AgentStep[] = []
  const lastAssistant = findLastAssistant(messages)
  let activeMs = 0
  let previousEnd = 0

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    if (message?.type !== "assistant") continue

    const createdAt = message.time?.created
    if (!createdAt) continue

    const isOpen = index === lastAssistant && !message.time?.completed
    const completedAt = message.time?.completed ?? (isOpen ? now : createdAt)
    const durationMs = Math.max(0, completedAt - createdAt)
    const gapMs = previousEnd > 0 ? Math.max(0, createdAt - previousEnd) : 0

    activeMs += durationMs
    steps.push({ createdAt, completedAt, durationMs, gapMs })
    if (completedAt > previousEnd) previousEnd = completedAt
  }

  // Guards against clock skew or a session whose first message predates its
  // recorded start.
  activeMs = Math.min(activeMs, totalMs)
  const idleMs = Math.max(0, totalMs - activeMs)

  return {
    startedAt: start,
    totalMs,
    activeMs,
    idleMs,
    activePercent: totalMs > 0 ? (activeMs / totalMs) * 100 : 0,
    steps,
  }
}

function findLastAssistant(messages: readonly SessionMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.type === "assistant") return index
  }
  return -1
}

function firstMessageTime(messages: readonly SessionMessage[]): number {
  let first = 0
  for (const message of messages) {
    const created = message.time?.created
    if (created && (first === 0 || created < first)) first = created
  }
  return first
}

export function formatDuration(ms: number, compact = false): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60

  if (hours > 0) {
    const mm = String(minutes).padStart(2, "0")
    return compact ? `${hours}h ${mm}m` : `${hours}h ${mm}m ${String(rest).padStart(2, "0")}s`
  }
  if (minutes > 0) {
    return compact ? `${minutes}m` : `${minutes}m ${String(rest).padStart(2, "0")}s`
  }
  return `${rest}s`
}

export function formatClock(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}