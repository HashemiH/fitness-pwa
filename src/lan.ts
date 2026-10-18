export type LanExchange = {
  program_hash: string
  revision: string
  plan: {
    plan_id: string
    version_id: string
    title: string
    timezone: string
    start_date: string
    end_date: string
  } | null
  activities: {
    activity_id: string
    plan_id: string
    version_id: string
    rule_id: string
    local_date: string
    time_hhmm: string | null
    kind: "meal" | "workout" | "rest"
    title: string
    sort_order: number
    payload: Record<string, unknown>
  }[] | null
  media: { path: string; sha256: string; content_base64: string }[]
  stored_event_ids: string[]
  inserted: number
  duplicates: number
}

export function parsePairUrl(value: string): { endpoint: string; code: string } | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts.length !== 2 || parts[0] !== "pair" || !/^[a-f0-9]{32}$/.test(parts[1])) return null
  if (value.includes("token=")) return null
  return { endpoint: url.origin, code: parts[1] }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (body && typeof body.error === "string") return body.error
  } catch {
    /* The body was not JSON. */
  }
  return "ارتباط با رایانه برقرار نشد."
}

export async function postLan(
  endpoint: string,
  path: string,
  body: unknown,
  token = "",
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(`${endpoint}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Fitness-Client": "iphone",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

export async function exchangeLan(input: {
  endpoint: string
  token: string
  programHash: string
  media: Record<string, string>
  events: unknown[]
  fetchImpl?: typeof fetch
}): Promise<LanExchange> {
  const response = await postLan(
    input.endpoint,
    "/sync/exchange",
    { program_hash: input.programHash, media: input.media, events: input.events },
    input.token,
    input.fetchImpl,
  )
  if (!response.ok) throw new Error(await readError(response))
  return response.json()
}

export async function ackLan(input: {
  endpoint: string
  token: string
  programHash: string
  eventIds: string[]
  conflicts: number
  fetchImpl?: typeof fetch
}): Promise<{ up_to_date: boolean; pending: number }> {
  const response = await postLan(
    input.endpoint,
    "/sync/ack",
    { program_hash: input.programHash, event_ids: input.eventIds, conflicts: input.conflicts },
    input.token,
    input.fetchImpl,
  )
  if (!response.ok) throw new Error(await readError(response))
  return response.json()
}
