// Run: node --test src/lrc.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alignTranslation, parseLyrics, toLrc } from './lrc.ts'

test('parse and write LRC round trip', () => {
  const lines = parseLyrics('[ti:x]\n[00:01.50]あ\n[01:02.00][00:03.00]い\n')
  assert.deepEqual(lines, [{ text: 'あ', time: 1.5 }, { text: 'い', time: 3 }, { text: 'い', time: 62 }])
  assert.equal(toLrc(lines), '[00:01.50]あ\n[00:03.00]い\n[01:02.00]い')
  assert.deepEqual(parseLyrics('\nあ\n\nい\n'), [{ text: 'あ' }, { text: '' }, { text: 'い' }])
})

test('alignTranslation matches by time, else by order', () => {
  const lines = parseLyrics('[00:01.00]あ\n\n[00:05.00]い')
  assert.deepEqual(alignTranslation(lines, '[00:05.10]乙\n[00:01.00]甲'), ['甲', '乙'])
  assert.deepEqual(alignTranslation(lines, '甲\n\n乙'), ['甲', '乙'])
})
