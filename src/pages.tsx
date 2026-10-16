import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { confirmPendingPlan, exportBackup, exportProgress, inspectPlanZip, requestPersistentStorage, restoreBackup, storageReport } from "./db"
import { ActivityCard, BackupStatus, CalendarView, ConfirmationDialog, EmptyState, ErrorState, ExerciseCard, ImportPreview, MealCard, ProgressRing, SyncStatus } from "./components"
import { annotate, calendarDayLabel, compareBySchedule, mediaUrl, summarize } from "./logic"
import { useApp } from "./state"

export function TodayPage() {
  const { data, today } = useApp()
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const todayRows = rows.filter((row) => row.activity.localDate === today).sort(compareBySchedule)
  const summary = summarize(rows, today, today)
  return (
    <section>
      <p className="text-sm text-mist">{today}</p>
      <h1 className="mt-1 text-2xl font-bold">{data.plan.title}</h1>
      <p className="mt-3 text-mint">{summary.percent === null ? "برای امروز فعالیتی نیست" : `${summary.percent}٪ انجام شده`}</p>
      <ProgressRing percent={summary.percent} />
      <div className="mt-4 space-y-3">
        {todayRows.map((row) => (
          <ActivityCard key={row.activity.activityId} row={row} />
        ))}
      </div>
    </section>
  )
}

export function NutritionPage() {
  const { data, today } = useApp()
  if (!data?.plan) return <MissingPlan />
  const meals = annotate(
    data.activities.filter((item) => item.versionId === data.plan!.versionId && item.kind === "meal" && item.localDate === today),
    data.events,
    data.activities,
  ).sort(compareBySchedule)
  return (
    <section>
      <h1 className="text-2xl font-bold">تغذیه امروز</h1>
      <div className="mt-4 space-y-3">
        {meals.map((meal) => (
          <MealCard key={meal.activity.activityId} meal={meal.activity} />
        ))}
        {meals.length === 0 && <p className="text-mist">برای امروز وعده‌ای نیست.</p>}
      </div>
    </section>
  )
}

export function WorkoutPage() {
  const { data, today } = useApp()
  if (!data?.plan) return <MissingPlan />
  const sessions = data.activities.filter((item) => item.versionId === data.plan!.versionId && item.kind === "workout" && item.localDate === today)
  if (!sessions.length) return <p className="text-mist">برای امروز تمرینی نیست.</p>
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">تمرین امروز</h1>
      {sessions.map((session) => (
        <article key={session.activityId} className="rounded-3xl bg-card p-4">
          <h2 className="text-xl font-bold">{session.title}</h2>
          {(session.payload.exercises ?? []).map((exercise) => (
            <ExerciseCard
              key={exercise.exercise_id}
              session={session}
              exercise={exercise}
              imageUrl={mediaUrl(data.plan!.key, exercise.image, data.media)}
            />
          ))}
        </article>
      ))}
    </section>
  )
}

export function ProgressPage() {
  const { data, today } = useApp()
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const weekStart = shift(today, -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7))
  const monthStart = today.slice(0, 8) + "01"
  const monthEnd = monthLast(today)
  const blocks = [
    ["امروز", summarize(rows, today, today)],
    ["این هفته", summarize(rows, weekStart, shift(weekStart, 6))],
    ["این ماه", summarize(rows, monthStart, monthEnd)],
  ] as const
  const chart = Array.from({ length: 7 }, (_, index) => {
    const day = shift(weekStart, index)
    const summary = summarize(rows, day, day)
    return { day: day.slice(8), percent: summary.percent ?? 0 }
  })
  return (
    <section>
      <h1 className="text-2xl font-bold">پیشرفت</h1>
      <div className="mt-4 h-40 rounded-3xl bg-card p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <XAxis dataKey="day" stroke="#c5d0dc" />
            <YAxis hide domain={[0, 100]} />
            <Bar dataKey="percent" fill="#3ddc97" radius={8} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-3">
        {blocks.map(([label, summary]) => (
          <article key={label} className="rounded-3xl bg-card p-4">
            <strong>{label}</strong>
            <p className="mt-1 text-mint">{summary.percent === null ? "فعالیتی نیست" : `${summary.percent}٪`}</p>
            <p className="text-sm text-mist">
              تغذیه {summary.mealsCompleted} از {summary.mealsScheduled} · تمرین {summary.workoutsCompleted} از {summary.workoutsScheduled}
            </p>
            <p className="text-sm text-mist">رد {summary.skipped} · جابه‌جا {summary.rescheduled} · ناتمام {summary.partial}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function CalendarPage() {
  const { data } = useApp()
  const [selected, setSelected] = useState<string | null>(null)
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const days = [...new Set(rows.map((row) => row.activity.localDate))].sort()
  const shown = selected ?? days[0]
  const detail = rows.filter((row) => row.activity.localDate === shown).sort(compareBySchedule)
  const calendarDays = days.map((day) => {
    const summary = summarize(rows, day, day)
    return { day, label: calendarDayLabel(summary.percent) }
  })
  return (
    <section>
      <h1 className="text-2xl font-bold">تقویم</h1>
      <CalendarView days={calendarDays} shown={shown} onSelect={setSelected} detail={detail} />
    </section>
  )
}

export function MorePage() {
  const { refresh } = useApp()
  const [message, setMessage] = useState("بسته برنامه را از رایانه وارد کنید. تا تأیید نکنید، چیزی ذخیره نمی‌شود.")
  const [preview, setPreview] = useState<{ title: string; start: string; end: string; meals: number; workouts: number; images: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [storage, setStorage] = useState("وضعیت نگهداری دائمی هنوز پرسیده نشده است.")
  const [diag, setDiag] = useState("در حال خواندن وضعیت حافظه...")
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
      setMessage("بسته بررسی شد. تا تأیید نکنید ذخیره نمی‌شود.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ورود برنامه انجام نشد.")
    }
  }
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">مدیریت</h1>
        <Link to="/" className="text-sm text-mint">
          بازگشت
        </Link>
      </div>
      <label className="block min-h-11 rounded-2xl bg-mint px-4 py-3 text-center font-bold text-ink">
        بررسی بسته برنامه
        <input className="hidden" type="file" accept=".zip,application/zip" onChange={(event) => onPlan(event.target.files?.[0])} />
      </label>
      {preview ? <ImportPreview {...preview} /> : null}
      {preview ? (
        <button
          className="min-h-11 w-full rounded-2xl bg-card"
          onClick={async () => {
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
          }}
        >
          تأیید و ذخیره
        </button>
      ) : null}
      <button
        className="min-h-11 w-full rounded-2xl bg-card"
        onClick={async () => {
          await download("progress.json", exportProgress())
        }}
      >
        خروجی پیشرفت
      </button>
      <button
        className="min-h-11 w-full rounded-2xl bg-card"
        onClick={async () => {
          await download("phone-backup.zip", exportBackup())
          showStorage(await storageReport())
        }}
      >
        خروجی پشتیبان
      </button>
      <label className="block min-h-11 rounded-2xl bg-card px-4 py-3 text-center">
        بازیابی پشتیبان
        <input
          className="hidden"
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) setRestoreFile(file)
          }}
        />
      </label>
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
      <button
        className="min-h-11 w-full rounded-2xl bg-card"
        onClick={async () => {
          const result = await requestPersistentStorage()
          setStorage(result === null ? "این مرورگر درخواست نگهداری دائمی ندارد." : result ? "مرورگر نگهداری را پذیرفت. این تضمین حذف نشدن داده نیست." : "مرورگر نگهداری دائمی را نداد. پشتیبان بگیرید.")
        }}
      >
        درخواست نگهداری داده
      </button>
      {error ? <ErrorState message={error} /> : <p className="rounded-3xl bg-card p-4 text-sm leading-7 text-mist">{message}</p>}
      <BackupStatus text={diag} />
      <SyncStatus text={storage} />
    </section>
  )
}

function MissingPlan() {
  return (
    <EmptyState>
      <p>از بخش مدیریت یک بسته ZIP را وارد کنید.</p>
      <Link to="/more" className="mt-4 inline-flex min-h-11 items-center rounded-2xl bg-mint px-4 font-bold text-ink">
        رفتن به مدیریت
      </Link>
    </EmptyState>
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

function shift(day: string, amount: number): string {
  const value = new Date(day + "T12:00:00Z")
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function monthLast(day: string): string {
  const [year, month] = day.split("-").map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${day.slice(0, 8)}${String(last).padStart(2, "0")}`
}
