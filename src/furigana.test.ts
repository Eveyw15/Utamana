// Run: node --test src/furigana.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alignRuby } from './furigana.ts'

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
