import { useEffect, useRef, useState } from "react"
import { connectMessage, type ConnectState } from "./connect"
import { applyLanProgram, deviceId, lanCredential, markLanSynced, pendingLanEvents, saveLanCredential } from "./db"
import { ackLan, exchangeLan, parsePairUrl, postLan } from "./lan"
import type { IncomingActivity } from "./programMerge"

export function ConnectPanel() {
  const [state, setState] = useState<ConnectState>("disconnected")
  const [detail, setDetail] = useState(connectMessage("disconnected").detail)
  const [computer, setComputer] = useState("—")
  const [revision, setRevision] = useState("—")
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState("ثبت نشده")
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [cameraOn, setCameraOn] = useState(false)
  const camera = useRef<HTMLVideoElement>(null)
  const busy = useRef(false)
  const copy = connectMessage(state)

  async function refreshCounts() {
    const saved = await lanCredential()
    const waiting = await pendingLanEvents()
    setPending(waiting.length)
    setLastSync(saved.lastSync || "ثبت نشده")
    setRevision(saved.programHash ? saved.programHash.slice(0, 12) : "—")
  }

  function explain(caught: unknown): string {
    const message = caught instanceof Error ? caught.message : ""
    if (/fetch|network|cert|ssl|failed/i.test(message)) {
      return "ارتباط امن برقرار نشد. گواهی محلی را روی آیفون نصب کنید و اعتماد کامل را روشن کنید. هر دو دستگاه باید روی یک وای‌فای باشند."
    }
    return message || "همگام‌سازی انجام نشد."
  }

  async function syncNow() {
    while (busy.current) await new Promise((resolve) => setTimeout(resolve, 200))
    const saved = await lanCredential()
    if (!saved.endpoint || !saved.token) {
      setState("disconnected")
      setDetail(connectMessage("disconnected").detail)
      return
    }
    busy.current = true
    setError("")
    const quiet = state === "up_to_date"
    try {
      if (!quiet) {
        setState("connecting")
        setDetail(connectMessage("connecting").detail)
      }
      const health = await fetch(`${saved.endpoint}/health`, { headers: { "X-Fitness-Client": "iphone" } })
      if (!health.ok) throw new Error("رایانه روی این وای‌فای پاسخ نداد.")
      const about = await health.json()
      setComputer(typeof about.name === "string" && about.name ? about.name : "ویندوز")
      const waiting = await pendingLanEvents()
      setPending(waiting.length)
      if (!quiet || waiting.length) {
        const next = waiting.length ? "syncing_progress" : "checking"
        setState(next)
        setDetail(connectMessage(next).detail)
      }
      const id = await deviceId()
      const exchanged = await exchangeLan({
        endpoint: saved.endpoint,
        token: saved.token,
        programHash: saved.programHash,
        media: saved.media,
        events: waiting.map((event) => ({
          event_id: event.eventId,
          device_id: id,
          entity_id: event.targetId,
          entity_type: event.targetId.includes("/set/") ? "set" : "activity",
          operation: event.operation,
          timestamp: event.occurredAt,
          schema_version: 1,
          plan_id: event.planId,
          version_id: event.versionId,
          payload: event.payload ?? {},
          notes: event.notes,
        })),
      })
      let conflicts: string[] = []
      if (exchanged.plan && exchanged.activities) {
        setState("applying")
        setDetail(connectMessage("applying").detail)
        conflicts = await applyLanProgram({
          plan: exchanged.plan,
          activities: exchanged.activities as IncomingActivity[],
          media: exchanged.media,
        })
      }
      setState("verifying")
      setDetail(connectMessage("verifying").detail)
      const acked = await ackLan({
        endpoint: saved.endpoint,
        token: saved.token,
        programHash: exchanged.program_hash,
        eventIds: exchanged.stored_event_ids,
        conflicts: conflicts.length,
      })
      if (acked.up_to_date) {
        const media = Object.fromEntries(exchanged.media.map((item) => [item.path, item.sha256]))
        await markLanSynced(exchanged.stored_event_ids, exchanged.program_hash, media)
        setState("up_to_date")
        setDetail(connectMessage("up_to_date").detail)
      } else if (conflicts.length) {
        setState("conflict")
        setDetail(connectMessage("conflict").detail)
      } else {
        setState("failed")
        setDetail("تأیید پایانی نرسید. چیزی به‌روز حساب نشد.")
      }
      setRevision(exchanged.revision || exchanged.program_hash.slice(0, 12))
    } catch (caught) {
      setState("failed")
      const message = explain(caught)
      setError(message)
      setDetail(message)
    } finally {
      busy.current = false
    }
    await refreshCounts()
  }

  const syncRef = useRef(syncNow)
  syncRef.current = syncNow

  useEffect(() => {
    let alive = true
    void (async () => {
      await refreshCounts()
      const saved = await lanCredential()
      if (alive && saved.endpoint && saved.token) await syncRef.current()
    })()
    const retry = () => {
      void syncRef.current()
    }
    window.addEventListener("online", retry)
    const timer = window.setInterval(() => {
      void lanCredential().then((saved) => {
        if (saved.endpoint && saved.token) retry()
      })
    }, 20000)
    return () => {
      alive = false
      window.removeEventListener("online", retry)
      window.clearInterval(timer)
    }
  }, [])

  async function useLink(value: string) {
    const parsed = parsePairUrl(value)
    if (!parsed) {
      setError("آدرس باید https و بدون رمز دائمی باشد.")
      return
    }
    setState("connecting")
    setDetail(connectMessage("connecting").detail)
    setError("")
    try {
      const look = await fetch(`${parsed.endpoint}/health`, { headers: { "X-Fitness-Client": "iphone" } })
      if (!look.ok) throw new Error("رایانه روی این وای‌فای پاسخ نداد.")
      const about = await look.json()
      setComputer(typeof about.name === "string" && about.name ? about.name : "ویندوز")
      const joined = await postLan(parsed.endpoint, `/pair/${parsed.code}/join`, { device_id: await deviceId(), device_name: "آیفون" })
      if (!joined.ok) throw new Error("درخواست جفت‌سازی فرستاده نشد.")
      setState("authenticating")
      setDetail(connectMessage("authenticating").detail)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const result = await postLan(parsed.endpoint, `/pair/${parsed.code}/result`, {})
        const body = await result.json()
        if (body.token) {
          await saveLanCredential(parsed.endpoint, body.token)
          await syncNow()
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      throw new Error("ویندوز این گوشی را تأیید نکرد.")
    } catch (caught) {
      setState("failed")
      setError(explain(caught))
    }
  }

  async function scan() {
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]> } }).BarcodeDetector
    const video = camera.current
    if (!Detector || !navigator.mediaDevices?.getUserMedia || !video) {
      setError("دوربین در این مرورگر کد را نمی‌خواند. آدرس QR را در کادر بچسبانید.")
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    video.srcObject = stream
    setCameraOn(true)
    try {
      await video.play()
      const detector = new Detector({ formats: ["qr_code"] })
      let found = ""
      for (let attempt = 0; attempt < 40 && !found; attempt += 1) {
        const codes = await detector.detect(video)
        found = codes.find((item) => item.rawValue)?.rawValue ?? ""
        if (!found) await new Promise((resolve) => setTimeout(resolve, 250))
      }
      if (!found) {
        setError("کدی دیده نشد.")
        return
      }
      await useLink(found)
    } finally {
      stream.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      setCameraOn(false)
    }
  }

  return (
    <div className="panel">
      <h2 className={state === "up_to_date" ? "connect-ok" : undefined}>{copy.title}</h2>
      <p className="note">{detail}</p>
      <p className="note">رایانه: {computer}</p>
      <p className="note">نسخه: {revision}</p>
      <p className="note">آخرین همگام‌سازی: {lastSync}</p>
      <p className="note">در انتظار فرستادن: {pending}</p>
      <video ref={camera} hidden={!cameraOn} muted playsInline />
      <button className="primary" type="button" onClick={() => void scan()}>خواندن کد</button>
      <button className="ghost" type="button" onClick={() => void syncNow()}>تلاش دوباره</button>
      <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="آدرس https کد" />
      <button className="ghost" type="button" onClick={() => void useLink(link)}>اتصال با آدرس</button>
      {error ? <p className="note">{error}</p> : null}
      <p className="note">اگر دوربین کد را نخواند، آدرس زیر کد را بچسبانید. ورود ZIP همچنان در ابزارهای همین صفحه است. وقتی برنامه بسته است، همگام‌سازی پس‌زمینه تضمین نمی‌شود.</p>
    </div>
  )
}
