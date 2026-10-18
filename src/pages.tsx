import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ConnectPanel } from "./connectPanel"
import { confirmPendingPlan, exportBackup, exportProgress, inspectPlanZip, requestPersistentStorage, restoreBackup, storageReport } from "./db"
import { ConfirmationDialog, ErrorState, ImportPreview } from "./components"
import { Icon } from "./icons"
import { CLOCK, annotate, compareBySchedule, mediaUrl, monthCells, nutritionRollup, persianDigits, reduceStatus, shamsiDateLabel, shamsiHeading, shamsiMonthLabel, shiftJalaliMonth, summarize, toJalali, type Activity, type FitnessEvent } from "./logic"
import { useApp } from "./state"

export { ProgressPage } from "./progress"

type Row = ReturnType<typeof annotate>[number]

function shift(day: string, amount: number): string {
  const value = new Date(day + "T12:00:00Z")
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function shamsiWeekOf(day: string): string[] {
  const date = new Date(day + "T12:00:00Z")
  const offset = (date.getUTCDay() + 1) % 7
  const start = shift(day, -offset)
  return Array.from({ length: 7 }, (_, index) => shift(start, index))
}

function askClock(current: string | null, apply: (clock: string) => void) {
  const clock = window.prompt("ساعت جدید را به شکل HH:MM بنویسید", current ?? "18:00")
  if (clock && CLOCK.test(clock)) apply(clock)
}

function Ring({ percent }: { percent: number | null }) {
  const value = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const length = 2 * Math.PI * 62
  return (
    <div className="ring" aria-label={percent == null ? "درصدی نیست" : `${percent} درصد`}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle className="track" cx="80" cy="80" r="62" />
        {value > 0 ? <circle className="value" cx="80" cy="80" r="62" strokeDasharray={`${(value / 100) * length} ${length}`} /> : null}
      </svg>
      <strong>
        <span dir="ltr">
          {percent == null
            ? "—"
            :               [...persianDigits(Math.round(percent))].map((digit, index) => (
                <em key={index} className={digit === "۰" ? "zero" : undefined}>{digit}</em>
              ))}
        </span>
        {percent == null ? null : <small>٪</small>}
      </strong>
    </div>
  )
}

function MacroStrip({ rows }: { rows: Row[] }) {
  const rollup = nutritionRollup(rows)
  const cells = [
    ["کالری", rollup.consumed.calories, rollup.planned.calories],
    ["پروتئین", rollup.consumed.protein, rollup.planned.protein],
    ["کربوهیدرات", rollup.consumed.carbs, rollup.planned.carbs],
    ["چربی", rollup.consumed.fat, rollup.planned.fat],
  ] as const
  return (
    <div className="metric-strip">
      {cells.map(([label, consumed, planned]) => (
        <div key={label}>
          <small>{label}</small>
          <b>{planned == null ? "—" : `${persianDigits(consumed ?? 0)}/${persianDigits(planned)}`}</b>
        </div>
      ))}
    </div>
  )
}

function Picture({ src, label, className }: { src?: string; label: string; className?: string }) {
  if (src) return <img src={src} alt={label} />
  return <div className={className ?? "ph"}>{label}</div>
}

export function TodayPage() {
  const { data, today, mark } = useApp()
  const [notice, setNotice] = useState<string | null>(null)
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const todayRows = rows.filter((row) => row.activity.localDate === today).sort(compareBySchedule)
  const summary = summarize(rows, today, today)
  const nextMeal = todayRows.find((row) => row.activity.kind === "meal" && row.status === "pending")
  const image = nextMeal ? mediaUrl(data.plan.key, nextMeal.activity.payload.image, data.media) : undefined
  return (
    <section className="page today-page">
      <header className="topbar">
        <div className="tools" />
        <div className="date-block">
          <strong>{shamsiHeading(today)}</strong>
        </div>
        <div className="tools end">
          <button className="icon-btn" aria-label="اعلان" onClick={() => setNotice(todayRows.filter((row) => row.status === "pending").length ? "فعالیت باز مانده است." : "اعلان بازی نیست.")}>
            <Icon name="bell" />
          </button>
        </div>
      </header>
      {notice ? <p className="note">{notice}</p> : null}
      <div className="ring-block">
        <Ring percent={summary.percent} />
        <p>پیشرفت امروز</p>
      </div>
      <MacroStrip rows={todayRows} />
      <article className="meal-hero">
        <Picture src={image} label="" />
        <div className="shade">
          <header>
            <b>{nextMeal ? `بعدی: ${nextMeal.activity.title}` : "وعده بازی نمانده"}</b>
            <time>{nextMeal?.scheduledTime ?? ""}</time>
          </header>
          {nextMeal ? <Link to="/nutrition">مشاهده وعده</Link> : null}
        </div>
      </article>
      <h2 className="section-label">برنامه امروز</h2>
      <div className="timeline">
        {todayRows.map((row) => (
          <div key={row.activity.activityId} className={row.status === "completed" ? "t-row done" : "t-row"}>
            <time>{row.scheduledTime ?? "—"}</time>
            <span className="rail" />
            <b>
              <span>{row.activity.title}</span>
              <button className="ghost" onClick={() => askClock(row.scheduledTime, (clock) => mark(row.activity, "reschedule", row.activity.activityId, clock))}>جابه‌جایی</button>
            </b>
            <button className="check" aria-label={row.status === "completed" ? "برگشت" : "انجام شد"} onClick={() => mark(row.activity, row.status === "completed" ? "undo" : "complete")}>
              <i className={row.status === "completed" ? "on" : undefined}>{row.status === "completed" ? <Icon name="check" /> : null}</i>
            </button>
          </div>
        ))}
        {todayRows.length === 0 && <p className="empty">برای امروز فعالیتی نیست.</p>}
      </div>
    </section>
  )
}

const WEEKDAY_MARK = ["ی", "د", "س", "چ", "پ", "ج", "ش"]

export function NutritionPage() {
  const { data, today, mark } = useApp()
  const [day, setDay] = useState(today)
  if (!data?.plan) return <MissingPlan />
  const meals = annotate(
    data.activities.filter((item) => item.versionId === data.plan!.versionId && item.kind === "meal" && item.localDate === day),
    data.events,
    data.activities,
  ).sort(compareBySchedule)
  return (
    <section className="page nutrition-page">
      <header className="back-head">
        <Link to="/" className="icon-btn" aria-label="بازگشت"><Icon name="back" /></Link>
        <h1>تغذیه</h1>
        <span />
      </header>
      <p className="strip-month">{shamsiMonthLabel(day)}</p>
      <div className="day-strip">
        {shamsiWeekOf(day).map((item) => {
          const jalali = toJalali(item)
          return (
            <button key={item} className={item === day ? "on" : ""} aria-label={shamsiDateLabel(item)} onClick={() => setDay(item)}>
              <small>{WEEKDAY_MARK[new Date(`${item}T12:00:00Z`).getUTCDay()]}</small>
              <b>{persianDigits(jalali.day)}</b>
            </button>
          )
        })}
      </div>
      <MacroStrip rows={meals} />
      {meals.map((meal) => {
        const image = mediaUrl(data.plan!.key, meal.activity.payload.image, data.media)
        const facts = meal.activity.payload.nutrition
        return (
          <article key={meal.activity.activityId} className="meal-card">
            <div>
              <header>
                <b>{meal.activity.title}</b>
                <time>{meal.scheduledTime ? persianDigits(meal.scheduledTime) : "—"}</time>
              </header>
              <p className="sub">{facts?.calories == null ? "کالری ثبت نشده" : `${persianDigits(facts.calories)} kcal`}</p>
              <ul>
                {(meal.activity.payload.ingredients ?? []).map((item) => (
                  <li key={item.name}>{item.name}{item.quantity ? ` ${item.quantity}` : ""}</li>
                ))}
                {(meal.activity.payload.ingredients ?? []).length === 0 && <li>مواد در برنامه نیست.</li>}
              </ul>
              <div className="actions">
                <button className={meal.status === "completed" ? "icon-act on" : "icon-act"} aria-label={meal.status === "completed" ? "برگشت" : "انجام"} onClick={() => mark(meal.activity, meal.status === "completed" ? "undo" : "complete")}><Icon name="check" /></button>
                <button className={meal.status === "skipped" ? "icon-act skip on" : "icon-act"} aria-label="رد" onClick={() => mark(meal.activity, "skip")}><Icon name="x" /></button>
                <button onClick={() => askClock(meal.scheduledTime, (clock) => mark(meal.activity, "reschedule", meal.activity.activityId, clock))}>ساعت</button>
              </div>
            </div>
            <Picture src={image} label="بدون تصویر" />
          </article>
        )
      })}
      {meals.length === 0 && <p className="empty">برای این روز وعده‌ای نیست.</p>}
    </section>
  )
}

function numeric(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.replace(",", ".").match(/[\d.]+/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function latinClock(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "")
}

function holdParts(total: number): { minutes: number; seconds: number } {
  const safe = Math.max(0, Math.min(300 * 60, Math.floor(total)))
  return { minutes: Math.floor(safe / 60), seconds: safe % 60 }
}

function formatHold(total: number): string {
  const { minutes, seconds } = holdParts(total)
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function loggedSets(events: FitnessEvent[], activityId: string, exerciseId: string, planned: Map<string, number>) {
  const prefix = `${activityId}/set/${exerciseId}/`
  const ids = [...new Set(events.map((event) => event.targetId).filter((id) => id.startsWith(prefix)))]
  const rows = ids.flatMap((id) => {
    const related = events.filter((event) => event.targetId === id)
    if (reduceStatus(related) !== "completed") return []
    const ordered = [...related].sort((a, b) => (a.occurredAt + a.eventId).localeCompare(b.occurredAt + b.eventId))
    let reps: string | null = null
    let duration: string | null = null
    for (const event of ordered) {
      if (event.operation === "complete") {
        reps = event.payload?.reps?.trim() || null
        duration = event.payload?.duration?.trim() || null
      }
      if (event.operation === "undo") {
        reps = null
        duration = null
      }
    }
    const parsed = Number(id.slice(prefix.length))
    return [{ id, number: planned.get(id) ?? (Number.isFinite(parsed) ? parsed : 0), reps, duration }]
  })
  return rows.sort((a, b) => a.number - b.number || a.id.localeCompare(b.id))
}

const DAY_SLOTS = [
  { key: "morning", title: "صبح" },
  { key: "noon", title: "ظهر" },
  { key: "gym", title: "باشگاه" },
  { key: "night", title: "شب" },
] as const

function mealSlot(title: string): (typeof DAY_SLOTS)[number]["key"] | null {
  if (/قبل\s*تمرین|باشگاه/.test(title)) return "gym"
  if (/شام|خواب|بعد\s*تمرین|(^|[\s/])شب/.test(title)) return "night"
  if (/ناهار|ظهر|عصر/.test(title)) return "noon"
  if (/صبح|ناشتا/.test(title)) return "morning"
  return null
}

function movementGroups(activities: Activity[], events: FitnessEvent[]) {
  const rows = annotate(activities, events, activities).sort(compareBySchedule)
  const meals = rows.filter((row) => row.activity.kind === "meal")
  const workouts = rows.filter((row) => row.activity.kind === "workout")
  const groups = DAY_SLOTS.map((slot) => ({
    key: slot.key,
    title: slot.title,
    time: null as string | null,
    items: [] as { session: Activity; exercise: NonNullable<Activity["payload"]["exercises"]>[number]; sessionTime: string | null }[],
  }))
  const slotOf = (key: (typeof DAY_SLOTS)[number]["key"]) => groups.findIndex((group) => group.key === key)
  for (const row of workouts) {
    const clock = row.scheduledTime ?? "99:99"
    let slot: (typeof DAY_SLOTS)[number]["key"] | null = null
    for (const meal of meals) {
      const key = mealSlot(meal.activity.title)
      if (key && (meal.scheduledTime ?? "99:99") <= clock) slot = key
    }
    if (!slot) {
      const hour = Number(clock.slice(0, 2))
      slot = Number.isFinite(hour) ? (hour < 12 ? "morning" : hour < 17 ? "noon" : hour < 21 ? "gym" : "night") : "gym"
    }
    for (const exercise of row.activity.payload.exercises ?? []) {
      groups[slotOf(slot)].items.push({ session: row.activity, exercise, sessionTime: row.scheduledTime })
    }
  }
  return groups
}

export function WorkoutPage() {
  const { data, today, mark } = useApp()
  const [mode, setMode] = useState<"day" | "all">("day")
  const [picked, setPicked] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, { reps: string; minutes: string; seconds: string }>>({})
  const [slot, setSlot] = useState<(typeof DAY_SLOTS)[number]["key"] | null>(null)
  if (!data?.plan) return <MissingPlan />
  const sessions = data.activities.filter((item) => item.versionId === data.plan!.versionId && item.kind === "workout" && item.localDate === today)
  const exercises = sessions.flatMap((session) => (session.payload.exercises ?? []).map((exercise) => ({ session, exercise })))
  const groups = movementGroups(
    data.activities.filter((item) => item.versionId === data.plan!.versionId && item.localDate === today && item.kind !== "rest"),
    data.events ?? [],
  )
  const activeSlot = slot ?? groups.find((group) => group.items.length)?.key ?? "gym"
  const activeGroup = groups.find((group) => group.key === activeSlot) ?? groups[0]
  const current = exercises[Math.min(picked, Math.max(exercises.length - 1, 0))]
  const inSlot = Boolean(current && activeGroup.items.some((item) => item.session.activityId === current.session.activityId && item.exercise.exercise_id === current.exercise.exercise_id))
  function chooseSlot(key: (typeof DAY_SLOTS)[number]["key"]) {
    setSlot(key)
    const first = groups.find((group) => group.key === key)?.items[0]
    if (!first) return
    const index = exercises.findIndex((entry) => entry.session.activityId === first.session.activityId && entry.exercise.exercise_id === first.exercise.exercise_id)
    if (index >= 0) setPicked(index)
  }
  const exercise = current?.exercise
  const planned = new Map(exercise?.sets.map((item) => [item.set_id, item.number]) ?? [])
  const logs = exercise && current ? loggedSets(data.events ?? [], current.session.activityId, exercise.exercise_id, planned) : []
  const pending = exercise?.sets.find((item) => reduceStatus((data.events ?? []).filter((event) => event.targetId === item.set_id)) !== "completed")
  const nextNumber = pending ? pending.number : Math.max(exercise?.sets.length ?? 0, ...logs.map((item) => item.number), 0) + 1
  const nextId = pending?.set_id ?? (current && exercise ? `${current.session.activityId}/set/${exercise.exercise_id}/${nextNumber}` : "")
  const beyond = Boolean(exercise && exercise.sets.length > 0 && !pending)
  const draft = nextId
    ? drafts[nextId] ?? {
        reps: pending?.reps ?? exercise?.sets.at(-1)?.reps ?? "",
        minutes: exercise?.duration_minutes != null ? String(exercise.duration_minutes) : "0",
        seconds: "0",
      }
    : { reps: "", minutes: "0", seconds: "0" }
  const manualSeconds = Math.min(300 * 60, (numeric(draft.minutes) ?? 0) * 60 + Math.min(59, numeric(draft.seconds) ?? 0))
  const image = exercise ? mediaUrl(data.plan.key, exercise.image, data.media) : undefined
  function writeTime(part: "minutes" | "seconds", raw: string) {
    const digits = latinClock(raw).slice(0, part === "seconds" ? 2 : 3)
    const next = { ...draft, [part]: digits === "" ? "0" : String(Number(digits)) }
    if (part === "seconds" && Number(next.seconds) > 59) next.seconds = "59"
    if (part === "minutes" && Number(next.minutes) > 300) next.minutes = "300"
    setDrafts((currentDrafts) => ({ ...currentDrafts, [nextId]: next }))
  }
  return (
    <section className="page">
      <div className="segment">
        <button className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>همه حرکات</button>
        <button className={mode === "day" ? "on" : ""} onClick={() => setMode("day")}>روز تمرین</button>
      </div>
      {mode === "day" ? (
        <>
          <div className="slot-pick" role="group" aria-label="وعده تمرین">
            {DAY_SLOTS.map((item) => (
              <button key={item.key} className={activeSlot === item.key ? "on" : ""} onClick={() => chooseSlot(item.key)}>{item.title}</button>
            ))}
          </div>
          {!current || !inSlot ? <p className="empty">برای {activeGroup.title} حرکتی در برنامه نیست.</p> : (
          <>
          <div className="hero-media"><Picture src={image} label="تصویر این حرکت در برنامه نیست" /></div>
          <div className="player-card">
            <h2>{exercise?.name}</h2>
            <p className="meta">{exercise ? beyond || exercise.sets.length === 0 ? `ست ${persianDigits(nextNumber)} · بیشتر از برنامه` : `ست ${persianDigits(nextNumber)} از ${persianDigits(exercise.sets.length)}` : ""}</p>
            {exercise && nextId ? (
              <>
                <div className="steppers one">
                  <div className="stepper">
                    <button aria-label="کم کردن تکرار" onClick={() => setDrafts((currentDrafts) => ({ ...currentDrafts, [nextId]: { ...draft, reps: String(Math.max(0, (numeric(draft.reps) ?? 0) - 1)) } }))}>−</button>
                    <b>{draft.reps.trim() ? persianDigits(draft.reps) : "—"}<small>تکرار</small></b>
                    <button aria-label="زیاد کردن تکرار" onClick={() => setDrafts((currentDrafts) => ({ ...currentDrafts, [nextId]: { ...draft, reps: String((numeric(draft.reps) ?? 0) + 1) } }))}>+</button>
                  </div>
                </div>
                <div className="steppers">
                  <label className="time-field">
                    <input
                      inputMode="numeric"
                      aria-label="دقیقه"
                      value={persianDigits(draft.minutes)}
                      onChange={(event) => writeTime("minutes", event.target.value)}
                    />
                    <small>دقیقه</small>
                  </label>
                  <label className="time-field">
                    <input
                      inputMode="numeric"
                      aria-label="ثانیه"
                      value={persianDigits(draft.seconds)}
                      onChange={(event) => writeTime("seconds", event.target.value)}
                    />
                    <small>ثانیه</small>
                  </label>
                </div>
              </>
            ) : <p className="meta">ستی در برنامه نیست.</p>}
            <button
              className="primary"
              disabled={!current || !exercise || !nextId}
              onClick={() => {
                if (!current || !nextId) return
                const extra: Record<string, string> = {}
                if (draft.reps.trim() && draft.reps.trim() !== "—") extra.reps = draft.reps.trim()
                if (manualSeconds > 0) extra.duration = formatHold(manualSeconds)
                void mark(current.session, "complete", nextId, null, extra)
              }}
            >
              ثبت ست
            </button>
            <div className="set-log">
              <p>ست‌های امروز</p>
              {logs.length === 0 ? <span>هنوز ستی ثبت نشده.</span> : (
                <ul>
                  {logs.map((item) => (
                    <li key={item.id}>
                      <span>
                        ست {persianDigits(item.number)}
                        {item.reps ? ` · ${persianDigits(item.reps)} تکرار` : ""}
                        {item.duration && item.duration !== "00:00" ? ` · ${persianDigits(item.duration)}` : ""}
                        {item.number > (exercise?.sets.length ?? 0) ? " · بیشتر از برنامه" : ""}
                      </span>
                      <button aria-label={`حذف ست ${persianDigits(item.number)}`} onClick={() => { if (current) void mark(current.session, "undo", item.id) }}><Icon name="x" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          </>
          )}
        </>
      ) : null}
      {mode === "all" ? (
        <div className="ex-groups">
          {groups.map((group) => (
            <section key={group.key} className="ex-group">
              <h3>
                <b>{group.title}</b>
                {group.time ? <time>{persianDigits(group.time)}</time> : null}
              </h3>
              {group.items.length === 0 ? <p>حرکتی در این وعده نیست.</p> : (
                <div className="ex-list">
                  {group.items.map((item, index) => {
                    const thumb = mediaUrl(data.plan!.key, item.exercise.image, data.media)
                    const flat = exercises.findIndex((entry) => entry.session.activityId === item.session.activityId && entry.exercise.exercise_id === item.exercise.exercise_id)
                    const previous = group.items[index - 1]
                    const done = loggedSets(data.events ?? [], item.session.activityId, item.exercise.exercise_id, new Map(item.exercise.sets.map((set) => [set.set_id, set.number])))
                    return (
                      <div key={item.exercise.exercise_id + item.session.activityId}>
                        {!previous || previous.session.activityId !== item.session.activityId ? (
                          <p className="ex-session">{item.session.title}{item.sessionTime ? ` · ${persianDigits(item.sessionTime)}` : ""}</p>
                        ) : null}
                        <button className={flat === picked ? "on" : ""} onClick={() => { setPicked(Math.max(flat, 0)); setSlot(group.key); setMode("day") }}>
                          <Picture src={thumb} label="—" />
                          <span>{item.exercise.name}</span>
                          <small>{done.length ? `${persianDigits(done.length)} انجام` : `${persianDigits(item.exercise.sets.length)} ست`}</small>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : activeGroup.items.length ? (
      <div className="ex-list">
        {activeGroup.items.map((item) => {
          const thumb = mediaUrl(data.plan!.key, item.exercise.image, data.media)
          const index = exercises.findIndex((entry) => entry.session.activityId === item.session.activityId && entry.exercise.exercise_id === item.exercise.exercise_id)
          return (
            <button key={item.exercise.exercise_id + item.session.activityId} className={index === picked ? "on" : ""} onClick={() => { setPicked(index); setMode("day") }}>
              <Picture src={thumb} label="—" />
              <span>{item.exercise.name}</span>
              <small>{(() => {
                const done = loggedSets(data.events ?? [], item.session.activityId, item.exercise.exercise_id, new Map(item.exercise.sets.map((set) => [set.set_id, set.number])))
                return done.length ? `${persianDigits(done.length)} انجام` : `${persianDigits(item.exercise.sets.length)} ست`
              })()}</small>
            </button>
          )
        })}
      </div>
      ) : null}
    </section>
  )
}

const SHAMSI_WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"]

export function CalendarPage() {
  const { data, today, mark } = useApp()
  const [selected, setSelected] = useState(today)
  const [cursor, setCursor] = useState(() => shiftJalaliMonth(today, 0))
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const cells = monthCells(cursor)
  const detail = rows.filter((row) => row.activity.localDate === selected).sort(compareBySchedule)
  return (
    <section className="page">
      <header className="month-head">
        <button aria-label="ماه بعد" onClick={() => setCursor(shiftJalaliMonth(cursor, 1))}><Icon name="back" /></button>
        <h1>{shamsiMonthLabel(cursor)}</h1>
        <button aria-label="ماه قبل" onClick={() => setCursor(shiftJalaliMonth(cursor, -1))}><Icon name="back" /></button>
      </header>
      <div className="cal">
        {SHAMSI_WEEKDAYS.map((name) => <span key={name} className="dow">{name}</span>)}
        {cells.map((cell) => {
          const dayRows = rows.filter((row) => row.activity.localDate === cell.date)
          const kinds = new Set(dayRows.map((row) => row.activity.kind))
          return (
            <button key={cell.date} className={`${cell.date === selected ? "on" : ""} ${cell.inMonth ? "" : "off"}`} onClick={() => setSelected(cell.date)}>
              {persianDigits(cell.day)}
              <span className="dots">
                {kinds.has("meal") ? <i className="meal" /> : null}
                {kinds.has("workout") ? <i className="workout" /> : null}
                {kinds.has("rest") ? <i className="rest" /> : null}
              </span>
            </button>
          )
        })}
      </div>
      <p className="legend"><i className="meal" />تغذیه <i className="workout" />تمرین <i className="rest" />استراحت <span>وزن ثبت نمی‌شود</span></p>
      <h2 className="section-label day-title">جزئیات {shamsiDateLabel(selected)}</h2>
      {detail.map((row) => (
        <div key={row.activity.activityId} className="line">
          <span className="kind">{row.activity.kind === "workout" ? "ت" : row.activity.kind === "rest" ? "ا" : "غ"}</span>
          <b>{row.activity.title}</b>
          <time>{row.scheduledTime ?? "—"}</time>
          <button className="check" aria-label="وضعیت" onClick={() => row.activity.kind !== "rest" && mark(row.activity, row.status === "completed" ? "undo" : "complete")}>
            <i className={row.status === "completed" ? "on" : undefined}>{row.status === "completed" ? <Icon name="check" /> : null}</i>
          </button>
        </div>
      ))}
      {detail.length === 0 && <p className="empty">برای این روز فعالیتی نیست.</p>}
    </section>
  )
}

export function MorePage() {
  const navigate = useNavigate()
  const { data, refresh } = useApp()
  const [message, setMessage] = useState("بسته برنامه را از رایانه وارد کنید. تا تأیید نکنید، چیزی ذخیره نمی‌شود.")
  const [preview, setPreview] = useState<{ title: string; start: string; end: string; meals: number; workouts: number; images: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [panel, setPanel] = useState<"plan" | "file" | "backup" | "settings" | "connect" | null>(null)
  const [storage, setStorage] = useState("وضعیت نگهداری دائمی هنوز پرسیده نشده است.")
  const [diag, setDiag] = useState("در حال خواندن وضعیت حافظه...")
  const [farewell, setFarewell] = useState<string | null>(null)
  useEffect(() => {
    void storageReport().then(showStorage).catch(() => setDiag("وضعیت حافظه خوانده نشد."))
  }, [])
  function showStorage(report: Awaited<ReturnType<typeof storageReport>>) {
    const used = report.usage == null ? "نامشخص" : `${Math.round(report.usage / 1024)} کیلوبایت`
    const backup = report.lastBackup ?? "پشتیبان تازه‌ای ثبت نشده"
    const warning = report.lastBackup ? "" : " هشدار: هنوز پشتیبان گرفته نشده است."
    setDiag(`برنامه ${report.plans} | تصویر ${report.images} | رویداد ${report.events} | حجم حدودی ${used} | آخرین پشتیبان ${backup}.${warning}`)
  }
  async function onPlan(file: File | undefined) {
    if (!file) return
    setPreview(null)
    setError(null)
    setMessage("در حال بررسی بسته...")
    try {
      const next = await inspectPlanZip(file)
      setPreview(next)
      setPanel("file")
      setMessage("بسته بررسی شد. تا تأیید نکنید ذخیره نمی‌شود.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ورود برنامه انجام نشد.")
    }
  }
  const counts = useMemo(() => {
    if (!data?.plan) return null
    const rows = data.activities.filter((item) => item.versionId === data.plan!.versionId)
    return { meals: rows.filter((item) => item.kind === "meal").length, workouts: rows.filter((item) => item.kind === "workout").length }
  }, [data])
  return (
    <section className="page">
      <article className="plan-card">
        <img className="mark" src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
        <div>
          <h1>{data?.plan?.title ?? "برنامه‌ای فعال نیست"}</h1>
          <p>{data?.plan ? `${shamsiDateLabel(data.plan.startDate)} تا ${shamsiDateLabel(data.plan.endDate)}` : "از ورود برنامه یک بسته ZIP بیاورید."}</p>
          <p>{data?.plan ? <em>فعال{counts ? ` | ${persianDigits(counts.workouts)} تمرین | ${persianDigits(counts.meals)} وعده` : ""}</em> : null}</p>
        </div>
      </article>
      <div className="menu">
        <button className={panel === "plan" ? "menu-row on" : "menu-row"} onClick={() => setPanel(panel === "plan" ? null : "plan")}><Icon name="doc" />بررسی برنامه</button>
        <label className={panel === "file" || preview ? "menu-row on" : "menu-row"}><Icon name="download" />ورود برنامه جدید<input className="hidden-input" type="file" accept=".zip,application/zip" onChange={(event) => onPlan(event.target.files?.[0])} /></label>
        <button className="menu-row" onClick={() => void download("progress.json", exportProgress())}><Icon name="swap" />تبادل فایل</button>
        <button className={panel === "connect" ? "menu-row on" : "menu-row"} onClick={() => setPanel(panel === "connect" ? null : "connect")}><Icon name="swap" />اتصال برنامه</button>
        <button className="menu-row" onClick={() => navigate("/progress")}><Icon name="bars" />گزارش‌ها</button>
        <button className={panel === "settings" ? "menu-row on" : "menu-row"} onClick={() => setPanel(panel === "settings" ? null : "settings")}><Icon name="gear" />تنظیمات</button>
        <button className={panel === "backup" ? "menu-row on" : "menu-row"} onClick={() => setPanel(panel === "backup" ? null : "backup")}><Icon name="cloud" />پشتیبان‌گیری</button>
        <button className="menu-row danger" onClick={() => setFarewell("حساب کاربری وجود ندارد. داده‌ها روی همین دستگاه می‌مانند و پاک نمی‌شوند.")}><Icon name="power" />خروج</button>
      </div>
      {panel === "connect" ? <ConnectPanel /> : null}
      {panel === "plan" ? <p className="note">{message}</p> : null}
      {panel === "file" || preview ? (
        <div className="panel">
          {preview ? <ImportPreview {...preview} /> : null}
          {preview ? (
            <button className="primary" onClick={async () => {
              try {
                const title = await confirmPendingPlan()
                setPreview(null)
                setError(null)
                setMessage(`برنامه «${title}» ذخیره شد.`)
                refresh()
                showStorage(await storageReport())
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "ذخیره انجام نشد.")
              }
            }}>تأیید و ذخیره</button>
          ) : null}
        </div>
      ) : null}
      {panel === "backup" ? (
        <div className="panel">
          <button className="ghost" onClick={async () => { await download("phone-backup.zip", exportBackup()); showStorage(await storageReport()) }}>خروجی پشتیبان</button>
          <label className="ghost">بازیابی پشتیبان<input className="hidden-input" type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) setRestoreFile(file) }} /></label>
          <p className="note">{diag}</p>
        </div>
      ) : null}
      {panel === "settings" ? (
        <div className="panel">
          <button className="ghost" onClick={async () => {
            const result = await requestPersistentStorage()
            setStorage(result === null ? "این مرورگر درخواست نگهداری دائمی ندارد." : result ? "مرورگر نگهداری را پذیرفت. این تضمین حذف نشدن داده نیست." : "مرورگر نگهداری دائمی را نداد. پشتیبان بگیرید.")
          }}>درخواست نگهداری داده</button>
          <p className="note">{storage}</p>
          <p className="note">{diag}</p>
          <p className="note">نسخه ۲.۰.۰. همگام‌سازی روی وای‌فای از اتصال برنامه است. ورود ZIP همچنان پشتیبان است. وقتی برنامه بسته است، همگام‌سازی پس‌زمینه تضمین نمی‌شود.</p>
        </div>
      ) : null}
      {farewell ? <p className="note">{farewell}</p> : null}
      {restoreFile ? (
        <ConfirmationDialog
          title="بازیابی پشتیبان"
          body="اگر روی گوشی ثبت جدیدتری باشد، بازیابی آن را کنار می‌گذارد."
          onNo={() => setRestoreFile(null)}
          onYes={async () => {
            const file = restoreFile
            setRestoreFile(null)
            try {
              await restoreBackup(file, true)
              setError(null)
              setMessage("پشتیبان بازیابی شد.")
              refresh()
              showStorage(await storageReport())
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "بازیابی انجام نشد.")
            }
          }}
        />
      ) : null}
      {error ? <ErrorState message={error} /> : null}
    </section>
  )
}

function MissingPlan() {
  return (
    <section className="page">
      <div className="empty">
        <h1>هنوز برنامه‌ای نیست</h1>
        <p>از بخش بیشتر یک بسته ZIP را وارد کنید.</p>
        <Link to="/more">رفتن به بیشتر</Link>
      </div>
    </section>
  )
}

async function download(name: string, blob: Promise<Blob>) {
  const ready = await blob
  const url = URL.createObjectURL(ready)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
