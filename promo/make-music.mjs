// Generates an original, royalty-free backing track: 120 BPM, I-V-vi-IV in C, soft pads, plucks and light drums.
import { writeFileSync } from 'node:fs'

const SR = 44100
const BPM = 120
const SECONDS = 47
const beat = 60 / BPM
const n = SR * SECONDS
const L = new Float32Array(n)
const R = new Float32Array(n)

const midi = (m) => 440 * 2 ** ((m - 69) / 12)
const chords = [
  [48, 55, 60, 64, 67], // C
  [43, 55, 59, 62, 67], // G
  [45, 57, 60, 64, 69], // Am
  [41, 53, 57, 60, 65], // F
]
let seed = 1
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

function add(start, dur, fn, pan = 0) {
  const a = Math.floor(start * SR)
  const z = Math.min(n, Math.floor((start + dur) * SR))
  for (let i = Math.max(0, a); i < z; i++) {
    const v = fn((i - a) / SR)
    L[i] += v * (1 - pan) * 0.5
    R[i] += v * (1 + pan) * 0.5
  }
}

const bars = Math.ceil(SECONDS / (4 * beat))
for (let b = 0; b < bars; b++) {
  const t0 = b * 4 * beat
  const ch = chords[b % 4]
  const intro = b < 2 // first two bars: pads only
  // Pad: detuned triangles with slow attack.
  for (const m of ch.slice(1)) {
    const f = midi(m)
    add(t0, 4 * beat + 0.3, (t) => {
      const env = Math.min(1, t / 0.4) * Math.min(1, (4 * beat + 0.3 - t) / 0.4)
      const tri = (x) => (2 / Math.PI) * Math.asin(Math.sin(x))
      return 0.035 * env * (tri(2 * Math.PI * f * t) + tri(2 * Math.PI * f * 1.003 * t))
    })
  }
  // Bass on each beat.
  for (let k = 0; k < 4 && !intro; k++)
    add(t0 + k * beat, beat * 0.9, (t) => 0.16 * Math.exp(-t * 4) * Math.sin(2 * Math.PI * midi(ch[0] - 12) * t))
  // Pluck arpeggio in eighths.
  const order = [1, 2, 3, 4, 3, 2, 3, 4]
  for (let k = 0; k < 8; k++) {
    const f = midi(ch[order[k]] + 12)
    add(t0 + (k * beat) / 2, 0.5, (t) => 0.07 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * f * t) * (intro ? 0.6 : 1), k % 2 ? 0.4 : -0.4)
  }
  if (intro) continue
  // Drums: kick on 1 and 3, clap on 2 and 4, hats on eighths.
  for (const k of [0, 2]) add(t0 + k * beat, 0.3, (t) => 0.5 * Math.exp(-t * 18) * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 40)) * t))
  for (const k of [1, 3]) add(t0 + k * beat, 0.2, (t) => 0.14 * Math.exp(-t * 25) * noise())
  for (let k = 0; k < 8; k++) add(t0 + (k * beat) / 2, 0.05, (t) => 0.035 * Math.exp(-t * 90) * noise(), 0.3)
}

// Fade out over the last 3 seconds, normalise, write 16-bit stereo WAV.
let peak = 0
for (let i = 0; i < n; i++) {
  const g = Math.min(1, (n - i) / (3 * SR))
  L[i] *= g
  R[i] *= g
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const buf = Buffer.alloc(44 + n * 4)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + n * 4, 4)
buf.write('WAVEfmt ', 8)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20)
buf.writeUInt16LE(2, 22)
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 4, 28)
buf.writeUInt16LE(4, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(n * 4, 40)
const s = 0.85 / peak
for (let i = 0; i < n; i++) {
  buf.writeInt16LE(Math.round(L[i] * s * 32767), 44 + i * 4)
  buf.writeInt16LE(Math.round(R[i] * s * 32767), 46 + i * 4)
}
writeFileSync('public/bgm.wav', buf)
console.log('wrote public/bgm.wav', SECONDS, 's')
