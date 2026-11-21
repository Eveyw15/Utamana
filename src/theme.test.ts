// Run: node --test src/theme.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, themeFor } from './theme.ts'

test('themeFor uses the chosen theme, else a stable hash of the id', () => {
  assert.equal(THEMES.length, 10)
  assert.equal(themeFor({ id: 'x', theme: '薄荷' }).name, '薄荷')
  assert.equal(themeFor({ id: 'abc' }).name, themeFor({ id: 'abc' }).name)
  assert.equal(themeFor({ id: 'abc', theme: 'nope' }).name, themeFor({ id: 'abc' }).name)
  const names = new Set(Array.from({ length: 40 }, (_, i) => themeFor({ id: `song-${i}` }).name))
  assert.ok(names.size >= 5)
})
