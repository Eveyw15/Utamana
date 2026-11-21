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

// Where in the current beat `t` falls (0 = on the beat, approaching 1 = just before the next), for visuals
// that follow the metronome. null before the first section or in a silent (BPM 0) section.
export function beatPhase(sections: Section[], t: number): number | null {
  const s = [...sections].sort((a, b) => a.time - b.time).filter((x) => x.time <= t).at(-1)
  if (!s || !(s.bpm > 0)) return null
  return (((t - s.time) * s.bpm) / 60) % 1
}

// Tempo and first beat from an onset envelope (one value per `hop` seconds; see onsetStrength in align.ts).
// Autocorrelation picks the beat period between 55 and 200 BPM, gently preferring tempos near 120 so it
// doesn't settle on half or double time; the phase is where the onsets line up best with that period.
// A steady-tempo estimate: songs that change tempo still need sections added by hand.
export function estimateTempo(onset: Float32Array, hop = 0.01): { bpm: number; first: number } | null {
  const n = onset.length
  const minLag = Math.floor(60 / 200 / hop)
  const maxLag = Math.ceil(60 / 55 / hop)
  if (n < maxLag * 8) return null
  let mean = 0
  for (const v of onset) mean += v
  mean /= n
  const x = Float32Array.from(onset, (v) => v - mean)
  let energy = 0
  for (const v of x) energy += v * v
  if (energy < 1e-6) return null
  const r = new Float64Array(maxLag + 2)
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag]
    r[lag] = s / (n - lag)
  }
  let best = minLag
  let score = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const w = Math.exp(-0.5 * (Math.log2(60 / (lag * hop) / 120) / 0.9) ** 2)
    if (r[lag] * w > score) (score = r[lag] * w), (best = lag)
  }
  if (!(r[best] > 0)) return null
  // Parabolic interpolation around the peak gives a fractional period (e.g. 93 BPM is 64.5 frames).
  const [a, b, c] = [r[best - 1], r[best], r[best + 1]]
  const curve = a - 2 * b + c
  const period = best + (curve ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curve)) : 0)
  const raw = 60 / (period * hop)
  const bpm = Math.abs(raw - Math.round(raw)) < 0.4 ? Math.round(raw) : Math.round(raw * 10) / 10
  let phase = 0
  let most = -Infinity
  for (let p = 0; p < Math.ceil(period); p++) {
    let s = 0
    for (let t = p; t < n; t += period) s += onset[Math.round(t)] ?? 0
    if (s > most) (most = s), (phase = p)
  }
  return { bpm, first: +(phase * hop).toFixed(3) }
}
