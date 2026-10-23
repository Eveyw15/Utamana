// Run: node --test src/align.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOP, alignTimes, onsetStrength } from './align.ts'

// Silence with a 0.3 s "voice" burst starting at each onset time.
function signal(onsets: number[], sr = 8000, seconds = 12) {
  const x = new Float32Array(sr * seconds)
  for (const o of onsets) for (let i = Math.round(o * sr); i < Math.round((o + 0.3) * sr); i++) x[i] = Math.sin(i * 0.3) * 0.5
  return onsetStrength(x, sr)
}

test('late and early taps move to the vocal onset on the beat grid', () => {
  const truth = [2, 4.5, 7.25] // all on the 120 BPM 16th grid (0.125 s)
  const onset = signal(truth)
  const out = alignTimes([2.2, 4.4, undefined, 7.38], [{ time: 0, bpm: 120, beats: 4 }], onset)
  assert.deepEqual(out, [2, 4.5, undefined, 7.25])
})

test('no onset nearby keeps the tap', () => {
  const out = alignTimes([5], [], new Float32Array(Math.round(12 / HOP)))
  assert.deepEqual(out, [5])
})
