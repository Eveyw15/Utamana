// Run: node --test src/beat.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchorFirst, beatGrid, snapToBeat, tapFit } from './beat.ts'

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

test('beatGrid accents bar starts across meter changes', () => {
  const grid = beatGrid([{ time: 0, bpm: 120, beats: 4 }, { time: 2, bpm: 120, beats: 3 }], 3.5, 10)
  assert.deepEqual(grid.map((c) => c.pos), [0, 5, 10, 15, 20, 25, 30])
  assert.deepEqual(grid.map((c) => c.accent), [true, false, false, false, true, false, false])
})
