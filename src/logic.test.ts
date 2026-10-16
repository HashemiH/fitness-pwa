import { describe, expect, it } from "vitest"
import {
  annotate,
  calendarDayLabel,
  compareBySchedule,
  eventPayload,
  mediaUrl,
  monthCells,
  nutritionRollup,
  restRemaining,
  summarize,
  type Activity,
  type FitnessEvent,
} from "./logic"

const meal: Activity = {
  activityId: "plan/v1/breakfast/2026-10-16",
  planId: "plan",
  versionId: "v1",
  ruleId: "breakfast",
  localDate: "2026-10-16",
  timeHhmm: "08:00",
  kind: "meal",
  title: "صبحانه",
  sortOrder: 0,
  payload: { ingredients: [], nutrition: {} },
}

const lunch: Activity = {
  ...meal,
  activityId: "plan/v1/lunch/2026-10-16",
  ruleId: "lunch",
  timeHhmm: "13:30",
  title: "ناهار",
  sortOrder: 1,
}

function event(
  id: string,
  operation: FitnessEvent["operation"],
  at: string,
  targetId = meal.activityId,
  extra: Partial<FitnessEvent> = {},
): FitnessEvent {
  return { eventId: id, targetId, operation, occurredAt: at, ...extra }
}

const workout: Activity = {
  activityId: "plan/v1/upper/2026-10-16",
  planId: "plan",
  versionId: "v1",
  ruleId: "upper",
  localDate: "2026-10-16",
  timeHhmm: "18:00",
  kind: "workout",
  title: "بالاتنه",
  sortOrder: 2,
  payload: {
    exercises: [
      {
        exercise_id: "pushup",
        target_id: "plan/v1/upper/2026-10-16/ex/pushup",
        name: "شنا",
        sets: [1, 2, 3].map((number) => ({
          set_id: `plan/v1/upper/2026-10-16/set/pushup/${number}`,
          number,
          reps: "10",
        })),
        rest_seconds: 60,
        image: "media/pushup.png",
      },
    ],
  },
}

describe("completion replay", () => {
  it("counts one completion when the same meal is tapped twice and drops it after undo", () => {
    const once = annotate([meal], [event("evt-00000001", "complete", "2026-10-16T05:00:00Z"), event("evt-00000002", "complete", "2026-10-16T05:05:00Z")])
    expect(summarize(once, "2026-10-16", "2026-10-16").completed).toBe(1)
    const undone = annotate([meal], [event("evt-00000001", "complete", "2026-10-16T05:00:00Z"), event("evt-00000003", "undo", "2026-10-16T06:00:00Z")])
    expect(summarize(undone, "2026-10-16", "2026-10-16").completed).toBe(0)
    expect(summarize(undone, "2026-10-16", "2026-10-16").percent).toBe(0)
  })

  it("keeps a skip out of the completion percent", () => {
    const rows = annotate([meal], [event("evt-skip-0001", "skip", "2026-10-16T05:00:00Z")])
    const summary = summarize(rows, "2026-10-16", "2026-10-16")
    expect(rows[0].status).toBe("skipped")
    expect(summary.skipped).toBe(1)
    expect(summary.completed).toBe(0)
    expect(summary.percent).toBe(0)
  })

  it("does not complete a workout from one set and does complete it when every set is done", () => {
    const first = workout.payload.exercises![0].sets[0].set_id
    const partial = annotate([workout], [event("evt-set-000001", "complete", "2026-10-16T05:00:00Z", first)])
    expect(partial[0].status).toBe("pending")
    expect(partial[0].partial).toBe(true)
    expect(partial[0].setsDone).toBe(1)
    expect(summarize(partial, "2026-10-16", "2026-10-16").percent).toBe(0)
    const all = annotate(
      [workout],
      workout.payload.exercises![0].sets.map((item, index) =>
        event(`evt-set-00000${index + 1}`, "complete", `2026-10-16T05:0${index}:00Z`, item.set_id),
      ),
    )
    expect(all[0].status).toBe("completed")
    expect(all[0].partial).toBe(false)
    expect(summarize(all, "2026-10-16", "2026-10-16").workoutsCompleted).toBe(1)
    const undone = annotate(
      [workout],
      [
        event("evt-set-000001", "complete", "2026-10-16T05:00:00Z", first),
        event("evt-set-undo01", "undo", "2026-10-16T05:10:00Z", first),
      ],
    )
    expect(undone[0].setsDone).toBe(0)
    expect(undone[0].partial).toBe(false)
  })

  it("moves the displayed clock, reorders the day, and restores it on undo", () => {
    const moved = annotate(
      [meal, lunch],
      [event("evt-move-0001", "reschedule", "2026-10-16T05:00:00Z", meal.activityId, { notes: "19:00", payload: { scheduled_time: "19:00" } })],
    ).sort(compareBySchedule)
    expect(moved.map((row) => row.activity.title)).toEqual(["ناهار", "صبحانه"])
    expect(moved[1].scheduledTime).toBe("19:00")
    expect(moved[1].originalTime).toBe("08:00")
    expect(moved[1].status).toBe("rescheduled")
    expect(eventPayload("reschedule", "19:00")).toEqual({ scheduled_time: "19:00" })
    const back = annotate([meal, lunch], [
      event("evt-move-0001", "reschedule", "2026-10-16T05:00:00Z", meal.activityId, { notes: "19:00" }),
      event("evt-undo-0001", "undo", "2026-10-16T06:00:00Z"),
    ]).sort(compareBySchedule)
    expect(back.map((row) => row.activity.title)).toEqual(["صبحانه", "ناهار"])
    expect(back[0].scheduledTime).toBe("08:00")
    expect(back[0].status).toBe("pending")
  })

  it("keeps the moved clock after the meal is completed", () => {
    const rows = annotate([meal], [
      event("evt-move-0001", "reschedule", "2026-10-16T05:00:00Z", meal.activityId, { payload: { scheduled_time: "09:30" } }),
      event("evt-done-0001", "complete", "2026-10-16T06:00:00Z"),
    ])
    expect(rows[0].status).toBe("completed")
    expect(rows[0].scheduledTime).toBe("09:30")
  })

  it("ignores a clock that is not HH:MM", () => {
    const rows = annotate([meal], [event("evt-move-0001", "reschedule", "2026-10-16T05:00:00Z", meal.activityId, { notes: "9:30" })])
    expect(rows[0].scheduledTime).toBe("08:00")
    expect(eventPayload("reschedule", "9:30")).toEqual({})
  })

  it("inherits a reschedule onto a newer plan version", () => {
    const next: Activity = { ...meal, activityId: "plan/v2/breakfast/2026-10-16", versionId: "v2", timeHhmm: "08:15" }
    const rows = annotate(
      [next],
      [event("evt-move-0001", "reschedule", "2026-10-16T05:00:00Z", meal.activityId, { payload: { scheduled_time: "10:00" } })],
      [meal, next],
    )
    expect(rows[0].inherited).toBe(true)
    expect(rows[0].status).toBe("rescheduled")
    expect(rows[0].scheduledTime).toBe("10:00")
    expect(rows[0].originalTime).toBe("08:15")
    expect(meal.timeHhmm).toBe("08:00")
  })

  it("labels a calendar day from the same percent the progress page uses", () => {
    const rest: Activity = { ...meal, activityId: "plan/v1/rest/2026-10-17", ruleId: "rest", localDate: "2026-10-17", timeHhmm: null, kind: "rest", title: "استراحت", sortOrder: 0 }
    const rows = annotate([meal, rest], [event("evt-00000001", "complete", "2026-10-16T05:00:00Z")])
    expect(calendarDayLabel(summarize(rows, "2026-10-16", "2026-10-16").percent)).toBe("100٪")
    expect(calendarDayLabel(summarize(rows, "2026-10-17", "2026-10-17").percent)).toBe("استراحت")
    expect(summarize(rows, "2026-10-16", "2026-10-17").scheduled).toBe(1)
  })

  it("does not invent nutrition totals when meals have no macros", () => {
    const rows = annotate([meal, lunch], [])
    const rollup = nutritionRollup(rows)
    expect(rollup.available).toBe(false)
    expect(rollup.planned.calories).toBeNull()
    expect(rollup.consumed.protein).toBeNull()
  })

  it("sums only the macros that are actually stored", () => {
    const counted: Activity = { ...meal, payload: { ingredients: [], nutrition: { calories: 400, protein_g: 30 } } }
    const rows = annotate([counted, lunch], [event("evt-00000001", "complete", "2026-10-16T05:00:00Z", counted.activityId)])
    const rollup = nutritionRollup(rows)
    expect(rollup.available).toBe(true)
    expect(rollup.planned.calories).toBe(400)
    expect(rollup.consumed.calories).toBe(400)
    expect(rollup.planned.protein).toBe(30)
    expect(rollup.planned.carbs).toBeNull()
    expect(rollup.consumed.carbs).toBeNull()
  })

  it("computes rest from timestamps so a paused phone does not drift the clock", () => {
    expect(restRemaining(1_000, 90, 1_000)).toBe(90)
    expect(restRemaining(1_000, 90, 31_000)).toBe(60)
    expect(restRemaining(1_000, 90, 200_000)).toBe(0)
  })

  it("starts the month grid on Monday", () => {
    const cells = monthCells("2026-10-16")
    expect(cells).toHaveLength(42)
    expect(cells[0].date).toBe("2026-09-28")
    expect(cells.find((cell) => cell.date === "2026-10-01")?.inMonth).toBe(true)
    expect(cells[0].inMonth).toBe(false)
  })

  it("does not invent an image url when the plan or the media store has none", () => {
    const media = new Map<string, string>([["plan/v1/media/pushup.png", "blob:pushup"]])
    expect(mediaUrl("plan/v1", "media/pushup.png", media)).toBe("blob:pushup")
    expect(mediaUrl("plan/v1", null, media)).toBeUndefined()
    expect(mediaUrl("plan/v1", "media/missing.png", media)).toBeUndefined()
  })
})
