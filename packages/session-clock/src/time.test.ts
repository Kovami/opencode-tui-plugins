import { describe, expect, test } from "vitest"
import {
  computeSessionTime,
  formatClock,
  formatDuration,
  type SessionMessage,
} from "./time"

const assistant = (created: number, completed?: number): SessionMessage => ({
  id: `${created}-${completed ?? "open"}`,
  type: "assistant",
  time: completed === undefined ? { created } : { created, completed },
})

describe("computeSessionTime", () => {
  test("empty messages produce zeros", () => {
    expect(computeSessionTime([], 0, 10_000)).toEqual({
      startedAt: 0,
      totalMs: 0,
      activeMs: 0,
      idleMs: 0,
      activePercent: 0,
      steps: [],
    })
  })

  test("sums finished steps and reports the gap as idle", () => {
    const result = computeSessionTime(
      [assistant(1_000, 2_000), assistant(3_000, 5_000)],
      1_000,
      6_000,
    )
    expect(result.activeMs).toBe(3_000)
    expect(result.idleMs).toBe(2_000)
    expect(result.totalMs).toBe(5_000)
    expect(result.steps).toHaveLength(2)
    expect(result.steps[1]?.gapMs).toBe(1_000)
  })

  test("an open last step runs to now", () => {
    const result = computeSessionTime([assistant(1_000)], 1_000, 4_000)
    expect(result.activeMs).toBe(3_000)
    expect(result.idleMs).toBe(0)
  })

  test("clamps active time to total wall clock", () => {
    const result = computeSessionTime([assistant(1_000, 9_000)], 5_000, 10_000)
    expect(result.totalMs).toBe(5_000)
    expect(result.activeMs).toBe(5_000)
    expect(result.idleMs).toBe(0)
  })

  test("falls back to the first message when the session has no start", () => {
    const result = computeSessionTime([assistant(2_000, 3_000)], 0, 4_000)
    expect(result.startedAt).toBe(2_000)
    expect(result.totalMs).toBe(2_000)
  })
})

describe("formatDuration", () => {
  test("formats short and long spans", () => {
    expect(formatDuration(0)).toBe("0s")
    expect(formatDuration(59_000)).toBe("59s")
    expect(formatDuration(60_000)).toBe("1m 00s")
    expect(formatDuration(3_661_000)).toBe("1h 01m 01s")
  })

  test("compact mode drops seconds and zero minutes", () => {
    expect(formatDuration(60_000, true)).toBe("1m")
    expect(formatDuration(3_661_000, true)).toBe("1h 01m")
  })
})

describe("formatClock", () => {
  test("renders a zero-padded local time", () => {
    expect(formatClock(new Date(2020, 0, 2, 3, 4, 5).getTime())).toBe("03:04:05")
  })
})