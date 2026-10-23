import type { Section } from './beat.ts'

// Tightening hand-tapped line times. A tap lands somewhere around where the singing starts (usually a
// little late). Near each tap we look for a vocal onset (a jump in voice-band loudness), preferring
// points on the beat grid (16th notes), and move the line there.

export const HOP = 0.01 // envelope frame, seconds

// Onset strength per frame from a voice-band mono signal: how much louder (in log energy) this frame is
// than the frames just before it.
export function onsetStrength(samples: Float32Array, sampleRate: number) {
  const hop = Math.round(HOP * sampleRate)
  const frames = Math.floor(samples.length / hop)
  const loud = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    for (let i = f * hop; i < (f + 1) * hop; i++) sum += samples[i] * samples[i]
    loud[f] = Math.log10(Math.sqrt(sum / hop) + 1e-4)
  }
  const out = new Float32Array(frames)
  for (let f = 4; f < frames; f++) out[f] = Math.max(0, loud[f] - Math.min(loud[f - 4], loud[f - 3], loud[f - 2]))
  return out
}

// 16th-note grid times in [lo, hi] from the metronome sections; null where there is no tempo.
function gridBetween(sections: Section[], lo: number, hi: number) {
  const s = sections.filter((x) => x.time <= lo).at(-1) ?? sections[0]
  if (!s || !(s.bpm > 0)) return null
  const step = 60 / s.bpm / 4
  const out: number[] = []
  for (let k = Math.ceil((lo - s.time) / step); s.time + k * step <= hi; k++) out.push(s.time + k * step)
  return out
}

const BEFORE = 0.45 // how far before the tap the singing may start
const AFTER = 0.25 // ...and after it (tapped early)
const LAG = 0.1 // typical tap delay; with no clear onset preference goes to tap - LAG
const MIN_RISE = 0.12 // log10 energy rise (~2.4 dB) that counts as an onset

export function alignTimes(times: (number | undefined)[], sections: Section[], onset: Float32Array): (number | undefined)[] {
  let prev = -Infinity
  return times.map((t) => {
    if (t == null) return t
    const lo = Math.max(0, t - BEFORE), hi = t + AFTER
    const grid = gridBetween(sections, lo, hi)
    const cands = grid ?? Array.from({ length: Math.round((hi - lo) / HOP) + 1 }, (_, k) => lo + k * HOP)
    const strength = (c: number) => {
      let m = 0
      for (let f = Math.round((c - 0.03) / HOP); f <= Math.round((c + 0.03) / HOP); f++) m = Math.max(m, onset[f] ?? 0)
      return m
    }
    const s = cands.map(strength)
    const max = Math.max(0, ...s)
    let best = t
    if (max >= MIN_RISE) {
      let score = -Infinity
      cands.forEach((c, i) => {
        const v = s[i] / max - (0.5 * Math.abs(c - (t - LAG))) / (BEFORE - LAG)
        if (v > score) {
          score = v
          best = c
        }
      })
    }
    // Keep lines in order; if the move would cross the previous line, keep the tap.
    const out = best > prev + 0.15 ? +best.toFixed(3) : t
    prev = out
    return out
  })
}
