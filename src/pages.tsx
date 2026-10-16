import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { confirmPendingPlan, exportBackup, exportProgress, inspectPlanZip, requestPersistentStorage, restoreBackup, storageReport } from "./db"
import { ActivityCard, BackupStatus, CalendarView, ConfirmationDialog, EmptyState, ErrorState, ExerciseCard, ImportPreview, MealCard, ProgressRing, SyncStatus } from "./components"
import { annotate, calendarDayLabel, compareBySchedule, mediaUrl, monthCells, nutritionRollup, persianDigits, summarize } from "./logic"
import { useApp } from "./state"

export function TodayPage() {
  const { data, today } = useApp()
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const todayRows = rows.filter((row) => row.activity.localDate === today).sort(compareBySchedule)
  const summary = summarize(rows, today, today)
  const macros = nutritionRollup(todayRows)
  const nextMeal = todayRows.find((row) => row.activity.kind === "meal" && row.status === "pending")
  const workout = todayRows.find((row) => row.activity.kind === "workout")
  return (
    <section>
      <p className="text-sm text-mist">{today}</p>
      <h1 className="mt-1 text-2xl font-bold text-paper">{data.plan.title}</h1>
      <div className="mt-4 flex items-center gap-4 rounded-3xl bg-card p-4">
        <ProgressRing percent={summary.percent} />
        <div>
          <p className="text-lg font-bold">امروز</p>
          <p className="text-sm leading-7 text-mist">
            {summary.percent === null ? "برای امروز فعالیتی نیست" : `${persianDigits(summary.completed)} انجام‌شده از ${persianDigits(summary.scheduled)}`}
          </p>
        </div>
      </div>
      {macros.available ? (
        <div className="mt-3 space-y-2">
          <MacroLine label="کالری" consumed={macros.consumed.calories} planned={macros.planned.calories} unit="kcal" />
          <MacroLine label="پروتئین" consumed={macros.consumed.protein} planned={macros.planned.protein} unit="گرم" />
          <MacroLine label="کربوهیدرات" consumed={macros.consumed.carbs} planned={macros.planned.carbs} unit="گرم" />
          <MacroLine label="چربی" consumed={macros.consumed.fat} planned={macros.planned.fat} unit="گرم" />
        </div>
      ) : (
        <p className="mt-3 rounded-3xl bg-card p-4 text-sm leading-7 text-mist">کالری و درشت‌مغذی در این برنامه ثبت نشده است. عدد ساخته نمی‌شود.</p>
      )}
      <div className="mt-3 space-y-2">
        <div className="rounded-3xl bg-card p-4">
          <p className="text-sm text-mist">وعده بعدی</p>
          <p className="font-bold">{nextMeal ? `${nextMeal.scheduledTime ?? ""} ${nextMeal.activity.title}` : "وعده بازی نمانده"}</p>
        </div>
        <div className="rounded-3xl bg-card p-4">
          <p className="text-sm text-mist">تمرین امروز</p>
          <p className="font-bold">{workout ? workout.activity.title : "تمرینی برای امروز نیست"}</p>
        </div>
      </div>
      <h2 className="mb-2 mt-5 text-lg font-bold">برنامه امروز</h2>
      <div className="space-y-3">
        {todayRows.map((row) => (
          <ActivityCard key={row.activity.activityId} row={row} />
        ))}
        {todayRows.length === 0 && <p className="rounded-3xl bg-card p-4 text-sm text-mist">برای امروز فعالیتی نیست.</p>}
      </div>
    </section>
  )
}

function MacroLine({ label, consumed, planned, unit }: { label: string; consumed: number | null; planned: number | null; unit: string }) {
  if (planned == null) return null
  const done = consumed ?? 0
  const width = Math.max(0, Math.min(100, (done / planned) * 100))
  return (
    <div className="rounded-2xl bg-card p-3">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-mist">
          {persianDigits(done)} / {persianDigits(planned)} {unit}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-mint" style={{ width: `${width}%` }} />
      </div>
    </div>
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
    return { day: day.slice(8), percent: summary.percent }
  })
  return (
    <section>
      <h1 className="text-2xl font-bold">پیشرفت</h1>
      <div className="mt-4 h-40 rounded-3xl bg-card p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <XAxis dataKey="day" stroke="#98A7B2" />
            <YAxis hide domain={[0, 100]} />
            <Bar dataKey="percent" fill="#20E3A2" radius={8} />
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
      <p className="mt-4 rounded-3xl bg-card p-4 text-sm leading-7 text-mist">ستون خالی یعنی فعالیتی برای محاسبه نبود، از جمله روز استراحت. وزن بدن ذخیره نمی‌شود و نمودار وزن ساخته نمی‌شود.</p>
    </section>
  )
}

export function CalendarPage() {
  const { data } = useApp()
  const [selected, setSelected] = useState<string | null>(null)
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const days = [...new Set(rows.map((row) => row.activity.localDate))].sort()
  const shown = selected ?? days[0] ?? data.plan.startDate
  const detail = rows.filter((row) => row.activity.localDate === shown).sort(compareBySchedule)
  const calendarDays = monthCells(shown).map((cell) => {
    const summary = summarize(rows, cell.date, cell.date)
    const has = rows.some((row) => row.activity.localDate === cell.date)
    return { day: cell.date, label: has ? calendarDayLabel(summary.percent) : "" }
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
      <section className="rounded-3xl bg-card p-4 text-sm leading-7">
        <h2 className="text-lg font-bold">همگام‌سازی محلی</h2>
        <p className="mt-2 text-mist">
          برنامه روی GitHub Pages با https باز می‌شود. Safari اجازه نمی‌دهد همین صفحه به یک آدرس http داخل شبکه خانه وصل شود، و گواهی خودامضا را هم قبول نمی‌کند. تا وقتی یک نام و گواهی مورد اعتماد و آزمایش روی خود آیفون نباشد، اتصال مستقیم ساخته نمی‌شود.
        </p>
        <p className="mt-2">مسیر آماده همین جابه‌جایی ZIP است: ورود برنامه، خروجی پیشرفت، پشتیبان و بازیابی.</p>
        <p className="mt-2 text-mist">نسخه ۲.۰.۰ · هنوز روی آیفون واقعی تأیید نشده</p>
      </section>
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
