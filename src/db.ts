import Dexie, { type EntityTable } from "dexie"
import JSZip from "jszip"
import { z } from "zod"
import { eventPayload, type Activity, type FitnessEvent, type Operation } from "./logic"

function blobFromBytes(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer])
}

export type StoredEvent = FitnessEvent & {
  planId: string
  versionId: string
  notes: string | null
  schemaVersion: 1
}

type PlanRow = {
  key: string
  planId: string
  versionId: string
  title: string
  timezone: string
  startDate: string
  endDate: string
  document: unknown
}

type MediaRow = { path: string; planKey: string; blob: Blob; mime: string }

const db = new Dexie("fitness-pwa") as Dexie & {
  plans: EntityTable<PlanRow, "key">
  activities: EntityTable<Activity, "activityId">
  events: EntityTable<StoredEvent, "eventId">
  media: EntityTable<MediaRow, "path">
  meta: EntityTable<{ key: string; value: string }, "key">
}

db.version(1).stores({
  plans: "key, planId",
  activities: "activityId, planId, localDate",
  events: "eventId, targetId, planId",
  media: "path, planKey",
  meta: "key",
})

const manifestSchema = z.object({
  schema_version: z.literal(1),
  kind: z.literal("plan_package"),
  plan_id: z.string(),
  version_id: z.string(),
  files: z.array(z.object({ path: z.string(), sha256: z.string(), bytes: z.number() })),
})

const activitySchema = z.object({
  activity_id: z.string(),
  plan_id: z.string(),
  version_id: z.string(),
  rule_id: z.string(),
  local_date: z.string(),
  time_hhmm: z.string().nullable(),
  kind: z.enum(["meal", "workout", "rest"]),
  title: z.string(),
  sort_order: z.number(),
  payload: z.record(z.any()),
})

export async function deviceId(): Promise<string> {
  const existing = await db.meta.get("device_id")
  if (existing) return existing.value
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const value = "ios" + [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("")
  await db.meta.put({ key: "device_id", value })
  return value
}

export async function activePlan(): Promise<PlanRow | undefined> {
  const marker = await db.meta.get("active_plan")
  if (!marker) return undefined
  return db.plans.get(marker.value)
}

export async function loadState() {
  const plan = await activePlan()
  if (!plan) return { plan: undefined, activities: [] as Activity[], events: [] as StoredEvent[], media: new Map<string, string>() }
  const activities = await db.activities.where("planId").equals(plan.planId).toArray()
  const events = await db.events.where("planId").equals(plan.planId).toArray()
  const mediaRows = await db.media.where("planKey").equals(plan.key).toArray()
  const media = new Map(mediaRows.map((row) => [row.path, URL.createObjectURL(row.blob)]))
  return { plan, activities, events, media }
}

let pendingPlan: {
  key: string
  plan: { plan_id: string; version_id: string; title: string; timezone: string; start_date: string; end_date: string }
  activities: Activity[]
  media: { path: string; bytes: Uint8Array }[]
} | null = null

export async function inspectPlanZip(file: File): Promise<{ title: string; start: string; end: string; meals: number; workouts: number; images: number }> {
  pendingPlan = null
  const estimate = await globalThis.navigator?.storage?.estimate?.()
  if (estimate?.quota != null && estimate.usage != null && file.size > estimate.quota - estimate.usage) {
    pendingPlan = null
    throw new Error("فضای مرورگر برای این بسته کافی نیست. هیچ چیزی نوشته نشد.")
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const manifestFile = zip.file("manifest.json")
  const planFile = zip.file("plan.json")
  const scheduleFile = zip.file("schedule.json")
  if (!manifestFile || !planFile || !scheduleFile) {
    pendingPlan = null
    throw new Error("بسته برنامه ناقص است. هیچ چیزی نوشته نشد.")
  }
  const manifest = manifestSchema.parse(JSON.parse(await manifestFile.async("string")))
  for (const entry of manifest.files) {
    const packed = zip.file(entry.path)
    if (!packed) throw new Error(`فایل ${entry.path} در بسته نیست.`)
    const bytes = await packed.async("uint8array")
    if (bytes.byteLength !== entry.bytes) throw new Error(`اندازه ${entry.path} با فهرست یکی نیست.`)
    const digest = await sha256(bytes)
    if (digest !== entry.sha256) {
      pendingPlan = null
      throw new Error(`چک‌سام ${entry.path} یکی نیست. هیچ چیزی ذخیره نشد.`)
    }
  }
  const plan = z
    .object({
      schema_version: z.literal(1),
      plan_id: z.string(),
      title: z.string(),
      version_id: z.string(),
      timezone: z.string(),
      start_date: z.string(),
      end_date: z.string(),
    })
    .parse(JSON.parse(await planFile.async("string")))
  const schedule = z.array(activitySchema).parse(JSON.parse(await scheduleFile.async("string")))
  const activities: Activity[] = schedule.map((item) => ({
    activityId: item.activity_id,
    planId: item.plan_id,
    versionId: item.version_id,
    ruleId: item.rule_id,
    localDate: item.local_date,
    timeHhmm: item.time_hhmm,
    kind: item.kind,
    title: item.title,
    sortOrder: item.sort_order,
    payload: item.payload,
  }))
  const referenced = new Set<string>()
  for (const activity of activities) {
    if (activity.payload.image) referenced.add(String(activity.payload.image))
    for (const exercise of activity.payload.exercises ?? []) {
      if (exercise.image) referenced.add(String(exercise.image))
    }
  }
  const media: { path: string; bytes: Uint8Array }[] = []
  for (const path of referenced) {
    const packed = zip.file(path)
    if (!packed) {
      pendingPlan = null
      throw new Error(`تصویر ${path} در بسته نیست. هیچ چیزی نوشته نشد.`)
    }
    media.push({ path, bytes: await packed.async("uint8array") })
  }
  pendingPlan = { key: `${plan.plan_id}/${plan.version_id}`, plan, activities, media }
  return {
    title: plan.title,
    start: plan.start_date,
    end: plan.end_date,
    meals: activities.filter((item) => item.kind === "meal").length,
    workouts: activities.filter((item) => item.kind === "workout").length,
    images: media.length,
  }
}

export async function confirmPendingPlan(): Promise<string> {
  const pending = pendingPlan
  if (!pending) throw new Error("بسته‌ای برای تأیید نیست.")
  await db.transaction("rw", db.plans, db.activities, db.media, db.meta, async () => {
    await db.plans.put({
      key: pending.key,
      planId: pending.plan.plan_id,
      versionId: pending.plan.version_id,
      title: pending.plan.title,
      timezone: pending.plan.timezone,
      startDate: pending.plan.start_date,
      endDate: pending.plan.end_date,
      document: pending.plan,
    })
    await db.activities.where("planId").equals(pending.plan.plan_id).and((row) => row.versionId === pending.plan.version_id).delete()
    if (pending.activities.length) await db.activities.bulkAdd(pending.activities)
    await db.media.where("planKey").equals(pending.key).delete()
    for (const item of pending.media) {
      await db.media.put({ path: `${pending.key}/${item.path}`, planKey: pending.key, blob: blobFromBytes(item.bytes), mime: "application/octet-stream" })
    }
    await db.meta.put({ key: "active_plan", value: pending.key })
  })
  pendingPlan = null
  return pending.plan.title
}

export async function record(activity: Activity, operation: Operation, targetId = activity.activityId, notes: string | null = null) {
  const event: StoredEvent = {
    eventId: "evt" + crypto.randomUUID().replaceAll("-", "").slice(0, 20),
    targetId,
    planId: activity.planId,
    versionId: activity.versionId,
    operation,
    occurredAt: new Date().toISOString(),
    notes,
    payload: eventPayload(operation, notes),
    schemaVersion: 1,
  }
  await db.events.add(event)
}

function exportedPayload(event: StoredEvent): Record<string, string> {
  if (event.payload?.scheduled_time) return { scheduled_time: event.payload.scheduled_time }
  return eventPayload(event.operation, event.notes)
}

export async function exportProgress(): Promise<Blob> {
  const id = await deviceId()
  const events = await db.events.toArray()
  const payload = {
    schema_version: 1,
    kind: "progress_package",
    device_id: id,
    export_id: crypto.randomUUID(),
    exported_at: new Date().toISOString(),
    events: events.map((event) => ({
      event_id: event.eventId,
      device_id: id,
      entity_id: event.targetId,
      entity_type: event.targetId.includes("/set/") ? "set" : "activity",
      operation: event.operation,
      timestamp: event.occurredAt,
      schema_version: 1,
      plan_id: event.planId,
      version_id: event.versionId,
      payload: exportedPayload(event),
      notes: event.notes,
    })),
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
}

export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip()
  zip.file("plans.json", JSON.stringify(await db.plans.toArray()))
  zip.file("activities.json", JSON.stringify(await db.activities.toArray()))
  zip.file("events.json", JSON.stringify(await db.events.toArray()))
  const media = zip.folder("media")
  for (const row of await db.media.toArray()) {
    media?.file(row.path, row.blob)
  }
  zip.file(
    "manifest.json",
    JSON.stringify({ schema_version: 1, kind: "phone_backup", exported_at: new Date().toISOString(), event_ids: (await db.events.toArray()).map((event) => event.eventId) }),
  )
  await db.meta.put({ key: "last_backup", value: new Date().toISOString() })
  return zip.generateAsync({ type: "blob" })
}

export async function storageReport() {
  const estimate = await globalThis.navigator?.storage?.estimate?.()
  const backup = await db.meta.get("last_backup")
  return {
    plans: await db.plans.count(),
    images: await db.media.count(),
    events: await db.events.count(),
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    lastBackup: backup?.value ?? null,
  }
}

export async function restoreBackup(file: File, force: boolean): Promise<void> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const manifest = z
    .object({ schema_version: z.literal(1), kind: z.literal("phone_backup"), event_ids: z.array(z.string()) })
    .parse(JSON.parse(await zip.file("manifest.json")!.async("string")))
  const current = new Set((await db.events.toArray()).map((event) => event.eventId))
  const onlyHere = [...current].filter((id) => !manifest.event_ids.includes(id))
  if (onlyHere.length && !force) throw new Error("روی گوشی رویداد جدیدتری هست. بازیابی بدون تأیید انجام نشد.")
  const plans = JSON.parse(await zip.file("plans.json")!.async("string")) as PlanRow[]
  const activities = JSON.parse(await zip.file("activities.json")!.async("string")) as Activity[]
  const events = JSON.parse(await zip.file("events.json")!.async("string")) as StoredEvent[]
  const mediaRows: MediaRow[] = []
  for (const file of zip.file(/^media\//) ?? []) {
    if (file.dir) continue
    const path = file.name.slice("media/".length)
    const marker = path.indexOf("/media/")
    const planKey = marker > 0 ? path.slice(0, marker) : path
    mediaRows.push({ path, planKey, blob: blobFromBytes(await file.async("uint8array")), mime: "application/octet-stream" })
  }
  await db.transaction("rw", db.plans, db.activities, db.events, db.media, db.meta, async () => {
    await db.plans.clear()
    await db.activities.clear()
    await db.events.clear()
    await db.media.clear()
    await db.plans.bulkAdd(plans)
    await db.activities.bulkAdd(activities)
    await db.events.bulkAdd(events)
    if (mediaRows.length) await db.media.bulkAdd(mediaRows)
    if (plans[0]) await db.meta.put({ key: "active_plan", value: plans[0].key })
  })
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!globalThis.navigator?.storage?.persist) return null
  return globalThis.navigator.storage.persist()
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest("SHA-256", copy)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

export { db }
