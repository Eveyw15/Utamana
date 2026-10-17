// Run: node --test src/lrc.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLyrics, toLrc } from './lrc.ts'

test('parse and write LRC round trip', () => {
  const lines = parseLyrics('[ti:x]\n[00:01.50]あ\n[01:02.00][00:03.00]い\n')
  assert.deepEqual(lines, [{ text: 'あ', time: 1.5 }, { text: 'い', time: 3 }, { text: 'い', time: 62 }])
  assert.equal(toLrc(lines), '[00:01.50]あ\n[00:03.00]い\n[01:02.00]い')
  assert.deepEqual(parseLyrics('\nあ\n\nい\n'), [{ text: 'あ' }, { text: '' }, { text: 'い' }])
})
