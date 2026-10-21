// A metronome section: from `time` (seconds, at the song's original speed) on, `bpm` beats per minute
// with an accent every `beats` beats. Several sections handle tempo and meter changes.
export type Section = { time: number; bpm: number; beats: number }
export type Click = { pos: number; accent: boolean } // pos in source samples

// Tap tempo: fit taps (song time, so playback speed doesn't matter) to an even beat grid.
// Returns the BPM and the fitted time of the first tap, which is steadier than the raw first tap.
export function tapFit(taps: number[]) {
  const n = taps.length
  if (n < 2) return null
  const gap = (taps[n - 1] - taps[0]) / (n - 1)
  if (gap <= 0) return null
  const first = taps.reduce((sum, t, k) => sum + t - k * gap, 0) / n
  return { bpm: Math.round(600 / gap) / 10, first }
}

// First section: the first tap is a downbeat. Start the grid a whole number of bars earlier,
// as close to 0 as possible, so the metronome also clicks before the first tap.
export function anchorFirst(firstTap: number, bpm: number, beats: number) {
  const bar = (60 / bpm) * beats
  return +(firstTap - Math.floor(firstTap / bar) * bar).toFixed(3)
}

// Snap a time onto the beat grid of the section in effect before it, so a new section's
// first beat lines up with the previous section's beats.
export function snapToBeat(sections: Section[], t: number, skip?: number) {
  const prev = sections.filter((s, i) => i !== skip && s.time <= t).at(-1)
  if (!prev || !(prev.bpm > 0)) return +t.toFixed(3)
  const beat = 60 / prev.bpm
  return +(prev.time + Math.round((t - prev.time) / beat) * beat).toFixed(3)
}

// Parse an exported metronome file; rejects anything that is not a list of sections.
export function parseSections(text: string): Section[] {
  const data: unknown = JSON.parse(text)
  const ok = (s: Section) =>
    Number.isFinite(s?.time) && s.time >= 0 && Number.isFinite(s.bpm) && s.bpm >= 0 && s.bpm <= 1000 && Number.isInteger(s.beats) && s.beats >= 1 && s.beats <= 32
  if (!Array.isArray(data) || !data.length || !data.every(ok)) throw new Error('不是有效的节拍文件')
  return (data as Section[]).map(({ time, bpm, beats }) => ({ time, bpm, beats })).sort((a, b) => a.time - b.time)
}

export function beatGrid(sections: Section[], duration: number, sampleRate: number): Click[] {
  const sorted = [...sections].sort((a, b) => a.time - b.time)
  const out: Click[] = []
  sorted.forEach((s, i) => {
    if (!(s.bpm > 0)) return // BPM 0 = silent section, e.g. a free-tempo passage
    const end = sorted[i + 1]?.time ?? duration
    for (let n = 0, t = s.time; t < end; t = s.time + (++n * 60) / s.bpm)
      out.push({ pos: Math.round(t * sampleRate), accent: n % Math.max(1, s.beats) === 0 })
  })
  return out
}

export type ClickSound = 'beep' | 'wood' | 'hat'
export const CLICK_LABEL: Record<ClickSound, string> = { beep: '电子音', wood: '木鱼', hat: '镲片' }
export const CLICK_SECONDS = 0.06

export function clickSample(sound: ClickSound, accent: boolean, t: number) {
  if (sound === 'hat') return (Math.random() * 2 - 1) * Math.exp(-t * 90) * (accent ? 1 : 0.6)
  const [f, decay] = sound === 'wood' ? [accent ? 1200 : 850, 110] : [accent ? 1760 : 1320, 60]
  return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * decay) * (accent ? 1 : 0.7)
}
