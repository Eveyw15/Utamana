// A metronome section: from `time` (seconds, at the song's original speed) on, `bpm` beats per minute
// with an accent every `beats` beats. Several sections handle tempo and meter changes.
export type Section = { time: number; bpm: number; beats: number }
export type Click = { pos: number; accent: boolean } // pos in source samples

type Audio = { sampleRate: number; length: number; numberOfChannels: number; getChannelData(c: number): Float32Array }

const HOP = 512

// Onset strength: positive change of log energy per HOP-sized frame.
function onsetEnvelope(buf: Audio, maxSeconds: number) {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const frames = Math.floor(Math.min(buf.length, maxSeconds * buf.sampleRate) / HOP)
  const env = new Float32Array(frames)
  let prev = 0
  for (let f = 0; f < frames; f++) {
    let e = 0
    for (const ch of chans) for (let i = f * HOP; i < (f + 1) * HOP; i++) e += ch[i] * ch[i]
    const le = Math.log(1e-9 + e)
    env[f] = f ? Math.max(0, le - prev) : 0
    prev = le
  }
  return env
}

// Global tempo by autocorrelating the onset envelope, then the beat phase that best lines up with onsets.
// shortcut: assumes a mostly steady tempo; songs with tempo changes need sections added by hand.
export function detectTempo(buf: Audio): { bpm: number; offset: number } {
  const env = onsetEnvelope(buf, 90)
  const fps = buf.sampleRate / HOP
  let best = 0, bestLag = 0
  for (let lag = Math.floor((fps * 60) / 200); lag <= Math.ceil((fps * 60) / 60); lag++) {
    let s = 0
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag]
    // Mild preference for ~120 BPM to avoid half/double-tempo picks.
    const bpm = (fps * 60) / lag
    s *= Math.exp(-0.5 * Math.log2(bpm / 120) ** 2)
    if (s > best) [best, bestLag] = [s, lag]
  }
  // Refine the period over many beats: pick the fractional period whose comb collects the most onset energy.
  let bestPeriod = bestLag, bestScore = -1, bestPhase = 0
  for (let p = bestLag - 1; p <= bestLag + 1; p += 0.02) {
    for (let phase = 0; phase < p; phase += 1) {
      let s = 0
      for (let t = phase; t < env.length; t += p) s += env[Math.round(t)] ?? 0
      if (s > bestScore) [bestScore, bestPeriod, bestPhase] = [s, p, phase]
    }
  }
  return { bpm: Math.round(((fps * 60) / bestPeriod) * 10) / 10, offset: (bestPhase * HOP) / buf.sampleRate }
}

export function beatGrid(sections: Section[], duration: number, sampleRate: number): Click[] {
  const sorted = [...sections].sort((a, b) => a.time - b.time)
  const out: Click[] = []
  sorted.forEach((s, i) => {
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
