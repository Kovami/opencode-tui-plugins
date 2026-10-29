export type RequestStats = {
  total: number
  perHour: number
}

/** Local midnight for the given instant, as epoch milliseconds. */
export function dayStart(now: number): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

/**
 * Accepts both `{data:{steps}}` and `{steps}` envelopes and normalizes
 * anything that is not a finite, non-negative number to zero.
 */
export function readSteps(response: unknown): number {
  const root = asRecord(response)
  const data = asRecord(root?.data)
  const steps = data?.steps ?? root?.steps
  return typeof steps === "number" && Number.isFinite(steps) && steps > 0 ? steps : 0
}

export function computeStats(steps: number, now: number): RequestStats {
  const total = Number.isFinite(steps) && steps > 0 ? steps : 0
  const hours = (now - dayStart(now)) / 3_600_000
  return {
    total,
    perHour: hours > 0 ? total / hours : 0,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}