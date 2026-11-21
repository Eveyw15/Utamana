// Run: node --test src/rows.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ROWS, buildRows } from './rows.ts'
import type { SongMeta } from './db.ts'

const m = (id: string, extra: Partial<SongMeta> = {}): SongMeta => ({ id, title: id, artist: '', updated: 0, ...extra })

test('buildRows groups, orders by last opened and drops empty rows', () => {
  const songs = [m('a', { status: 'learning' }), m('b', { status: 'learning', fav: true }), m('c')]
  const rows = buildRows(songs, { a: 10, b: 20 }, DEFAULT_ROWS)
  assert.deepEqual(rows.map((r) => r.key), ['learning', 'recent', 'fav', 'all'])
  assert.deepEqual(rows[0].songs.map((s) => s.id), ['b', 'a']) // most recently opened first
  assert.deepEqual(rows[1].songs.map((s) => s.id), ['b', 'a']) // recent = opened only
  assert.deepEqual(rows[3].songs.map((s) => s.id).sort(), ['a', 'b', 'c'])
})

test('buildRows follows the saved order and appends rows missing from it', () => {
  const rows = buildRows([m('a', { fav: true })], {}, ['fav', 'bogus' as never])
  assert.deepEqual(rows.map((r) => r.key), ['fav', 'all'])
})

test('buildRows caps the recent row at 12', () => {
  const songs = Array.from({ length: 20 }, (_, i) => m(`s${i}`))
  const opened = Object.fromEntries(songs.map((s, i) => [s.id, i + 1]))
  assert.equal(buildRows(songs, opened, ['recent'])[0].songs.length, 12)
})
