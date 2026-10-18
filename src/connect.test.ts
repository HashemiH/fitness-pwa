import { describe, expect, it } from "vitest"
import { connectMessage, connectState } from "./connect"

describe("fitness connect", () => {
  it("does not call a closed transport up to date", () => {
    const state = connectState({ transportAvailable: false, authenticated: true, acknowledged: true, programLocal: "a", programRemote: "a", progressLocal: "b", progressRemote: "b" })
    expect(state).toBe("disconnected")
    expect(connectMessage(state).title).toBe("اتصال برقرار نیست")
    expect(connectMessage(state).detail).not.toContain("کاملاً به‌روز")
  })

  it("shows the success sentence only after both snapshots match", () => {
    const pending = connectState({ transportAvailable: true, authenticated: true, acknowledged: true, pendingProgress: 2, programLocal: "a", programRemote: "a", progressLocal: "b", progressRemote: "b" })
    expect(pending).toBe("syncing_progress")
    const ready = connectState({ transportAvailable: true, authenticated: true, acknowledged: true, programLocal: "a", programRemote: "a", progressLocal: "b", progressRemote: "b" })
    expect(ready).toBe("up_to_date")
    expect(connectMessage(ready).title).toBe("Fitness Program is Up to Date")
    expect(connectMessage(ready).detail).toBe("برنامه و اطلاعات شما کاملاً به‌روز هستند")
  })
})
