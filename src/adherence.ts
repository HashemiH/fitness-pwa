import {
  fromJalali,
  reduceStatus,
  toJalali,
  type Annotated,
  type FitnessEvent,
} from "./logic"

export type ReportSpan = "day" | "week" | "month"

export type Ratio = {
  completed: number
  eligible: number
  percent: number | null
}

export type DayPoint = {
  date: string
  percent: number | null
  eligible: number
  completed: number
}

export type MealCategory = Ratio & { category: string }

export type SetRecord = {
  name: string
  reps: string | null
  weight: string | null
  duration: string | null
}

export type WorkoutAggregate = {
  sessions: Ratio
  partial: number
  skipped: number
  pending: number
  setsScheduled: number
  setsCompleted: number
  setPercent: number | null
  records: SetRecord[]
}

export type PeriodDelta = {
  points: number
  direction: "up" | "down" | "flat"
}

const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]

export function weekdayName(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()] ?? ""
}

export function shiftIso(day: string, amount: number): string {
  const value = new Date(`${day}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

export function saturdayWeek(day: string): string[] {
  const date = new Date(`${day}T12:00:00Z`)
  const offset = (date.getUTCDay() + 1) % 7
  const start = shiftIso(day, -offset)
  return Array.from({ length: 7 }, (_, index) => shiftIso(start, index))
}

export function jalaliMonthDays(day: string): string[] {
  const { year, month } = toJalali(day)
  const start = fromJalali(year, month, 1)
  let end = start
  for (let cursor = 31; cursor >= 1; cursor -= 1) {
    const iso = fromJalali(year, month, cursor)
    const back = toJalali(iso)
    if (back.year === year && back.month === month && back.day === cursor) {
      end = iso
      break
    }
  }
  const days: string[] = []
  for (let cursor = start; cursor <= end; cursor = shiftIso(cursor, 1)) days.push(cursor)
  return days
}

export function periodDays(span: ReportSpan, today: string): string[] {
  if (span === "day") return [today]
  if (span === "week") return saturdayWeek(today)
  return jalaliMonthDays(today)
}

export function previousAnchor(span: ReportSpan, today: string): string {
  if (span === "day") return shiftIso(today, -1)
  if (span === "week") return shiftIso(saturdayWeek(today)[0], -1)
  const days = jalaliMonthDays(today)
  return shiftIso(days[0], -1)
}

export function ratio(completed: number, eligible: number): Ratio {
  if (eligible <= 0) return { completed: 0, eligible: 0, percent: null }
  return { completed, eligible, percent: Math.round((100 * completed) / eligible) }
}

export function isDue(row: Annotated, asOfDate: string, asOfClock: string | null): boolean {
  if (row.activity.kind === "rest") return false
  if (row.activity.localDate < asOfDate) return true
  if (row.activity.localDate > asOfDate) return false
  if (!asOfClock || !row.scheduledTime) return true
  return row.scheduledTime <= asOfClock
}

export function getEligibleActivities(rows: Annotated[], start: string, end: string, asOfDate: string, asOfClock: string | null): Annotated[] {
  return rows.filter(
    (row) => row.activity.localDate >= start && row.activity.localDate <= end && isDue(row, asOfDate, asOfClock),
  )
}

export function calculateNutritionAdherence(rows: Annotated[]): Ratio {
  const meals = rows.filter((row) => row.activity.kind === "meal")
  return ratio(meals.filter((row) => row.status === "completed").length, meals.length)
}

export function calculateWorkoutAdherence(rows: Annotated[]): Ratio {
  const sessions = rows.filter((row) => row.activity.kind === "workout")
  return ratio(sessions.filter((row) => row.status === "completed").length, sessions.length)
}

export function calculateOverallAdherence(rows: Annotated[]): Ratio {
  return ratio(rows.filter((row) => row.status === "completed").length, rows.length)
}

export function calculateDailyTrend(rows: Annotated[], days: string[], asOfDate: string, asOfClock: string | null): DayPoint[] {
  return days.map((date) => {
    const eligible = getEligibleActivities(rows, date, date, asOfDate, asOfClock)
    const overall = calculateOverallAdherence(eligible)
    return { date, percent: overall.percent, eligible: overall.eligible, completed: overall.completed }
  })
}

export function compareReportingPeriods(current: number | null, previous: number | null): PeriodDelta | null {
  if (current == null || previous == null) return null
  const points = current - previous
  return { points, direction: points > 0 ? "up" : points < 0 ? "down" : "flat" }
}

export function findBestAndWorstDays(points: DayPoint[]): { best: DayPoint | null; worst: DayPoint | null } {
  const eligible = points.filter((point) => point.eligible > 0 && point.percent != null)
  if (!eligible.length) return { best: null, worst: null }
  const ordered = [...eligible].sort((left, right) => left.date.localeCompare(right.date))
  let best = ordered[0]
  let worst = ordered[ordered.length - 1]
  for (const point of ordered) {
    if ((point.percent ?? 0) > (best.percent ?? 0) || ((point.percent ?? 0) === (best.percent ?? 0) && point.date < best.date)) best = point
    if ((point.percent ?? 0) < (worst.percent ?? 0) || ((point.percent ?? 0) === (worst.percent ?? 0) && point.date > worst.date)) worst = point
  }
  if (eligible.length < 2) return { best, worst: null }
  return { best, worst }
}

export function mealCategory(title: string): string {
  const name = title.trim()
  if (name.includes("خواب")) return "قبل خواب"
  if (name.includes("شام") || name.includes("بعد تمرین")) return "شام"
  if (name.includes("قبل تمرین") || name.includes("باشگاه")) return "قبل تمرین"
  if (name.includes("عصر")) return "میان‌وعده عصر"
  if (name.includes("ناهار") || name.includes("ظهر")) return "ناهار"
  if (name.includes("میان‌وعده صبح")) return "میان‌وعده صبح"
  if (name.includes("صبح") || name.includes("ناشتا")) return "صبحانه"
  return name || "وعده"
}

const CATEGORY_ORDER = ["صبحانه", "میان‌وعده صبح", "ناهار", "میان‌وعده عصر", "قبل تمرین", "شام", "قبل خواب"]

export function aggregateMealCategories(rows: Annotated[]): MealCategory[] {
  const groups = new Map<string, Annotated[]>()
  for (const row of rows) {
    if (row.activity.kind !== "meal") continue
    const category = mealCategory(row.activity.title)
    const list = groups.get(category) ?? []
    list.push(row)
    groups.set(category, list)
  }
  return [...groups.entries()]
    .map(([category, items]) => ({ category, ...calculateNutritionAdherence(items) }))
    .sort((left, right) => {
      const leftIndex = CATEGORY_ORDER.indexOf(left.category)
      const rightIndex = CATEGORY_ORDER.indexOf(right.category)
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex) || left.category.localeCompare(right.category, "fa")
    })
}

export function aggregateWorkoutSets(rows: Annotated[], events: FitnessEvent[]): WorkoutAggregate {
  const sessions = rows.filter((row) => row.activity.kind === "workout")
  let setsScheduled = 0
  let setsCompleted = 0
  const records: SetRecord[] = []
  for (const row of sessions) {
    for (const exercise of row.activity.payload.exercises ?? []) {
      setsScheduled += exercise.sets.length
      for (const set of exercise.sets) {
        const related = events.filter((event) => event.targetId === set.set_id)
        if (reduceStatus(related) !== "completed") continue
        setsCompleted += 1
        const logged = [...related]
          .filter((event) => event.operation === "complete")
          .sort((left, right) => (left.occurredAt + left.eventId).localeCompare(right.occurredAt + right.eventId))
          .at(-1)
        const weight = logged?.payload?.weight ?? null
        const reps = logged?.payload?.reps ?? null
        const duration = logged?.payload?.duration ?? null
        if (weight || reps || duration) records.push({ name: exercise.name, reps, weight, duration })
      }
    }
  }
  return {
    sessions: calculateWorkoutAdherence(sessions),
    partial: sessions.filter((row) => row.partial).length,
    skipped: sessions.filter((row) => row.status === "skipped").length,
    pending: sessions.filter((row) => row.status === "pending" && !row.partial).length,
    setsScheduled,
    setsCompleted,
    setPercent: setsScheduled === 0 ? null : Math.round((100 * setsCompleted) / setsScheduled),
    records,
  }
}

export function zoneClock(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00"
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00"
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
}
