// Run: node --test src/cover.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeHits } from './cover.ts'

const r = (trackId: number, trackName: string, artistName = 'YOASOBI') => ({ trackId, trackName, artistName, collectionName: 'A', artworkUrl100: `https://x/${trackId}/100x100bb.jpg` })

test('mergeHits joins storefronts by trackId, Japanese name first', () => {
  const hits = mergeHits([
    { country: 'us', results: [r(1, 'Racing into the Night')] },
    { country: 'jp', results: [r(1, '夜に駆ける'), r(2, 'アイドル')] },
    { country: 'cn', results: [r(1, '向夜晚奔去')] },
  ])
  assert.equal(hits.length, 2)
  assert.equal(hits[0].title, '夜に駆ける')
  assert.deepEqual(hits[0].aliases.sort(), ['Racing into the Night', '向夜晚奔去'].sort())
  assert.equal(hits[0].url, 'https://x/1/600x600bb.jpg')
})

test('mergeHits drops results without artwork', () => {
  assert.equal(mergeHits([{ country: 'jp', results: [{ ...r(3, 'x'), artworkUrl100: undefined }] }]).length, 0)
})
