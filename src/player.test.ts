// Run: node --test src/player.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MixSource } from './player.ts'

const buf = (v: number) => ({ length: 4, numberOfChannels: 1, getChannelData: () => new Float32Array(4).fill(v) }) as unknown as AudioBuffer

test('vocal level only moves the voice, backing stays put', () => {
  const out = new Float32Array(8)
  // original = backing 0.3 + voice 0.5
  const m = Object.assign(new MixSource(), { tracks: { original: buf(0.8), instrumental: buf(0.3) }, vocal: 0.5 })
  m.extract(out, 4, 0)
  assert.ok(Math.abs(out[0] - (0.3 + 0.5 * 0.5)) < 1e-6)
  const s = Object.assign(new MixSource(), { tracks: { original: buf(0.8), vocals: buf(0.5), instrumental: buf(0.3) }, vocal: 0 })
  s.extract(out, 4, 0)
  assert.ok(Math.abs(out[0] - 0.3) < 1e-6) // stems win, original unused
})

test('loop wraps without a gap', () => {
  const ramp = { length: 6, numberOfChannels: 1, getChannelData: () => Float32Array.from([0, 1, 2, 3, 4, 5]) } as unknown as AudioBuffer
  const m = Object.assign(new MixSource(), { tracks: { instrumental: ramp }, loop: [1, 3] as [number, number] })
  const out = new Float32Array(12)
  assert.equal(m.extract(out, 6, 0), 6)
  assert.deepEqual([...out].filter((_, i) => i % 2 === 0), [0, 1, 2, 1, 2, 1])
  assert.equal(m.wrap(8), 2)
})

test('findLag finds a constant offset between the original and a stem', async () => {
  const { findLag } = await import('./player.ts')
  const rate = 8000
  let seed = 1
  const noise = Float32Array.from({ length: rate * 40 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1)
  const late = new Float32Array(noise.length) // stem starts 0.3 s + 7 samples later
  late.set(noise.subarray(0, noise.length - 2407), 2407)
  assert.equal(findLag(noise, late, rate), 2407)
  assert.equal(findLag(late, noise, rate), -2407)
  assert.equal(findLag(noise, noise, rate), 0)
  assert.equal(findLag(noise, Float32Array.from(noise, (_, i) => Math.sin(i)), rate), null) // different song
})
