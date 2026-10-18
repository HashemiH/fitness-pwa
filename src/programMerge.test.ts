import { describe, expect, it } from "vitest"
import type { Activity } from "./logic"
import { mergeProgram, type IncomingActivity } from "./programMerge"

function activity(id: string, time: string, title = "ناهار"): Activity {
  return {
    activityId: id,
    planId: "plan",
    versionId: "v1",
    ruleId: "lunch",
    localDate: "2026-10-21",
    timeHhmm: time,
    kind: "meal",
    title,
    sortOrder: 1,
    payload: {},
  }
}

function incoming(id: string, time: string, title = "ناهار"): IncomingActivity {
  return {
    activity_id: id,
    plan_id: "plan",
    version_id: "v1",
    rule_id: "lunch",
    local_date: "2026-10-21",
    time_hhmm: time,
    kind: "meal",
    title,
    sort_order: 1,
    payload: {},
  }
}

describe("program merge", () => {
  it("updates a future meal time and keeps a completed meal unchanged", () => {
    const done = activity("done", "13:00")
    const future = activity("future", "13:00")
    const result = mergeProgram(
      [done, future],
      [{ targetId: "done" }],
      [incoming("done", "13:30"), incoming("future", "13:30")],
    )
    expect(result.activities.find((item) => item.activityId === "done")?.timeHhmm).toBe("13:00")
    expect(result.activities.find((item) => item.activityId === "future")?.timeHhmm).toBe("13:30")
    expect(result.conflicts.map((item) => item.activityId)).toEqual(["done"])
  })

  it("drops a future meal and keeps a removed meal that already has a completion", () => {
    const done = activity("done", "13:00", "میان‌وعده")
    const future = activity("future", "16:00", "میان‌وعده")
    const result = mergeProgram([done, future], [{ targetId: "done" }], [])
    expect(result.activities.map((item) => item.activityId)).toEqual(["done"])
    expect(result.conflicts).toHaveLength(1)
  })

  it("replaces an exercise image when that workout has no execution record", () => {
    const workout = activity("upper", "18:00", "بالاتنه")
    workout.kind = "workout"
    workout.payload = { exercises: [{ exercise_id: "press", target_id: "upper/press", name: "پرس", sets: [], image: "media/old.png" }] }
    const update = incoming("upper", "18:00", "بالاتنه")
    update.kind = "workout"
    update.payload = { exercises: [{ exercise_id: "press", target_id: "upper/press", name: "پرس", sets: [], image: "media/new.png" }] }
    const result = mergeProgram([workout], [], [update])
    expect(result.conflicts).toEqual([])
    expect(result.activities[0].payload.exercises?.[0].image).toBe("media/new.png")
  })
})
