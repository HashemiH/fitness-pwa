import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { loadState, record } from "./db"
import { localDate, type Activity } from "./logic"

type Loaded = Awaited<ReturnType<typeof loadState>>

type FitnessContext = {
  data: Loaded | null
  refresh: () => void
  today: string
  mark: (activity: Activity, operation: "complete" | "skip" | "undo" | "reschedule", targetId?: string, notes?: string | null) => Promise<void>
}

export const AppState = createContext<FitnessContext | null>(null)

export function useFitness(): FitnessContext {
  const [data, setData] = useState<Loaded | null>(null)
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((value) => value + 1), [])
  useEffect(() => {
    let urls: string[] = []
    let cancel = false
    loadState().then((loaded) => {
      if (cancel) {
        for (const url of loaded.media.values()) URL.revokeObjectURL(url)
        return
      }
      urls = [...loaded.media.values()]
      setData(loaded)
    })
    return () => {
      cancel = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [nonce])
  const today = data?.plan ? localDate(data.plan.timezone) : localDate("Asia/Tehran")
  async function mark(activity: Activity, operation: "complete" | "skip" | "undo" | "reschedule", targetId?: string, notes?: string | null) {
    await record(activity, operation, targetId ?? activity.activityId, notes ?? null)
    refresh()
  }
  return { data, refresh, today, mark }
}

export function useApp() {
  const value = useContext(AppState)
  if (!value) throw new Error("app state")
  return value
}
