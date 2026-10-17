import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { confirmPendingPlan, exportBackup, exportProgress, inspectPlanZip, requestPersistentStorage, restoreBackup, storageReport } from "./db"
import { ConfirmationDialog, ErrorState, ImportPreview } from "./components"
import { Icon } from "./icons"
import { CLOCK, annotate, compareBySchedule, mediaUrl, monthCells, nutritionRollup, persianDigits, reduceStatus, restRemaining, shamsiDateLabel, shamsiMonthLabel, shiftJalaliMonth, summarize } from "./logic"
import { useApp } from "./state"

type Row = ReturnType<typeof annotate>[number]

function dayName(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`)
  return new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" }).format(date)
}

function shift(day: string, amount: number): string {
  const value = new Date(day + "T12:00:00Z")
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function weekOf(day: string): string[] {
  const date = new Date(day + "T12:00:00Z")
  const offset = (date.getUTCDay() + 6) % 7
  const start = shift(day, -offset)
  return Array.from({ length: 7 }, (_, index) => shift(start, index))
}

function monthLast(day: string): string {
  const [year, month] = day.split("-").map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${day.slice(0, 8)}${String(last).padStart(2, "0")}`
}

function askClock(current: string | null, apply: (clock: string) => void) {
  const clock = window.prompt("ساعت جدید را به شکل HH:MM بنویسید", current ?? "18:00")
  if (clock && CLOCK.test(clock)) apply(clock)
}

function Ring({ percent }: { percent: number | null }) {
  const value = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const length = 2 * Math.PI * 46
  return (
    <div className="ring" aria-label={percent == null ? "درصدی نیست" : `${percent} درصد`}>
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="46" fill="none" stroke="#293640" strokeWidth="10" />
        {value > 0 ? <circle cx="60" cy="60" r="46" fill="none" stroke="#20E3A2" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value / 100) * length} ${length}`} /> : null}
      </svg>
      <strong>{percent == null ? "—" : persianDigits(Math.round(percent)) + "٪"}</strong>
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
    <section className="page">
      <header className="topbar">
        <div className="tools">
          <Link to="/nutrition" className="icon-btn" aria-label="جستجوی تغذیه"><Icon name="search" /></Link>
        </div>
        <div className="date-block">
          <strong>{dayName(today)}</strong>
          <span>{today}</span>
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
            <span>{nextMeal?.scheduledTime ?? ""}</span>
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
              {row.activity.title}
              <button className="ghost" onClick={() => askClock(row.scheduledTime, (clock) => mark(row.activity, "reschedule", row.activity.activityId, clock))}>جابه‌جایی</button>
            </b>
            <button className="check" aria-label={row.status === "completed" ? "برگشت" : "انجام شد"} onClick={() => mark(row.activity, row.status === "completed" ? "undo" : "complete")}>
              <i />
            </button>
          </div>
        ))}
        {todayRows.length === 0 && <p className="empty">برای امروز فعالیتی نیست.</p>}
      </div>
    </section>
  )
}

export function NutritionPage() {
  const { data, today, mark } = useApp()
  const [day, setDay] = useState(today)
  const [query, setQuery] = useState("")
  const [openSearch, setOpenSearch] = useState(false)
  if (!data?.plan) return <MissingPlan />
  const meals = annotate(
    data.activities.filter((item) => item.versionId === data.plan!.versionId && item.kind === "meal" && item.localDate === day),
    data.events,
    data.activities,
  ).sort(compareBySchedule).filter((row) => row.activity.title.includes(query.trim()))
  return (
    <section className="page">
      <header className="back-head">
        <Link to="/" className="icon-btn" aria-label="بازگشت"><Icon name="back" /></Link>
        <h1>تغذیه</h1>
        <button className="icon-btn" aria-label="جستجو" onClick={() => setOpenSearch((value) => !value)}><Icon name="search" /></button>
      </header>
      {openSearch ? <input className="search" value={query} aria-label="جستجوی وعده" onChange={(event) => setQuery(event.target.value)} /> : null}
      <div className="day-strip">
        {weekOf(day).map((item) => (
          <button key={item} className={item === day ? "on" : ""} onClick={() => setDay(item)}>{persianDigits(Number(item.slice(8)))}</button>
        ))}
      </div>
      <MacroStrip rows={meals} />
      {meals.map((meal) => {
        const image = mediaUrl(data.plan!.key, meal.activity.payload.image, data.media)
        const facts = meal.activity.payload.nutrition
        return (
          <article key={meal.activity.activityId} className="meal-card">
            <div>
              <header>
                <time>{meal.scheduledTime ?? "—"}</time>
                <b>{meal.activity.title}</b>
              </header>
              <ul>
                {(meal.activity.payload.ingredients ?? []).map((item) => (
                  <li key={item.name}>{item.name}{item.quantity ? ` ${item.quantity}` : ""}</li>
                ))}
                {(meal.activity.payload.ingredients ?? []).length === 0 && <li>مواد در برنامه نیست.</li>}
              </ul>
              <p className="sub">{facts?.calories == null ? "کالری ثبت نشده" : `${persianDigits(facts.calories)} kcal`}</p>
              <div className="actions">
                <button onClick={() => mark(meal.activity, meal.status === "completed" ? "undo" : "complete")}>{meal.status === "completed" ? "برگشت" : "انجام"}</button>
                <button onClick={() => mark(meal.activity, "skip")}>رد</button>
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

export function WorkoutPage() {
  const { data, today, mark } = useApp()
  const [mode, setMode] = useState<"day" | "all">("day")
  const [picked, setPicked] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [drafts, setDrafts] = useState<Record<string, { weight: string; reps: string }>>({})
  useEffect(() => {
    if (startedAt == null) return
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 250)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [startedAt])
  if (!data?.plan) return <MissingPlan />
  const sessions = data.activities.filter((item) => item.versionId === data.plan!.versionId && item.kind === "workout" && item.localDate === today)
  const exercises = sessions.flatMap((session) => (session.payload.exercises ?? []).map((exercise) => ({ session, exercise })))
  const current = exercises[Math.min(picked, Math.max(exercises.length - 1, 0))]
  const exercise = current?.exercise
  const setIndex = exercise
    ? exercise.sets.findIndex((item) => reduceStatus((data.events ?? []).filter((event) => event.targetId === item.set_id)) !== "completed")
    : -1
  const activeSet = exercise && setIndex >= 0 ? exercise.sets[setIndex] : exercise?.sets.at(-1)
  const draft = activeSet ? drafts[activeSet.set_id] ?? { weight: activeSet.weight ?? "", reps: activeSet.reps ?? "" } : { weight: "", reps: "" }
  const restSeconds = exercise?.rest_seconds ?? 0
  const left = startedAt == null || !restSeconds ? restSeconds : restRemaining(startedAt, restSeconds, now)
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`
  const image = exercise ? mediaUrl(data.plan.key, exercise.image, data.media) : undefined
  return (
    <section className="page">
      <div className="segment">
        <button className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>همه حرکات</button>
        <button className={mode === "day" ? "on" : ""} onClick={() => setMode("day")}>روز تمرین</button>
      </div>
      {!current ? <p className="empty">برای این حالت تمرینی نیست.</p> : mode === "day" ? (
        <>
          <div className="hero-media"><Picture src={image} label="تصویر این حرکت در برنامه نیست" /></div>
          <div className="player-card">
            <h2>{exercise?.name}</h2>
            <p className="meta">{exercise ? `ست ${persianDigits((setIndex >= 0 ? setIndex : exercise.sets.length - 1) + 1)} از ${persianDigits(exercise.sets.length)}` : ""}</p>
            {activeSet ? (
              <div className="steppers">
                <div className="stepper">
                  <button aria-label="کم کردن وزن" onClick={() => setDrafts((currentDrafts) => ({ ...currentDrafts, [activeSet.set_id]: { ...draft, weight: String(Math.max(0, (numeric(draft.weight) ?? 0) - 1)) } }))}>−</button>
                  <b>{draft.weight.trim() ? persianDigits(draft.weight) : "—"}</b>
                  <button aria-label="زیاد کردن وزن" onClick={() => setDrafts((currentDrafts) => ({ ...currentDrafts, [activeSet.set_id]: { ...draft, weight: String((numeric(draft.weight) ?? 0) + 1) } }))}>+</button>
                </div>
                <div className="stepper">
                  <button aria-label="کم کردن تکرار" onClick={() => setDrafts((currentDrafts) => ({ ...currentDrafts, [activeSet.set_id]: { ...draft, reps: String(Math.max(0, (numeric(draft.reps) ?? 0) - 1)) } }))}>−</button>
                  <b>{draft.reps.trim() ? persianDigits(draft.reps) : "—"}</b>
                  <button aria-label="زیاد کردن تکرار" onClick={() => setDrafts((currentDrafts) => ({ ...currentDrafts, [activeSet.set_id]: { ...draft, reps: String((numeric(draft.reps) ?? 0) + 1) } }))}>+</button>
                </div>
              </div>
            ) : <p className="meta">ستی در برنامه نیست.</p>}
            <button
              className="primary"
              disabled={!activeSet || !current || setIndex < 0}
              onClick={() => {
                if (!activeSet || !current) return
                const extra: Record<string, string> = {}
                if (draft.weight.trim() && draft.weight.trim() !== "—") extra.weight = draft.weight.trim()
                if (draft.reps.trim() && draft.reps.trim() !== "—") extra.reps = draft.reps.trim()
                void mark(current.session, "complete", activeSet.set_id, null, extra)
                if (restSeconds) setStartedAt(Date.now())
              }}
            >
              ثبت ست
            </button>
          </div>
          {restSeconds ? (
            <div className="rest">
              <button aria-label="شروع استراحت" onClick={() => setStartedAt(Date.now())}>{startedAt == null ? "▶" : "❚❚"}</button>
              <strong aria-live="polite">{persianDigits(clock)}</strong>
              <span>استراحت</span>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="ex-list">
        {exercises.map((item, index) => {
          const thumb = mediaUrl(data.plan!.key, item.exercise.image, data.media)
          return (
            <button key={item.exercise.exercise_id + item.session.activityId} className={index === picked ? "on" : ""} onClick={() => { setPicked(index); setMode("day") }}>
              <Picture src={thumb} label="—" />
              <span>{item.exercise.name}</span>
              <small>{persianDigits(item.exercise.sets.length)} ست</small>
            </button>
          )
        })}
      </div>
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
        <button aria-label="ماه بعد" onClick={() => setCursor(shiftJalaliMonth(cursor, 1))}>‹</button>
        <h1>{shamsiMonthLabel(cursor)}</h1>
        <button aria-label="ماه قبل" onClick={() => setCursor(shiftJalaliMonth(cursor, -1))}>›</button>
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
      <h2 className="section-label">جزئیات {shamsiDateLabel(selected)}</h2>
      {detail.map((row) => (
        <div key={row.activity.activityId} className="line">
          <span className="kind">{row.activity.kind === "workout" ? "ت" : row.activity.kind === "rest" ? "ا" : "غ"}</span>
          <b>{row.activity.title}</b>
          <time>{row.scheduledTime ?? "—"}</time>
          <button className="check" aria-label="وضعیت" onClick={() => row.activity.kind !== "rest" && mark(row.activity, row.status === "completed" ? "undo" : "complete")}>
            <i style={row.status === "completed" ? { background: "#20E3A2", borderColor: "#20E3A2" } : undefined} />
          </button>
        </div>
      ))}
      {detail.length === 0 && <p className="empty">برای این روز فعالیتی نیست.</p>}
    </section>
  )
}

export function ProgressPage() {
  const { data, today } = useApp()
  const [span, setSpan] = useState<"week" | "month" | "year">("week")
  if (!data?.plan) return <MissingPlan />
  const rows = annotate(data.activities.filter((item) => item.versionId === data.plan!.versionId), data.events, data.activities)
  const start = span === "week" ? weekOf(today)[0] : span === "month" ? today.slice(0, 8) + "01" : today.slice(0, 4) + "-01-01"
  const end = span === "week" ? shift(start, 6) : span === "month" ? monthLast(today) : today.slice(0, 4) + "-12-31"
  const length = span === "week" ? 7 : span === "month" ? Number(end.slice(8)) : 12
  const chart = Array.from({ length }, (_, index) => {
    const day = span === "year" ? `${today.slice(0, 4)}-${String(index + 1).padStart(2, "0")}-01` : shift(start, index)
    const until = span === "year" ? monthLast(day) : day
    const summary = summarize(rows, day, until)
    return { day: span === "year" ? persianDigits(index + 1) : persianDigits(Number(day.slice(8))), percent: summary.percent }
  })
  const summary = summarize(rows, start, end)
  const hasPoints = chart.some((item) => item.percent != null)
  return (
    <section className="page">
      <div className="periods">
        <button className={span === "year" ? "on" : ""} onClick={() => setSpan("year")}>سالانه</button>
        <button className={span === "month" ? "on" : ""} onClick={() => setSpan("month")}>ماهانه</button>
        <button className={span === "week" ? "on" : ""} onClick={() => setSpan("week")}>هفتگی</button>
      </div>
      <div className="chart-card">
        {hasPoints ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <XAxis dataKey="day" stroke="#98A7B2" tick={{ fontSize: 10 }} />
              <YAxis hide domain={[0, 100]} />
              <Line type="monotone" dataKey="percent" stroke="#20E3A2" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p>برای این بازه فعالیتی جهت نمودار نیست.</p>}
      </div>
      <p className="note">نمودار درصد تکمیل است، نه وزن. {summary.percent == null ? "درصدی نیست." : `${persianDigits(summary.percent)}٪`}</p>
      <div className="measures">
        {["وزن", "دور کمر", "دور بازو", "چربی بدن"].map((label) => (
          <article key={label} className="measure"><small>{label}</small><b>ثبت نشده</b></article>
        ))}
      </div>
      <section className="photo">
        <h2>عکس‌های پیشرفت</h2>
        <div className="photo-slot">افزودن عکس<br />هنوز عکسی نیست</div>
      </section>
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
  const [panel, setPanel] = useState<"plan" | "file" | "backup" | "settings" | null>(null)
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
        <div className="mark" aria-hidden="true">F</div>
        <div>
          <h1>{data?.plan?.title ?? "برنامه‌ای فعال نیست"}</h1>
          <p>{data?.plan ? `${data.plan.startDate} تا ${data.plan.endDate}` : "از ورود برنامه یک بسته ZIP بیاورید."}</p>
          <p>{data?.plan ? <em>فعال{counts ? ` | ${persianDigits(counts.workouts)} تمرین | ${persianDigits(counts.meals)} وعده` : ""}</em> : null}</p>
        </div>
      </article>
      <div className="menu">
        <button className="menu-row" onClick={() => setPanel(panel === "plan" ? null : "plan")}><Icon name="calendar" />بررسی برنامه</button>
        <label className="menu-row">ورود برنامه جدید<input className="hidden-input" type="file" accept=".zip,application/zip" onChange={(event) => onPlan(event.target.files?.[0])} /></label>
        <button className="menu-row" onClick={() => void download("progress.json", exportProgress())}><Icon name="chart" />تبادل فایل</button>
        <button className="menu-row" onClick={() => navigate("/progress")}><Icon name="chart" />گزارش‌ها</button>
        <button className="menu-row" onClick={() => setPanel(panel === "settings" ? null : "settings")}><Icon name="user" />تنظیمات</button>
        <button className="menu-row" onClick={() => setPanel(panel === "backup" ? null : "backup")}><Icon name="bell" />پشتیبان‌گیری</button>
        <button className="menu-row danger" onClick={() => setFarewell("حساب کاربری وجود ندارد. داده‌ها روی همین دستگاه می‌مانند و پاک نمی‌شوند.")}>خروج</button>
      </div>
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
          <p className="note">نسخه ۲.۰.۰. همگام‌سازی شبکه‌ای در این نسخه نیست و مسیر فایل ZIP سر جایش است.</p>
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
