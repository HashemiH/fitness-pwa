import { describe, expect, it } from "vitest"
import { ackLan, exchangeLan, parsePairUrl } from "./lan"

describe("lan address", () => {
  it("accepts only an https pairing address and rejects a token in the link", () => {
    const code = "a".repeat(32)
    expect(parsePairUrl(`https://192.168.1.20:8443/pair/${code}`)).toEqual({
      endpoint: "https://192.168.1.20:8443",
      code,
    })
    expect(parsePairUrl(`http://192.168.1.20:8443/pair/${code}`)).toBeNull()
    expect(parsePairUrl(`https://192.168.1.20:8443/pair/${code}?token=secret`)).toBeNull()
  })
})

describe("lan exchange", () => {
  it("does not treat a conflicting acknowledgement as up to date", async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(String(url))
      if (String(url).endsWith("/sync/ack")) {
        return new Response(JSON.stringify({ up_to_date: false, pending: 1 }), { status: 200 })
      }
      return new Response(JSON.stringify({ program_hash: "abc", revision: "v1", plan: null, activities: null, media: [], stored_event_ids: ["evt1"], inserted: 1, duplicates: 0 }), { status: 200 })
    }) as typeof fetch
    const exchanged = await exchangeLan({ endpoint: "https://192.168.1.20:8443", token: "t", programHash: "", media: {}, events: [], fetchImpl })
    expect(exchanged.stored_event_ids).toEqual(["evt1"])
    const acked = await ackLan({ endpoint: "https://192.168.1.20:8443", token: "t", programHash: "abc", eventIds: ["evt1"], conflicts: 1, fetchImpl })
    expect(acked.up_to_date).toBe(false)
    expect(calls).toHaveLength(2)
  })
})