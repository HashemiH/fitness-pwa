import type { Activity } from "./logic"

export type IncomingActivity = {
  activity_id: string
  plan_id: string
  version_id: string
  rule_id: string
  local_date: string
  time_hhmm: string | null
  kind: Activity["kind"]
  title: string
  sort_order: number
  payload: Activity["payload"]
}

export type MergeResult = {
  activities: Activity[]
  conflicts: { activityId: string; reason: string }[]
}

function toActivity(item: IncomingActivity): Activity {
  return {
    activityId: item.activity_id,
    planId: item.plan_id,
    versionId: item.version_id,
    ruleId: item.rule_id,
    localDate: item.local_date,
    timeHhmm: item.time_hhmm,
    kind: item.kind,
    title: item.title,
    sortOrder: item.sort_order,
    payload: item.payload ?? {},
  }
}

function same(left: Activity, right: Activity): boolean {
  return left.timeHhmm === right.timeHhmm && left.title === right.title && left.kind === right.kind && JSON.stringify(left.payload) === JSON.stringify(right.payload)
}

function protectedBy(activityId: string, events: { targetId: string }[]): boolean {
  return events.some((event) => event.targetId === activityId || event.targetId.startsWith(`${activityId}/`))
}

export function mergeProgram(current: Activity[], events: { targetId: string }[], incoming: IncomingActivity[]): MergeResult {
  const next: Activity[] = []
  const conflicts: MergeResult["conflicts"] = []
  const currentById = new Map(current.map((item) => [item.activityId, item]))
  const seen = new Set<string>()
  for (const item of incoming) {
    const proposed = toActivity(item)
    const existing = currentById.get(proposed.activityId)
    seen.add(proposed.activityId)
    if (existing && protectedBy(existing.activityId, events) && !same(existing, proposed)) {
      next.push(existing)
      conflicts.push({ activityId: existing.activityId, reason: "history_kept" })
      continue
    }
    next.push(proposed)
  }
  for (const item of current) {
    if (seen.has(item.activityId)) continue
    if (protectedBy(item.activityId, events)) {
      next.push(item)
      conflicts.push({ activityId: item.activityId, reason: "history_kept" })
    }
  }
  return { activities: next, conflicts }
}
