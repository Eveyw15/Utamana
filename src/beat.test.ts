// Run: node --test src/beat.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { beatGrid, detectTempo } from './beat.ts'

function clickTrack(bpm: number, offset: number, seconds: number, sampleRate = 44100) {
  const data = new Float32Array(seconds * sampleRate)
  for (let t = offset; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * sampleRate)
    for (let i = 0; i < 400 && s + i < data.length; i++) data[s + i] = Math.sin(i / 3) * Math.exp(-i / 80)
  }
  return { sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data }
}

test('detectTempo finds bpm and first beat of a click track', () => {
  for (const bpm of [92, 128, 174]) {
    const r = detectTempo(clickTrack(bpm, 0.3, 30))
    assert.ok(Math.abs(r.bpm - bpm) < 1, `bpm ${bpm} -> ${r.bpm}`)
    const beat = 60 / bpm
    const phaseErr = Math.abs(((r.offset - 0.3) % beat + beat * 1.5) % beat - beat / 2)
    assert.ok(phaseErr < 0.03, `offset ${r.offset} for ${bpm}`)
  }
})

test('beatGrid accents bar starts across meter changes', () => {
  const grid = beatGrid([{ time: 0, bpm: 120, beats: 4 }, { time: 2, bpm: 120, beats: 3 }], 3.5, 10)
  assert.deepEqual(grid.map((c) => c.pos), [0, 5, 10, 15, 20, 25, 30])
  assert.deepEqual(grid.map((c) => c.accent), [true, false, false, false, true, false, false])
})
