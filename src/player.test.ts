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
