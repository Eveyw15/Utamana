// Practice time, kept per local day on this device only: seconds of playback, for the profile page.
export type PracticeLog = Record<string, number> // 'YYYY-MM-DD' -> seconds

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const addPractice = (log: PracticeLog, seconds: number, now = new Date()): PracticeLog => {
  const k = dayKey(now)
  return { ...log, [k]: (log[k] ?? 0) + seconds }
}

export function practiceStats(log: PracticeLog, now = new Date()) {
  const day = (back: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back))
  const week = Array.from({ length: 7 }, (_, i) => ({ day: day(6 - i), seconds: log[day(6 - i)] ?? 0 }))
  // Consecutive days with practice, ending today (or yesterday, so the streak survives until you play today).
  let streak = 0
  for (let back = log[day(0)] ? 0 : 1; log[day(back)]; back++) streak++
  return { today: log[day(0)] ?? 0, week, total: Object.values(log).reduce((a, b) => a + b, 0), streak }
}

const KEY = 'utamana:practice'
export function loadPractice(): PracticeLog {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}
export function logPractice(seconds: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify(addPractice(loadPractice(), seconds)))
  } catch {
    // Storage blocked: practice time just isn't recorded.
  }
}
