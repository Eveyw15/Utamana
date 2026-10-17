// Run: node --test src/furigana.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alignRuby, setReading } from './furigana.ts'

test('alignRuby puts readings only over kanji', () => {
  assert.deepEqual(alignRuby('食べる', 'たべる'), [{ text: '食', ruby: 'た' }, { text: 'べる' }])
  assert.deepEqual(alignRuby('取り扱い', 'とりあつかい'), [
    { text: '取', ruby: 'と' },
    { text: 'り' },
    { text: '扱', ruby: 'あつか' },
    { text: 'い' },
  ])
  assert.deepEqual(alignRuby('空', 'そら'), [{ text: '空', ruby: 'そら' }])
  assert.deepEqual(alignRuby('ギター', 'ぎたー'), [{ text: 'ギター' }])
})

test('setReading writes and clears overrides', () => {
  assert.equal(setReading('明日の空', { text: '明日', at: 0, len: 2 }, 'あした'), '明日{あした}の空')
  assert.equal(setReading('明日{あした}の空', { text: '明日', at: 0, len: 7 }, 'asu'), '明日{あす}の空')
  assert.equal(setReading('明日{あした}の空', { text: '明日', at: 0, len: 7 }, ''), '明日の空')
})
