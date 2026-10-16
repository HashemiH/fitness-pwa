import { useEffect, useState, type ReactNode } from "react"
import { CLOCK, annotate, persianDigits, reduceStatus, restRemaining, type Activity } from "./logic"
import { useApp } from "./state"

const STATUS: Record<string, string> = {
  pending: "در انتظار",
  completed: "انجام شد",
  skipped: "رد شد",
  rescheduled: "جابه‌جا شد",
}

type Annotated = ReturnType<typeof annotate>[number]
type Exercise = NonNullable<Activity["payload"]["exercises"]>[number]

function askClock(current: string | null, apply: (clock: string) => void) {
  const clock = window.prompt("ساعت جدید را به شکل HH:MM بنویسید", current ?? "18:00")
  if (clock && CLOCK.test(clock)) apply(clock)
}

function Clock({ row }: { row: Annotated }) {
  const shown = row.scheduledTime ?? row.activity.timeHhmm
  return (
    <span className="text-sm text-mist">
      {shown ?? "استراحت"}
      {row.originalTime && shown && shown !== row.originalTime ? ` · برنامه ${row.originalTime}` : ""}
    </span>
  )
}

export function ProgressRing({ percent }: { percent: number | null }) {
  const value = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const radius = 42
  const length = 2 * Math.PI * radius
  return (
    <div className="relative grid h-28 w-28 place-items-center" aria-label={percent == null ? "درصدی نیست" : `${percent} درصد`}>
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#293640" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#20E3A2"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * length} ${length}`}
        />
      </svg>
      <span className="absolute text-2xl font-bold text-paper">{percent == null ? "—" : persianDigits(Math.round(percent))}</span>
    </div>
  )
}

export function ActivityCard({ row }: { row: Annotated }) {
  const { mark } = useApp()
  const shown = row.scheduledTime ?? row.activity.timeHhmm
  return (
    <article className="rounded-3xl bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <strong>{row.activity.title}</strong>
        <Clock row={row} />
      </div>
      <p className="mt-1 text-sm text-mist">{STATUS[row.status]}</p>
      {row.activity.kind !== "rest" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="min-h-11 flex-1 rounded-2xl bg-mint font-bold text-ink" onClick={() => mark(row.activity, "complete")}>
            انجام شد
          </button>
          <button className="min-h-11 rounded-2xl border border-line px-4" onClick={() => mark(row.activity, "skip")}>
            رد
          </button>
          <button className="min-h-11 rounded-2xl border border-line px-4" onClick={() => mark(row.activity, "undo")}>
            برگشت
          </button>
          <button
            className="min-h-11 rounded-2xl border border-line px-4"
            onClick={() => askClock(shown, (clock) => mark(row.activity, "reschedule", row.activity.activityId, clock))}
          >
            جابه‌جایی
          </button>
        </div>
      )}
    </article>
  )
}

export function MealCard({ meal }: { meal: Activity }) {
  const { mark, data } = useApp()
  const row = annotate([meal], data?.events ?? [], data?.activities ?? [])[0]
  const status = row?.status ?? "pending"
  const shown = row?.scheduledTime ?? meal.timeHhmm
  const facts = meal.payload.nutrition
  return (
    <article className="rounded-3xl bg-card p-4">
      <div className="flex justify-between">
        <strong>{meal.title}</strong>
        {row ? <Clock row={row} /> : <span className="text-mist">{meal.timeHhmm}</span>}
      </div>
      <ul className="mt-2 space-y-1 text-sm text-mist">
        {(meal.payload.ingredients ?? []).map((item) => (
          <li key={item.name}>
            {item.name}
            {item.quantity ? ` — ${item.quantity}` : ""}
          </li>
        ))}
        {(meal.payload.ingredients ?? []).length === 0 && <li>مواد غذایی در برنامه نوشته نشده است.</li>}
      </ul>
      <p className="mt-2 text-sm text-mist">
        {facts?.calories == null ? "کالری ثبت نشده" : `${persianDigits(facts.calories)} کالری`}
        {facts?.protein_g == null ? "" : ` · پروتئین ${persianDigits(facts.protein_g)}`}
        {facts?.carbs_g == null ? "" : ` · کربوهیدرات ${persianDigits(facts.carbs_g)}`}
        {facts?.fat_g == null ? "" : ` · چربی ${persianDigits(facts.fat_g)}`}
      </p>
      {meal.payload.notes ? <p className="mt-1 text-sm text-mist">{meal.payload.notes}</p> : null}
      <p className="mt-1 text-sm">{STATUS[status]}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="min-h-11 flex-1 rounded-2xl bg-mint font-bold text-ink" onClick={() => mark(meal, "complete")}>
          انجام شد
        </button>
        <button className="min-h-11 rounded-2xl border border-line px-4" onClick={() => mark(meal, "skip")}>
          رد
        </button>
        <button className="min-h-11 rounded-2xl border border-line px-4" onClick={() => mark(meal, "undo")}>
          برگشت
        </button>
        <button
          className="min-h-11 rounded-2xl border border-line px-4"
          onClick={() => askClock(shown, (clock) => mark(meal, "reschedule", meal.activityId, clock))}
        >
          جابه‌جایی
        </button>
      </div>
    </article>
  )
}

export function RestTimer({ seconds }: { seconds: number }) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt == null) return
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 250)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [startedAt])
  const left = startedAt == null ? seconds : restRemaining(startedAt, seconds, now)
  const label = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`
  return (
    <div className="mt-3 rounded-2xl bg-elevated p-3">
      <p className="text-sm text-mist">استراحت</p>
      <p className="text-3xl font-bold text-paper" aria-live="polite">
        {persianDigits(label)}
      </p>
      <button className="mt-2 min-h-11 w-full rounded-2xl bg-mint font-bold text-ink" onClick={() => setStartedAt(Date.now())}>
        {startedAt == null ? "شروع استراحت" : left === 0 ? "دوباره" : "از نو"}
      </button>
    </div>
  )
}

export function ExerciseCard({ session, exercise, imageUrl }: { session: Activity; exercise: Exercise; imageUrl?: string }) {
  const { data, mark } = useApp()
  const [drafts, setDrafts] = useState<Record<string, { weight: string; reps: string }>>({})
  return (
    <div className="mt-4 border-t border-line pt-3">
      {imageUrl ? <img src={imageUrl} alt={exercise.name} className="mb-3 h-44 w-full rounded-2xl object-cover" /> : (
        <p className="mb-3 rounded-2xl bg-elevated px-3 py-6 text-center text-sm text-mist">تصویری برای این حرکت در برنامه نیست.</p>
      )}
      <strong className="text-lg">{exercise.name}</strong>
      {exercise.instructions ? <p className="mt-1 text-sm leading-7 text-mist">{exercise.instructions}</p> : null}
      <p className="mt-1 text-sm text-mist">
        {persianDigits(exercise.sets.length)} ست
        {exercise.rest_seconds ? ` · استراحت ${persianDigits(exercise.rest_seconds)} ثانیه` : ""}
        {exercise.duration_minutes ? ` · ${persianDigits(exercise.duration_minutes)} دقیقه` : ""}
      </p>
      <div className="mt-2 space-y-2">
        {exercise.sets.map((item) => {
          const related = (data?.events ?? []).filter((event) => event.targetId === item.set_id)
          const done = reduceStatus(related) === "completed"
          const saved = [...related].reverse().find((event) => event.operation === "complete")?.payload
          const draft = drafts[item.set_id] ?? { weight: saved?.weight ?? "", reps: saved?.reps ?? item.reps ?? "" }
          return (
            <div key={item.set_id} className={`rounded-2xl border p-3 ${done ? "border-mint" : "border-line"}`}>
              <div className="flex items-center justify-between gap-2">
                <strong>ست {persianDigits(item.number)}</strong>
                <span className="text-sm text-mist">{item.reps ? `${persianDigits(item.reps)} تکرار` : "تکرار در برنامه نیست"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-sm text-mist">
                  وزن
                  <input
                    className="mt-1 min-h-11 w-full rounded-xl bg-ink px-3 text-paper"
                    inputMode="decimal"
                    value={draft.weight}
                    aria-label={`وزن ست ${item.number}`}
                    onChange={(event) => setDrafts((current) => ({ ...current, [item.set_id]: { ...draft, weight: event.target.value } }))}
                  />
                </label>
                <label className="text-sm text-mist">
                  تکرار انجام‌شده
                  <input
                    className="mt-1 min-h-11 w-full rounded-xl bg-ink px-3 text-paper"
                    inputMode="numeric"
                    value={draft.reps}
                    aria-label={`تکرار ست ${item.number}`}
                    onChange={(event) => setDrafts((current) => ({ ...current, [item.set_id]: { ...draft, reps: event.target.value } }))}
                  />
                </label>
              </div>
              <button
                className="mt-2 min-h-11 w-full rounded-2xl bg-mint font-bold text-ink"
                onClick={() => {
                  const extra: Record<string, string> = {}
                  if (draft.weight.trim()) extra.weight = draft.weight.trim()
                  if (draft.reps.trim()) extra.reps = draft.reps.trim()
                  void mark(session, done ? "undo" : "complete", item.set_id, null, extra)
                }}
              >
                {done ? "برگشت ست" : "ثبت ست"}
              </button>
            </div>
          )
        })}
        {exercise.sets.length === 0 && <p className="text-sm text-mist">تعداد ست نوشته نشده و ستی ساخته نشده است.</p>}
      </div>
      {exercise.rest_seconds ? <RestTimer seconds={exercise.rest_seconds} /> : null}
    </div>
  )
}

export function CalendarView({
  days,
  shown,
  onSelect,
  detail,
}: {
  days: { day: string; label: string }[]
  shown: string | undefined
  onSelect: (day: string) => void
  detail: Annotated[]
}) {
  return (
    <div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-mist">
        {["د", "س", "چ", "پ", "ج", "ش", "ی"].map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((item) => (
          <button key={item.day} title={item.label || item.day} className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-0.5 py-1 text-center text-[11px] leading-tight ${item.day === shown ? "bg-mint font-bold text-ink" : "bg-card"}`} onClick={() => onSelect(item.day)}>
            <span>{item.day.slice(8)}</span>
            <span className="max-w-full truncate">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {detail.map((row) => (
          <p key={row.activity.activityId} className="rounded-2xl bg-card px-3 py-3">
            {row.scheduledTime ?? row.activity.timeHhmm ?? "—"} {row.activity.title}
            {row.originalTime && row.scheduledTime && row.scheduledTime !== row.originalTime ? ` · برنامه ${row.originalTime}` : ""} · {STATUS[row.status]}
            {row.activity.kind === "workout" ? " · تمرین" : ""}
            {row.activity.kind === "rest" ? " · استراحت" : ""}
          </p>
        ))}
      </div>
    </div>
  )
}

export function ImportPreview({ title, start, end, meals, workouts, images }: { title: string; start: string; end: string; meals: number; workouts: number; images: number }) {
  return (
    <article className="rounded-3xl bg-card p-4 text-sm leading-7">
      <strong>{title}</strong>
      <p>
        {start} تا {end}
      </p>
      <p>
        وعده {meals} · تمرین {workouts} · تصویر {images}
      </p>
    </article>
  )
}

export function SyncStatus({ text }: { text: string }) {
  return <p className="text-sm leading-7 text-mist">{text}</p>
}

export function BackupStatus({ text }: { text: string }) {
  return <p className="rounded-3xl bg-card p-4 text-sm leading-7">{text}</p>
}

export function EmptyState({ children }: { children?: ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-bold">هنوز برنامه‌ای نیست</h1>
      <div className="mt-2 text-mist">{children ?? "از بخش مدیریت یک بسته ZIP را وارد کنید."}</div>
    </section>
  )
}

export function ErrorState({ message }: { message: string }) {
  return <p className="rounded-3xl border border-rose-400 bg-card p-4 text-sm leading-7 text-rose-200">{message}</p>
}

export function ConfirmationDialog({
  title,
  body,
  onYes,
  onNo,
}: {
  title: string
  body: string
  onYes: () => void
  onNo: () => void
}) {
  return (
    <div className="rounded-3xl bg-card p-4">
      <strong>{title}</strong>
      <p className="mt-2 text-sm leading-7 text-mist">{body}</p>
      <div className="mt-3 flex gap-2">
        <button className="min-h-11 flex-1 rounded-2xl bg-mint font-bold text-ink" onClick={onYes}>
          تأیید
        </button>
        <button className="min-h-11 flex-1 rounded-2xl border border-line" onClick={onNo}>
          انصراف
        </button>
      </div>
    </div>
  )
}
