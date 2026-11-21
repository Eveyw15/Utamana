// Run: node --test src/beat.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchorFirst, beatGrid, beatPhase, estimateTempo, parseSections, snapToBeat, tapFit } from './beat.ts'

test('tapFit averages tap gaps and smooths the first beat', () => {
  assert.equal(tapFit([1]), null)
  const r = tapFit([10.04, 10.5, 11.01, 11.5])!
  assert.equal(r.bpm, 123.3)
  assert.ok(Math.abs(r.first - 10.02) < 0.03, String(r.first))
})

test('anchorFirst moves the downbeat back by whole bars', () => {
  // 120 BPM, 4/4: a bar is 2 s, so a downbeat tapped at 7.3 s anchors at 1.3 s.
  assert.equal(anchorFirst(7.3, 120, 4), 1.3)
  assert.equal(anchorFirst(0.4, 120, 4), 0.4)
})

test('snapToBeat lands on the previous section beat grid', () => {
  const sections = [{ time: 1, bpm: 120, beats: 4 }]
  assert.equal(snapToBeat(sections, 9.2), 9) // beats at 1, 1.5, ... 9
  assert.equal(snapToBeat(sections, 9.3), 9.5)
  // Editing section 1 itself ignores its own old time.
  const two = [...sections, { time: 5, bpm: 90, beats: 7 }]
  assert.equal(snapToBeat(two, 5.2, 1), 5)
  assert.equal(snapToBeat([], 3.21), 3.21)
})

test('beatGrid skips silent sections and parseSections validates files', () => {
  const grid = beatGrid([{ time: 0, bpm: 120, beats: 2 }, { time: 1, bpm: 0, beats: 1 }, { time: 2, bpm: 60, beats: 1 }], 3, 10)
  assert.deepEqual(grid.map((c) => c.pos), [0, 5, 20])
  assert.deepEqual(parseSections('[{"time":2,"bpm":60,"beats":1,"x":1},{"time":0,"bpm":0,"beats":1}]'), [
    { time: 0, bpm: 0, beats: 1 },
    { time: 2, bpm: 60, beats: 1 },
  ])
  assert.throws(() => parseSections('[{"time":0,"bpm":120}]'))
  assert.throws(() => parseSections('{}'))
})

test('beatGrid accents bar starts across meter changes', () => {
  const grid = beatGrid([{ time: 0, bpm: 120, beats: 4 }, { time: 2, bpm: 120, beats: 3 }], 3.5, 10)
  assert.deepEqual(grid.map((c) => c.pos), [0, 5, 10, 15, 20, 25, 30])
  assert.deepEqual(grid.map((c) => c.accent), [true, false, false, false, true, false, false])
})

test('beatPhase is the fraction of the current beat, null without a running section', () => {
  const s = [{ time: 1, bpm: 120, beats: 4 }, { time: 5, bpm: 0, beats: 4 }]
  assert.equal(beatPhase([], 2), null)
  assert.equal(beatPhase(s, 0.5), null) // before the first section
  assert.equal(beatPhase(s, 1), 0)
  assert.ok(Math.abs(beatPhase(s, 1.25)! - 0.5) < 1e-9) // 120 BPM: a beat is 0.5 s
  assert.equal(beatPhase(s, 6), null) // BPM 0 section is silent
})

// Onset envelope (10 ms frames) with a pulse on every beat plus deterministic noise.
function pulses(bpm: number, first: number, seconds: number) {
  const hop = 0.01, out = new Float32Array(Math.round(seconds / hop))
  let seed = 7
  for (let i = 0; i < out.length; i++) out[i] = ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.2
  for (let t = first; t < seconds; t += 60 / bpm) out[Math.round(t / hop)] += 1
  return out
}

test('estimateTempo finds the BPM and the first beat of a steady pulse', () => {
  const a = estimateTempo(pulses(120, 0.23, 60))!
  assert.ok(Math.abs(a.bpm - 120) <= 1, String(a.bpm))
  assert.ok(Math.abs(a.first - 0.23) <= 0.02, String(a.first))
  const b = estimateTempo(pulses(150, 1.1, 60))!
  assert.ok(Math.abs(b.bpm - 150) <= 1, String(b.bpm))
  assert.ok(Math.abs(((b.first - 1.1) % 0.4 + 0.4) % 0.4) <= 0.02 || Math.abs(((b.first - 1.1) % 0.4 + 0.4) % 0.4 - 0.4) <= 0.02, String(b.first))
  const c = estimateTempo(pulses(93, 0.5, 60))!
  assert.ok(Math.abs(c.bpm - 93) <= 1, String(c.bpm))
})

test('estimateTempo gives up on silence or a clip too short to tell', () => {
  assert.equal(estimateTempo(new Float32Array(6000)), null)
  assert.equal(estimateTempo(pulses(120, 0, 2)), null)
})
