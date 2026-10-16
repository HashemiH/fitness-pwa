import type { ReactNode } from "react"
import { CLOCK, annotate, reduceStatus, type Activity } from "./logic"
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
  return (
    <div className="mt-4 grid h-24 w-24 place-items-center rounded-full text-lg font-bold" style={{ background: `conic-gradient(#3ddc97 ${percent ?? 0}%, #2a3440 0)` }}>
      <span className="grid h-16 w-16 place-items-center rounded-full bg-ink">{percent === null ? "—" : `${Math.round(percent)}`}</span>
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
      <p className="mt-2 text-sm text-mist">{facts?.calories == null ? "کالری ثبت نشده" : `${facts.calories} کالری`}</p>
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

export function ExerciseCard({ session, exercise, imageUrl }: { session: Activity; exercise: Exercise; imageUrl?: string }) {
  const { data, mark } = useApp()
  return (
    <div className="mt-4 border-t border-line pt-3">
      {imageUrl ? <img src={imageUrl} alt={exercise.name} className="mb-3 h-40 w-full rounded-2xl object-cover" /> : null}
      <strong>{exercise.name}</strong>
      {exercise.instructions ? <p className="mt-1 text-sm text-mist">{exercise.instructions}</p> : null}
      <p className="mt-1 text-sm text-mist">
        {exercise.sets.length} ست
        {exercise.rest_seconds ? ` · استراحت ${exercise.rest_seconds} ثانیه` : ""}
        {exercise.duration_minutes ? ` · ${exercise.duration_minutes} دقیقه` : ""}
      </p>
      <div className="mt-2 space-y-2">
        {exercise.sets.map((item) => {
          const done = reduceStatus((data?.events ?? []).filter((event) => event.targetId === item.set_id)) === "completed"
          return (
            <button
              key={item.set_id}
              className={`min-h-11 w-full rounded-2xl border px-3 text-right ${done ? "border-mint text-mint" : "border-line"}`}
              onClick={() => mark(session, done ? "undo" : "complete", item.set_id)}
            >
              ست {item.number}
              {item.reps ? ` · ${item.reps} تکرار` : ""}
              {item.weight ? ` · ${item.weight}` : ""}
            </button>
          )
        })}
        {exercise.sets.length === 0 && <p className="text-sm text-mist">تعداد ست نوشته نشده و ستی ساخته نشده است.</p>}
      </div>
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
      <div className="mt-4 grid grid-cols-4 gap-2">
        {days.map((item) => (
          <button key={item.day} className={`min-h-16 rounded-2xl p-2 text-right ${item.day === shown ? "bg-mint text-ink" : "bg-card"}`} onClick={() => onSelect(item.day)}>
            <span className="block text-sm">{item.day.slice(8)}</span>
            <span className="text-xs">{item.label}</span>
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
