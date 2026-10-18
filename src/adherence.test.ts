import { describe, expect, it } from "vitest"
import {
  aggregateMealCategories,
  aggregateWorkoutSets,
  calculateDailyTrend,
  calculateNutritionAdherence,
  calculateOverallAdherence,
  calculateWorkoutAdherence,
  compareReportingPeriods,
  findBestAndWorstDays,
  getEligibleActivities,
  jalaliMonthDays,
  mealCategory,
  periodDays,
  previousAnchor,
  saturdayWeek,
} from "./adherence"
import { annotate, toJalali, type Activity, type FitnessEvent } from "./logic"

function meal(date: string, title: string, time = "08:00", id = `${title}/${date}`): Activity {
  return {
    activityId: id,
    planId: "plan",
    versionId: "v1",
    ruleId: id,
    localDate: date,
    timeHhmm: time,
    kind: "meal",
    title,
    sortOrder: 0,
    payload: { ingredients: [], nutrition: {} },
  }
}

function rest(date: string): Activity {
  return { ...meal(date, "استراحت", null as unknown as string, `rest/${date}`), kind: "rest", timeHhmm: null, title: "استراحت" }
}

function workout(date: string): Activity {
  return {
    ...meal(date, "بالاتنه", "19:30", `workout/${date}`),
    kind: "workout",
    title: "بالاتنه",
    payload: {
      exercises: [
        {
          exercise_id: "push",
          target_id: `workout/${date}/ex`,
          name: "شنا",
          sets: [1, 2].map((number) => ({ set_id: `workout/${date}/set/${number}`, number, reps: "10" })),
        },
      ],
    },
  }
}

function event(id: string, operation: FitnessEvent["operation"], targetId: string, extra: Partial<FitnessEvent> = {}): FitnessEvent {
  return { eventId: id, targetId, operation, occurredAt: `2026-10-18T0${id.length}:00:00Z`, ...extra }
}

describe("adherence periods", () => {
  it("starts the week on Saturday and keeps Jalali month edges", () => {
    expect(saturdayWeek("2026-10-18")).toEqual([
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ])
    const mehr = jalaliMonthDays("2026-10-18")
    expect(toJalali(mehr[0])).toMatchObject({ month: 7, day: 1 })
    expect(toJalali(mehr[mehr.length - 1])).toMatchObject({ month: 7, day: 30 })
    expect(mehr).not.toContain("2026-10-23")
    expect(periodDays("day", "2026-10-18")).toEqual(["2026-10-18"])
    expect(previousAnchor("week", "2026-10-18")).toBe("2026-10-16")
  })
})

describe("adherence math", () => {
  const today = "2026-10-18"
  const breakfast = meal(today, "صبحانه", "07:15")
  const lunch = meal(today, "ناهار", "13:00", "lunch")
  const future = meal("2026-10-23", "شام", "21:00", "future-dinner")
  const saturday = meal("2026-10-17", "صبحانه", "07:15", "sat-breakfast")
  const session = workout(today)
  const restDay = rest("2026-10-20")

  it("excludes future meals, later clocks, and rest, and keeps a skipped meal in the denominator", () => {
    const rows = annotate(
      [breakfast, lunch, future, saturday, restDay],
      [event("1", "complete", saturday.activityId), event("2", "skip", breakfast.activityId)],
    )
    const due = getEligibleActivities(rows, "2026-10-17", "2026-10-23", today, "09:00")
    expect(due.map((row) => row.activity.activityId).sort()).toEqual([breakfast.activityId, saturday.activityId].sort())
    const nutrition = calculateNutritionAdherence(due)
    expect(nutrition).toEqual({ completed: 1, eligible: 2, percent: 50 })
    expect(calculateOverallAdherence([])).toEqual({ completed: 0, eligible: 0, percent: null })
  })

  it("counts a rescheduled meal once and only completes a workout when its own sets are logged", () => {
    const moved = annotate(
      [breakfast],
      [
        event("1", "reschedule", breakfast.activityId, { payload: { scheduled_time: "09:45" } }),
        event("2", "complete", breakfast.activityId),
      ],
    )
    expect(moved).toHaveLength(1)
    expect(calculateNutritionAdherence(getEligibleActivities(moved, today, today, today, "10:00")).percent).toBe(100)

    const partial = annotate([session], [event("3", "complete", session.payload.exercises![0].sets[0].set_id, { payload: { reps: "8", weight: "20" } })])
    expect(calculateWorkoutAdherence(partial).percent).toBe(0)
    expect(partial[0].partial).toBe(true)
    const sets = aggregateWorkoutSets(partial, partial.flatMap(() => [event("3", "complete", session.payload.exercises![0].sets[0].set_id, { payload: { reps: "8", weight: "20" } })]))
    expect(sets.setsScheduled).toBe(2)
    expect(sets.setsCompleted).toBe(1)
    expect(sets.setPercent).toBe(50)
    expect(sets.partial).toBe(1)
    expect(sets.pending).toBe(0)
    expect(sets.records).toEqual([{ name: "شنا", reps: "8", weight: "20", duration: null }])
    expect(calculateOverallAdherence(partial).eligible).toBe(1)

    const done = annotate(
      [session],
      session.payload.exercises![0].sets.map((item, index) => event(String(index + 4), "complete", item.set_id)),
    )
    expect(calculateWorkoutAdherence(done)).toEqual({ completed: 1, eligible: 1, percent: 100 })
  })

  it("does not invent a comparison or a worst day without enough real days", () => {
    expect(compareReportingPeriods(82, 70)).toEqual({ points: 12, direction: "up" })
    expect(compareReportingPeriods(70, 82)).toEqual({ points: -12, direction: "down" })
    expect(compareReportingPeriods(80, null)).toBeNull()
    const trend = calculateDailyTrend(
      annotate([saturday, meal(today, "صبحانه", "07:00", "sun")], [event("9", "complete", saturday.activityId)]),
      periodDays("week", today),
      today,
      "12:00",
    )
    const ends = findBestAndWorstDays(trend)
    expect(ends.best?.date).toBe("2026-10-17")
    expect(ends.worst?.date).toBe(today)
    expect(findBestAndWorstDays([{ date: today, percent: 100, eligible: 1, completed: 1 }]).worst).toBeNull()
    expect(trend.filter((point) => point.date > today).every((point) => point.percent == null)).toBe(true)
  })

  it("groups renamed meals without requiring seven meals a day", () => {
    expect(mealCategory("میان‌وعده صبح")).toBe("میان‌وعده صبح")
    expect(mealCategory("پیش از خواب")).toBe("قبل خواب")
    expect(mealCategory("میان‌وعدهٔ خاص")).toBe("میان‌وعدهٔ خاص")
    const rows = annotate(
      [meal(today, "قبل تمرین", "18:15", "pre"), meal(today, "میان‌وعدهٔ خاص", "16:00", "custom")],
      [event("8", "complete", "pre")],
    )
    const groups = aggregateMealCategories(getEligibleActivities(rows, today, today, today, "19:00"))
    expect(groups.map((item) => item.category)).toEqual(["قبل تمرین", "میان‌وعدهٔ خاص"])
    expect(groups[0].percent).toBe(100)
    expect(groups[1].percent).toBe(0)
  })

  it("leaves the input rows unchanged", () => {
    const rows = annotate([breakfast], [])
    const before = JSON.stringify(rows)
    calculateDailyTrend(rows, [today], today, "12:00")
    expect(JSON.stringify(rows)).toBe(before)
  })
})
