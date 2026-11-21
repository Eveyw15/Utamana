// Run: node --test src/lrclib.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankHits, toHit } from './lrclib.ts'

const raw = (id: number, duration: number, synced: string | null, plain: string | null = 'a\nb') =>
  ({ id, trackName: `t${id}`, artistName: 'YOASOBI', albumName: 'THE BOOK', duration, instrumental: false, plainLyrics: plain, syncedLyrics: synced })

test('toHit keeps timed lyrics when there are any, else the plain text', () => {
  assert.equal(toHit(raw(1, 200, '[00:01.00]a')).text, '[00:01.00]a')
  assert.equal(toHit(raw(1, 200, null)).text, 'a\nb')
  assert.equal(toHit(raw(1, 200, null)).synced, false)
  assert.equal(toHit(raw(1, 200, '[00:01.00]a')).synced, true)
})

test('rankHits: timed lyrics first, then closest to the song length; drops entries without lyrics', () => {
  const hits = [raw(1, 250, null), raw(2, 300, '[00:01.00]x'), raw(3, 262, '[00:01.00]y'), raw(4, 260, null, null)].map(toHit)
  assert.deepEqual(rankHits(hits, 261).map((h) => h.id), [3, 2, 1])
  assert.deepEqual(rankHits(hits).map((h) => h.id), [2, 3, 1]) // no length known: keep the service's order within each group
})
