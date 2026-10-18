export type ConnectState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "checking"
  | "syncing_program"
  | "syncing_progress"
  | "applying"
  | "verifying"
  | "up_to_date"
  | "failed"
  | "conflict"

export function connectState(input: {
  transportAvailable: boolean
  authenticated?: boolean
  failed?: boolean
  conflicts?: number
  pendingProgram?: number
  pendingProgress?: number
  acknowledged?: boolean
  programLocal?: string
  programRemote?: string
  progressLocal?: string
  progressRemote?: string
}): ConnectState {
  if (!input.transportAvailable) return "disconnected"
  if (input.failed) return "failed"
  if (!input.authenticated) return "authenticating"
  if ((input.conflicts ?? 0) > 0) return "conflict"
  if ((input.pendingProgram ?? 0) > 0) return "syncing_program"
  if ((input.pendingProgress ?? 0) > 0) return "syncing_progress"
  if (!input.acknowledged) return "verifying"
  const sameProgram = input.programLocal != null && input.programLocal === input.programRemote
  const sameProgress = input.progressLocal != null && input.progressLocal === input.progressRemote
  return sameProgram && sameProgress ? "up_to_date" : "checking"
}

const COPY: Record<ConnectState, { title: string; detail: string }> = {
  disconnected: {
    title: "اتصال برقرار نیست",
    detail: "گوشی و ویندوز باید روی یک وای‌فای باشند و گواهی محلی روی گوشی نصب شده باشد. تا اتصال امن و تأیید هر دو طرف، برنامه به‌روز حساب نمی‌شود.",
  },
  connecting: { title: "در حال اتصال", detail: "به رایانه روی همین وای‌فای وصل می‌شود." },
  authenticating: { title: "در حال تأیید", detail: "منتظر تأیید شما روی ویندوز." },
  checking: { title: "در حال بررسی به‌روزرسانی", detail: "فهرست برنامه و پیشرفت مقایسه می‌شود." },
  syncing_program: { title: "در حال همگام‌سازی", detail: "تغییر برنامه از ویندوز می‌آید." },
  syncing_progress: { title: "در حال همگام‌سازی", detail: "ثبت‌های انجام‌شده به ویندوز می‌روند." },
  applying: { title: "در حال اعمال", detail: "تغییر برنامه روی همان فعالیت‌ها ذخیره می‌شود. سابقه انجام بازنویسی نمی‌شود." },
  verifying: { title: "در حال بررسی درستی", detail: "تا ذخیره و تأیید تمام نشود، برنامه به‌روز حساب نمی‌شود." },
  up_to_date: { title: "Fitness Program is Up to Date", detail: "برنامه و اطلاعات شما کاملاً به‌روز هستند" },
  failed: { title: "خطا", detail: "اتصال یا بررسی درستی کامل نشد. برنامه به‌روز حساب نمی‌شود." },
  conflict: { title: "تعارض", detail: "سابقه انجام‌شده حفظ شد و خودکار بازنویسی نشد." },
}

export function connectMessage(state: ConnectState): { title: string; detail: string } {
  return COPY[state]
}
