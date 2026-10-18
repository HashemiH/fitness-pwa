import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  aggregateMealCategories,
  aggregateWorkoutSets,
  calculateDailyTrend,
  calculateNutritionAdherence,
  calculateOverallAdherence,
  calculateWorkoutAdherence,
  compareReportingPeriods,
  findBestAndWorstDays,
  getEligibleActivities,
  periodDays,
  previousAnchor,
  weekdayName,
  zoneClock,
  type DayPoint,
  type PeriodDelta,
  type ReportSpan,
} from "./adherence"
import { Icon } from "./icons"
import { annotate, persianDigits, shamsiDateLabel, toJalali, type Annotated } from "./logic"
import { useApp } from "./state"

const SPANS: { id: ReportSpan; label: string }[] = [
  { id: "day", label: "روزانه" },
  { id: "week", label: "هفتگی" },
  { id: "month", label: "ماهانه" },
]

const CAPTION: Record<ReportSpan, string> = {
  day: "انجام برنامه این روز",
  week: "انجام برنامه این هفته",
  month: "انجام برنامه این ماه",
}

const COMPARE: Record<ReportSpan, string> = {
  day: "نسبت به روز قبل",
  week: "نسبت به هفته قبل",
  month: "نسبت به ماه قبل",
}

const TREND: Record<ReportSpan, string> = {
  day: "روند فعالیت‌های امروز",
  week: "روند عملکرد روزانه",
  month: "روند روزهای ماه",
}

const VERSUS: Record<ReportSpan, string> = {
  day: "مقایسه با روز قبل",
  week: "مقایسه با هفته قبل",
  month: "مقایسه با ماه قبل",
}

function storedSpan(): ReportSpan {
  try {
    const value = localStorage.getItem("fitness-progress-span")
    if (value === "day" || value === "week" || value === "month") return value
  } catch {
    /* private mode */
  }
  return "week"
}

function pct(value: number | null): string {
  return value == null ? "—" : `${persianDigits(value)}٪`
}

function deltaLabel(delta: PeriodDelta | null): string {
  if (!delta) return ""
  const sign = delta.points > 0 ? "+" : delta.points < 0 ? "−" : ""
  return `${sign}${persianDigits(Math.abs(delta.points))}٪`
}

function countLine(completed: number, eligible: number, unit: string): string {
  if (eligible === 0) return "موردی سررسید نشده"
  return `${persianDigits(completed)} از ${persianDigits(eligible)} ${unit}`
}

function statusLabel(row: Annotated): string {
  if (row.partial) return "ناتمام"
  if (row.status === "completed") return "انجام‌شده"
  if (row.status === "skipped") return "رد شده"
  if (row.status === "rescheduled") return "جابه‌جا شده"
  return "مانده"
}

function Ring({ percent }: { percent: number | null }) {
  const value = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const length = 2 * Math.PI * 46
  return (
    <div className="adh-ring" aria-label={percent == null ? "درصدی نیست" : `${percent} درصد`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="46" />
        {value > 0 ? (
          <circle className="on" cx="60" cy="60" r="46" strokeDasharray={`${(value / 100) * length} ${length}`} />
        ) : null}
      </svg>
      <strong>{pct(percent)}</strong>
    </div>
  )
}

function MoreMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Bars({ points, labels, onPick }: { points: { key: string; percent: number | null; label: string; aria?: string }[]; labels: boolean; onPick: (key: string) => void }) {
  return (
    <div className={points.length > 10 ? "adh-chart dense" : "adh-chart"}>
      <div className="adh-plot">
        <div className="adh-axis" aria-hidden="true">
          {["۱۰۰٪", "۷۵٪", "۵۰٪", "۲۵٪", "۰٪"].map((mark) => <span key={mark}>{mark}</span>)}
        </div>
        <div className="adh-bars">
          {points.map((point) => (
            <button key={point.key} type="button" aria-label={point.aria ?? point.label} onClick={() => onPick(point.key)}>
              <span className="track">
                {point.percent != null ? (
                  <i className={point.percent < 70 ? "low" : ""} style={{ height: `${Math.max(point.percent, 4)}%` }}>
                    {labels ? <b>{pct(point.percent)}</b> : null}
                  </i>
                ) : null}
              </span>
              <small>{point.label}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ProgressPage() {
  const { data, today } = useApp()
  const [span, setSpan] = useState<ReportSpan>(storedSpan)
  const [sheet, setSheet] = useState<"meals" | "workouts" | "overall" | string | null>(null)
  const clock = data?.plan ? zoneClock(data.plan.timezone) : "00:00"
  const model = useMemo(() => {
    if (!data?.plan) return null
    const rows = annotate(
      data.activities.filter((item) => item.versionId === data.plan!.versionId),
      data.events,
      data.activities,
    )
    const days = periodDays(span, today)
    const earlier = periodDays(span, previousAnchor(span, today))
    const eligible = getEligibleActivities(rows, days[0], days[days.length - 1], today, clock)
    const previous = getEligibleActivities(rows, earlier[0], earlier[earlier.length - 1], today, clock)
    const overall = calculateOverallAdherence(eligible)
    const nutrition = calculateNutritionAdherence(eligible)
    const training = calculateWorkoutAdherence(eligible)
    const trend = calculateDailyTrend(rows, days, today, clock)
    return {
      rows,
      days,
      eligible,
      overall,
      nutrition,
      training,
      trend,
      ends: findBestAndWorstDays(trend),
      deltas: {
        overall: compareReportingPeriods(overall.percent, calculateOverallAdherence(previous).percent),
        nutrition: compareReportingPeriods(nutrition.percent, calculateNutritionAdherence(previous).percent),
        training: compareReportingPeriods(training.percent, calculateWorkoutAdherence(previous).percent),
      },
      meals: aggregateMealCategories(eligible),
      workouts: aggregateWorkoutSets(eligible, data.events),
    }
  }, [clock, data, span, today])

  if (!data?.plan || !model) {
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

  function choose(next: ReportSpan) {
    setSpan(next)
    setSheet(null)
    try {
      localStorage.setItem("fitness-progress-span", next)
    } catch {
      /* ignore */
    }
  }

  const dayBars = model.eligible.map((row) => ({
    key: row.activity.activityId,
    label: row.activity.title,
    percent: row.status === "completed" ? 100 : row.activity.kind === "workout" && row.setsTotal > 0 ? Math.round((100 * row.setsDone) / row.setsTotal) : 0,
  }))
  const periodBars = model.trend.map((point) => {
    const day = toDay(point.date)
    const showDay = day === 1 || day % 5 === 0
    return {
      key: point.date,
      label: span === "month" ? (showDay ? persianDigits(day) : "") : weekdayName(point.date),
      aria: span === "month" ? `روز ${persianDigits(day)}` : weekdayName(point.date),
      percent: point.percent,
    }
  })

  function openDay(point: DayPoint | null) {
    if (point) setSheet(point.date)
  }

  const pickedDay = model.days.includes(sheet ?? "") ? sheet : null
  const dayRows = pickedDay ? getEligibleActivities(model.rows, pickedDay, pickedDay, today, clock) : []

  return (
    <section className="page adhere">
      <h1 className="adh-title">پیشرفت</h1>
      <div className="adh-tabs" role="tablist" aria-label="بازه گزارش">
        {SPANS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={span === item.id} className={span === item.id ? "on" : ""} onClick={() => choose(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <article className="adh-hero">
        <div>
          <Ring percent={model.overall.percent} />
          <p className="adh-caption">{CAPTION[span]}</p>
        </div>
        <div className="adh-change">
          {model.deltas.overall ? (
            <strong className={model.deltas.overall.direction}>
              <i>{model.deltas.overall.direction === "down" ? "↓" : model.deltas.overall.direction === "up" ? "↑" : "•"}</i>
              {deltaLabel(model.deltas.overall)}
            </strong>
          ) : (
            <strong className="flat">—</strong>
          )}
          <p>{model.deltas.overall ? COMPARE[span] : "داده کافی برای مقایسه وجود ندارد"}</p>
        </div>
      </article>

      <div className="adh-metrics">
        <button type="button" onClick={() => setSheet("workouts")}>
          <span><i className="adh-ico"><Icon name="dumbbell" filled /></i>تمرین</span>
          <b>{pct(model.training.percent)}</b>
          <small>{countLine(model.training.completed, model.training.eligible, "جلسه")}</small>
        </button>
        <button type="button" onClick={() => setSheet("meals")}>
          <span><i className="adh-ico"><Icon name="meal" filled /></i>تغذیه</span>
          <b>{pct(model.nutrition.percent)}</b>
          <small>{countLine(model.nutrition.completed, model.nutrition.eligible, "وعده")}</small>
        </button>
        <button type="button" onClick={() => setSheet("overall")}>
          <span><i className="adh-ico"><Icon name="check" /></i>کل برنامه</span>
          <b>{pct(model.overall.percent)}</b>
          <small>{countLine(model.overall.completed, model.overall.eligible, "مورد")}</small>
        </button>
      </div>

      <article className="adh-card">
        <header>
          <b>{TREND[span]}</b>
          <button type="button" aria-label="جزئیات بازه" onClick={() => setSheet("overall")}><MoreMark /></button>
        </header>
        {span === "day" ? (
          dayBars.length ? <Bars points={dayBars} labels onPick={(key) => setSheet(model.eligible.find((row) => row.activity.activityId === key)?.activity.localDate ?? "overall")} /> : <p className="adh-empty">برای این روز فعالیت سررسیدشده‌ای نیست.</p>
        ) : (
          <Bars points={periodBars} labels={span === "week"} onPick={(key) => setSheet(key)} />
        )}
      </article>

      <article className="adh-card">
        <header>
          <b>{VERSUS[span]}</b>
          <button type="button" aria-label="جزئیات مقایسه" onClick={() => setSheet("overall")}><MoreMark /></button>
        </header>
        {model.deltas.overall || model.deltas.training || model.deltas.nutrition ? (
          <div className="adh-compare">
            <p className="adh-note">اختلاف به واحد درصد است</p>
            {([
              ["training", "تمرینات", "dumbbell"],
              ["nutrition", "تغذیه", "meal"],
              ["overall", "کل برنامه", "check"],
            ] as const).map(([key, label, icon]) => (
              <div key={key}>
                <span><Icon name={icon} />{label}</span>
                <i><b style={{ width: `${model[key].percent ?? 0}%` }} /></i>
                <em className={model.deltas[key]?.direction ?? "flat"}>{model.deltas[key] ? deltaLabel(model.deltas[key]) : "—"}</em>
              </div>
            ))}
          </div>
        ) : (
          <p className="adh-empty">داده کافی برای مقایسه وجود ندارد</p>
        )}
      </article>

      <article className="adh-card">
        <header><b>بهترین و ضعیف‌ترین روزها</b></header>
        {model.ends.best ? (
          <div className="adh-days">
            <button type="button" className="best" onClick={() => openDay(model.ends.best)}>
              <i className="adh-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M8 4h8v3a4 4 0 0 1-8 0zM8 5H5.5A2.5 2.5 0 0 0 8 9.2M16 5h2.5A2.5 2.5 0 0 1 16 9.2M9 14h6M10 20h4M12 14v6" /></svg>
              </i>
              <span>
                <em>بهترین روز <b>↑</b></em>
                <strong>{weekdayName(model.ends.best.date)}</strong>
                <b>{pct(model.ends.best.percent)}</b>
              </span>
            </button>
            {model.ends.worst ? (
              <button type="button" className="worst" onClick={() => openDay(model.ends.worst)}>
                <i className="adh-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 5v12M7 13l5 5 5-5" /></svg>
                </i>
                <span>
                  <em>ضعیف‌ترین روز <b>↓</b></em>
                  <strong>{weekdayName(model.ends.worst.date)}</strong>
                  <b>{pct(model.ends.worst.percent)}</b>
                </span>
              </button>
            ) : (
              <p className="adh-empty">روز دیگری برای مقایسه نیست.</p>
            )}
          </div>
        ) : (
          <p className="adh-empty">هنوز روز سررسیدشده‌ای برای مقایسه نیست.</p>
        )}
      </article>

      {sheet ? (
        <div className="adh-mask" onClick={() => setSheet(null)}>
          <div className="adh-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="close" onClick={() => setSheet(null)}>بستن</button>
            {sheet === "meals" ? <MealSheet rows={model.meals} /> : null}
            {sheet === "workouts" ? <WorkoutSheet data={model.workouts} /> : null}
            {sheet === "overall" ? <ActivitySheet title="فعالیت‌های سررسیدشده" rows={model.eligible} overall={model.overall.percent} nutrition={model.nutrition.percent} training={model.training.percent} /> : null}
            {pickedDay ? (
              <ActivitySheet
                title={shamsiDateLabel(pickedDay)}
                rows={dayRows}
                overall={calculateOverallAdherence(dayRows).percent}
                nutrition={calculateNutritionAdherence(dayRows).percent}
                training={calculateWorkoutAdherence(dayRows).percent}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function toDay(iso: string): number {
  return toJalali(iso).day
}

function MealSheet({ rows }: { rows: ReturnType<typeof aggregateMealCategories> }) {
  return (
    <div>
      <h2>پایبندی وعده‌ها</h2>
      <p className="adh-empty">انجام‌شدن یعنی همان وعده علامت خورده است، نه مطابقت دقیق کالری.</p>
      {rows.length === 0 ? <p className="adh-empty">وعدهٔ سررسیدشده‌ای نیست.</p> : rows.map((row) => (
        <p key={row.category} className="adh-line"><b>{row.category}</b><span>{countLine(row.completed, row.eligible, "وعده")}</span><em>{pct(row.percent)}</em></p>
      ))}
      <p className="adh-links"><Link to="/nutrition">رفتن به تغذیه</Link></p>
    </div>
  )
}

function WorkoutSheet({ data }: { data: ReturnType<typeof aggregateWorkoutSets> }) {
  return (
    <div>
      <h2>پایبندی تمرین</h2>
      <p className="adh-line"><b>جلسه‌ها</b><span>{countLine(data.sessions.completed, data.sessions.eligible, "جلسه")}</span><em>{pct(data.sessions.percent)}</em></p>
      <p className="adh-line"><b>ناتمام</b><span>{persianDigits(data.partial)}</span></p>
      <p className="adh-line"><b>رد شده</b><span>{persianDigits(data.skipped)}</span></p>
      <p className="adh-line"><b>مانده</b><span>{persianDigits(data.pending)}</span></p>
      <p className="adh-line"><b>ست‌ها</b><span>{data.setsScheduled ? `${persianDigits(data.setsCompleted)} از ${persianDigits(data.setsScheduled)}` : "ستی در برنامه نیست"}</span><em>{pct(data.setPercent)}</em></p>
      {data.records.length ? data.records.map((item, index) => (
        <p key={`${item.name}-${index}`} className="adh-line"><b>{item.name}</b><span>{[item.reps ? `تکرار ${item.reps}` : "", item.weight ? `وزن ${item.weight}` : "", item.duration ? `زمان ${item.duration}` : ""].filter(Boolean).join(" · ")}</span></p>
      )) : <p className="adh-empty">وزنی در ثبت‌ها نیست. ست انجام‌نشده از روی برنامه کامل حساب نمی‌شود.</p>}
      <p className="adh-links"><Link to="/workout">رفتن به تمرین</Link></p>
    </div>
  )
}

function ActivitySheet({ title, rows, overall, nutrition, training }: { title: string; rows: Annotated[]; overall: number | null; nutrition: number | null; training: number | null }) {
  const skipped = rows.filter((row) => row.status === "skipped").length
  const partial = rows.filter((row) => row.partial).length
  const pending = rows.filter((row) => row.status === "pending" && !row.partial).length
  const completed = rows.filter((row) => row.status === "completed").length
  const moved = rows.filter((row) => row.status === "rescheduled").length
  return (
    <div>
      <h2>{title}</h2>
      <p className="adh-line"><b>کل</b><em>{pct(overall)}</em></p>
      <p className="adh-line"><b>تغذیه</b><em>{pct(nutrition)}</em></p>
      <p className="adh-line"><b>تمرین</b><em>{pct(training)}</em></p>
      <p className="adh-line"><b>انجام‌شده</b><span>{persianDigits(completed)}</span></p>
      <p className="adh-line"><b>رد شده</b><span>{persianDigits(skipped)}</span></p>
      <p className="adh-line"><b>جابه‌جا شده</b><span>{persianDigits(moved)}</span></p>
      <p className="adh-line"><b>ناتمام</b><span>{persianDigits(partial)}</span></p>
      <p className="adh-line"><b>مانده</b><span>{persianDigits(pending)}</span></p>
      {rows.map((row) => (
        <p key={row.activity.activityId} className="adh-line">
          <b>{row.scheduledTime ?? "—"} {row.activity.title}</b>
          <span>{statusLabel(row)}</span>
        </p>
      ))}
      {rows.length === 0 ? <p className="adh-empty">فعالیت سررسیدشده‌ای در این روز نیست.</p> : null}
      <p className="adh-links"><Link to="/nutrition">تغذیه</Link><Link to="/workout">تمرین</Link></p>
    </div>
  )
}
