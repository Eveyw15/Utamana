export type Line = { text: string; time?: number }

const TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g

// Accepts plain text or LRC. Metadata tags like [ar:...] are dropped.
export function parseLyrics(src: string): Line[] {
  const out: Line[] = []
  let multi = false
  for (const raw of src.split(/\r?\n/)) {
    if (/^\[[a-z]+:.*\]$/i.test(raw.trim())) continue
    const times = [...raw.matchAll(TAG)].map((m) => +m[1] * 60 + +m[2])
    const text = raw.replace(TAG, '').trim()
    multi ||= times.length > 1
    if (!times.length) out.push({ text })
    else for (const time of times) out.push({ text, time })
  }
  while (out.length && !out[0].text) out.shift()
  while (out.length && !out[out.length - 1].text) out.pop()
  // Only lines with several tags ([00:10][01:20]chorus) need reordering.
  return multi ? out.sort((a, b) => (a.time ?? 0) - (b.time ?? 0)) : out
}

export function fmtTime(t: number) {
  const m = Math.floor(t / 60)
  return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}`
}

export function toLrc(lines: Line[], title = '', artist = '') {
  const head = [title && `[ti:${title}]`, artist && `[ar:${artist}]`].filter(Boolean)
  return [...head, ...lines.map((l) => (l.time != null ? `[${fmtTime(l.time)}]` : '') + l.text)].join('\n')
}

// Translations are stored per non-empty lyric line. Timed translations match by timestamp,
// otherwise translation lines are taken in order.
export function alignTranslation(lines: Line[], src: string): string[] {
  const tr = parseLyrics(src).filter((l) => l.text)
  const lyric = lines.filter((l) => l.text)
  if (tr.length && tr.every((l) => l.time != null) && lyric.every((l) => l.time != null))
    return lyric.map((l) => tr.find((t) => Math.abs(t.time! - l.time!) < 0.5)?.text ?? '')
  return tr.map((l) => l.text)
}
