export type ActivityKind = "meal" | "workout" | "rest"
export type ActivityStatus = "pending" | "completed" | "skipped" | "rescheduled"
export type Operation = "complete" | "skip" | "reschedule" | "undo"

export type Activity = {
  activityId: string
  planId: string
  versionId: string
  ruleId: string
  localDate: string
  timeHhmm: string | null
  kind: ActivityKind
  title: string
  sortOrder: number
  payload: {
    ingredients?: { name: string; quantity?: string | null }[]
    nutrition?: { calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }
    notes?: string | null
    image?: string | null
    exercises?: {
      exercise_id: string
      target_id: string
      name: string
      sets: { set_id: string; number: number; reps?: string | null; weight?: string | null }[]
      rest_seconds?: number | null
      duration_minutes?: number | null
      instructions?: string | null
      image?: string | null
    }[]
  }
}

export type FitnessEvent = {
  eventId: string
  targetId: string
  operation: Operation
  status?: ActivityStatus
  occurredAt: string
  notes?: string | null
  payload?: { scheduled_time?: string | null; weight?: string | null; reps?: string | null } | null
}

export const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

export function eventPayload(operation: Operation, notes: string | null): Record<string, string> {
  if (operation === "reschedule" && notes && CLOCK.test(notes)) return { scheduled_time: notes }
  return {}
}

const OPERATION_STATUS: Record<Operation, ActivityStatus> = {
  complete: "completed",
  skip: "skipped",
  reschedule: "rescheduled",
  undo: "pending",
}

export function reduceStatus(events: FitnessEvent[]): ActivityStatus {
  const ordered = [...events].sort((a, b) => (a.occurredAt + a.eventId).localeCompare(b.occurredAt + b.eventId))
  let status: ActivityStatus = "pending"
  for (const event of ordered) status = event.status ?? OPERATION_STATUS[event.operation]
  return status
}

function setIds(activity: Activity): string[] {
  return (activity.payload.exercises ?? []).flatMap((exercise) => exercise.sets.map((item) => item.set_id))
}

export function ownStatus(activity: Activity, events: FitnessEvent[]): { status: ActivityStatus; owned: boolean } {
  const grouped = new Map<string, FitnessEvent[]>()
  for (const event of events) {
    const list = grouped.get(event.targetId) ?? []
    list.push(event)
    grouped.set(event.targetId, list)
  }
  const session = grouped.get(activity.activityId) ?? []
  if (session.length) return { status: reduceStatus(session), owned: true }
  const sets = setIds(activity)
  const setEvents = sets.flatMap((id) => grouped.get(id) ?? [])
  if (activity.kind === "workout" && setEvents.length) {
    const statuses = sets.map((id) => reduceStatus(grouped.get(id) ?? []))
    if (statuses.length && statuses.every((status) => status === "completed")) return { status: "completed", owned: true }
    return { status: "pending", owned: true }
  }
  return { status: "pending", owned: false }
}

function eventClock(event: FitnessEvent): string | null {
  for (const candidate of [event.payload?.scheduled_time, event.notes]) {
    if (candidate && CLOCK.test(candidate)) return candidate
  }
  return null
}

export function scheduledTime(activity: Activity, events: FitnessEvent[], catalog: Activity[] = [activity]): string | null {
  const ids = new Set(
    catalog
      .filter((item) => item.planId === activity.planId && item.ruleId === activity.ruleId && item.localDate === activity.localDate)
      .map((item) => item.activityId),
  )
  ids.add(activity.activityId)
  const clocks: (string | null)[] = [activity.timeHhmm]
  const operations: string[] = []
  const ordered = events
    .filter((event) => ids.has(event.targetId))
    .sort((a, b) => (a.occurredAt + a.eventId).localeCompare(b.occurredAt + b.eventId))
  for (const event of ordered) {
    if (event.operation === "undo") {
      if (!operations.length) continue
      const last = operations.pop()
      if (last === "reschedule" && clocks.length > 1) clocks.pop()
      continue
    }
    if (event.operation === "reschedule") {
      const clock = eventClock(event)
      if (clock) {
        clocks.push(clock)
        operations.push("reschedule")
      } else operations.push("ignored")
      continue
    }
    operations.push(event.operation)
  }
  return clocks.at(-1) ?? null
}

export type Annotated = {
  activity: Activity
  status: ActivityStatus
  inherited: boolean
  partial: boolean
  setsTotal: number
  setsDone: number
  scheduledTime: string | null
  originalTime: string | null
}

export function annotate(activities: Activity[], events: FitnessEvent[], catalog: Activity[] = activities): Annotated[] {
  return activities.map((activity) => {
    const own = ownStatus(activity, events)
    let status = own.status
    let inherited = false
    if (!own.owned) {
      const inheritedStatus = inherit(activity, catalog, events)
      if (inheritedStatus) {
        status = inheritedStatus
        inherited = true
      }
    }
    const sets = setIds(activity)
    const setsDone = sets.filter((id) => reduceStatus(events.filter((event) => event.targetId === id)) === "completed").length
    return {
      activity,
      status,
      inherited,
      partial: activity.kind === "workout" && status === "pending" && setsDone > 0,
      setsTotal: sets.length,
      setsDone,
      scheduledTime: scheduledTime(activity, events, catalog),
      originalTime: activity.timeHhmm,
    }
  })
}

export function compareBySchedule(left: Annotated, right: Annotated): number {
  return (left.scheduledTime ?? "99:99").localeCompare(right.scheduledTime ?? "99:99") || left.activity.sortOrder - right.activity.sortOrder
}

export function calendarDayLabel(percent: number | null): string {
  return percent === null ? "استراحت" : `${percent}٪`
}

export function mediaUrl(planKey: string, image: string | null | undefined, media: ReadonlyMap<string, string>): string | undefined {
  if (!image) return undefined
  return media.get(`${planKey}/${image}`)
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"

export function persianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit)
}

export function restRemaining(startedAt: number, restSeconds: number, now = Date.now()): number {
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))
  return Math.max(0, restSeconds - elapsed)
}

export type MacroRollup = {
  available: boolean
  consumed: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
  planned: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
}

function addMacro(rows: Annotated[], key: "calories" | "protein_g" | "carbs_g" | "fat_g", completedOnly: boolean): number | null {
  let total = 0
  let seen = false
  for (const row of rows) {
    if (row.activity.kind !== "meal") continue
    if (completedOnly && row.status !== "completed") continue
    const value = row.activity.payload.nutrition?.[key]
    if (value == null) continue
    total += value
    seen = true
  }
  return seen ? total : null
}

export function nutritionRollup(rows: Annotated[]): MacroRollup {
  const planned = {
    calories: addMacro(rows, "calories", false),
    protein: addMacro(rows, "protein_g", false),
    carbs: addMacro(rows, "carbs_g", false),
    fat: addMacro(rows, "fat_g", false),
  }
  const consumed = {
    calories: addMacro(rows, "calories", true),
    protein: addMacro(rows, "protein_g", true),
    carbs: addMacro(rows, "carbs_g", true),
    fat: addMacro(rows, "fat_g", true),
  }
  return {
    available: Object.values(planned).some((value) => value != null),
    consumed,
    planned,
  }
}

export function monthCells(anchor: string): { date: string; inMonth: boolean }[] {
  const [year, month] = anchor.split("-").map(Number)
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setUTCDate(1 - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart)
    day.setUTCDate(gridStart.getUTCDate() + index)
    const date = day.toISOString().slice(0, 10)
    return { date, inMonth: day.getUTCMonth() === month - 1 }
  })
}

function inherit(activity: Activity, catalog: Activity[], events: FitnessEvent[]): ActivityStatus | null {
  const candidates: { at: string; status: ActivityStatus }[] = []
  for (const other of catalog) {
    if (other.activityId === activity.activityId) continue
    if (other.planId !== activity.planId || other.ruleId !== activity.ruleId || other.localDate !== activity.localDate) continue
    const own = ownStatus(other, events)
    if (own.owned && own.status !== "pending") {
      const at = events.filter((event) => event.targetId === other.activityId).map((event) => event.occurredAt).sort().at(-1) ?? ""
      candidates.push({ at, status: own.status })
    }
  }
  candidates.sort((a, b) => a.at.localeCompare(b.at))
  return candidates.at(-1)?.status ?? null
}

export function summarize(rows: ReturnType<typeof annotate>, start: string, end: string) {
  const chosen = rows.filter((row) => row.activity.localDate >= start && row.activity.localDate <= end && row.activity.kind !== "rest")
  const rest = rows.filter((row) => row.activity.localDate >= start && row.activity.localDate <= end && row.activity.kind === "rest")
  const completed = chosen.filter((row) => row.status === "completed").length
  const scheduled = chosen.length
  return {
    scheduled,
    completed,
    skipped: chosen.filter((row) => row.status === "skipped").length,
    rescheduled: chosen.filter((row) => row.status === "rescheduled").length,
    pending: chosen.filter((row) => row.status === "pending").length,
    partial: chosen.filter((row) => row.partial).length,
    restDays: new Set(rest.map((row) => row.activity.localDate)).size,
    percent: scheduled === 0 ? null : Math.round((1000 * completed) / scheduled) / 10,
    mealsScheduled: chosen.filter((row) => row.activity.kind === "meal").length,
    mealsCompleted: chosen.filter((row) => row.activity.kind === "meal" && row.status === "completed").length,
    workoutsScheduled: chosen.filter((row) => row.activity.kind === "workout").length,
    workoutsCompleted: chosen.filter((row) => row.activity.kind === "workout" && row.status === "completed").length,
  }
}

export function localDate(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

export function newEventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return "evt" + [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")
}
