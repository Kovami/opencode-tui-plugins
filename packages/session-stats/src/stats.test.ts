import { describe, expect, test } from "vitest"
import { computeStats, dayStart, readSteps } from "./stats"

describe("readSteps", () => {
  test("reads the data envelope and the bare shape", () => {
    expect(readSteps({ data: { steps: 12 } })).toBe(12)
    expect(readSteps({ steps: 12 })).toBe(12)
  })

  test("returns zero for missing or malformed values", () => {
    expect(readSteps({})).toBe(0)
    expect(readSteps(null)).toBe(0)
    expect(readSteps({ data: { steps: "12" } })).toBe(0)
  })

  test("returns zero for invalid numbers", () => {
    expect(readSteps({ data: { steps: Number.NaN } })).toBe(0)
    expect(readSteps({ data: { steps: -3 } })).toBe(0)
    expect(readSteps({ data: { steps: Number.POSITIVE_INFINITY } })).toBe(0)
  })
})

describe("dayStart", () => {
  test("returns local midnight for the given instant", () => {
    const now = new Date(2026, 0, 15, 12, 30, 0, 0).getTime()
    expect(dayStart(now)).toBe(new Date(2026, 0, 15, 0, 0, 0, 0).getTime())
  })
})

describe("computeStats", () => {
  const noon = new Date(2026, 0, 15, 12, 0, 0, 0).getTime()

  test("counts requests and divides by elapsed hours", () => {
    expect(computeStats(120, noon)).toEqual({ total: 120, perHour: 10 })
  })

  test("does not divide by zero at midnight", () => {
    expect(computeStats(5, dayStart(noon))).toEqual({ total: 5, perHour: 0 })
  })

  test("normalizes invalid counts", () => {
    expect(computeStats(-4, noon)).toEqual({ total: 0, perHour: 0 })
    expect(computeStats(Number.NaN, noon)).toEqual({ total: 0, perHour: 0 })
  })
})