// Run: node --test src/songName.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupKey, guessExtras, normalizeName, queryKeys, readingKey, searchText } from './songName.ts'

test('normalizeName strips versions, width, case, spaces', () => {
  assert.equal(normalizeName('夜に駆ける (TV size)'), '夜に駆ける')
  assert.equal(normalizeName('ＹＯＡＳＯＢＩ'), 'yoasobi')
  assert.equal(normalizeName('Racing into the Night【MV】'), 'racingintothenight')
  assert.equal(normalizeName('紅蓮華', (s) => s.replace('紅', '红').replace('蓮', '莲').replace('華', '华')), '红莲华')
})

test('groupKey prefers trackId', () => {
  assert.equal(groupKey({ trackId: 1472503410, title: 'x', artist: 'y' }), 'itunes:1472503410')
  assert.equal(groupKey({ title: '夜に駆ける', artist: 'YOASOBI' }), 'name:夜に駆ける|yoasobi')
})

test('readingKey unifies romaji, kana, long vowels, particle wa', () => {
  assert.equal(readingKey('yoru ni kakeru'), readingKey('よるにかける'))
  assert.equal(readingKey('Yoruni Kakeru'), 'よるにかける')
  assert.equal(readingKey('toukyou'), readingKey('tokyo'))
  assert.equal(readingKey('konnichiwa'), readingKey('こんにちは'))
  assert.equal(readingKey('ヨルニカケル'), 'よるにかける')
  assert.equal(readingKey('si'), readingKey('shi'))
})

test('searchText and queryKeys meet', () => {
  const text = searchText(['夜に駆ける', 'よるにかける', 'Racing into the Night', 'YOASOBI'])
  for (const q of ['yoru ni kakeru', '夜に駆ける', 'racing into', 'yoasobi'])
    assert.ok(queryKeys(q).some((k) => text.includes(k)), q)
})

test('guessExtras: readings only for Japanese, translation unless Chinese', () => {
  assert.deepEqual(guessExtras('夜に駆ける\n沈むように溶けてゆくように'), { noReading: false, noTrans: false })
  assert.deepEqual(guessExtras('Hello from the other side'), { noReading: true, noTrans: false })
  assert.deepEqual(guessExtras('后来 我总算学会了如何去爱'), { noReading: true, noTrans: true })
  assert.deepEqual(guessExtras(''), { noReading: false, noTrans: false })
})
