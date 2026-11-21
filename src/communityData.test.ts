// Run: node --test src/communityData.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Song } from './db.ts'
import { copyFromPost, postData, trackFiles, tracksToUpload } from './communityData.ts'

test('postData drops personal fields', () => {
  const d = postData({ id: 'a', title: 't', artist: 'r', lines: [], tags: ['x'], status: 'learning', fav: true, lists: ['L'], audio: {}, updated: 1 } as Song)
  assert.equal('tags' in d || 'status' in d || 'fav' in d || 'lists' in d || 'audio' in d, false)
  assert.equal(d.title, 't')
})

test('trackFiles carries the revision', () => {
  assert.deepEqual(trackFiles('p', { audio: { vocals: new Blob() }, audioRev: { vocals: 3 } } as unknown as Song), { vocals: 'p/vocals-3' })
})

test('referenced tracks are never uploaded or removed', () => {
  const song = { audio: { original: new Blob(), vocals: new Blob() }, audioRev: { original: 0, vocals: 2 }, audioSrc: { original: 'p/original-0' } } as unknown as Song
  assert.deepEqual(tracksToUpload(song, {}), { upload: ['vocals'], remove: [] })
  assert.deepEqual(tracksToUpload({ ...song, audio: {} } as Song, { original: 0 }), { upload: [], remove: [] })
  assert.deepEqual(tracksToUpload({ ...song, audioSrc: undefined, audio: {} } as Song, { vocals: 2 }), { upload: [], remove: ['vocals'] })
})

test('copyFromPost makes a new song that points at the community files', () => {
  const s = copyFromPost({ data: { title: 't', artist: 'r', lines: [] }, tracks: { vocals: 'vocals-3' }, id: 'p' }, 'new')
  assert.equal(s.id, 'new')
  assert.deepEqual(s.audioSrc, { vocals: 'p/vocals-3' })
  assert.deepEqual(s.audioRev, { vocals: 0 })
  assert.equal(s.postId, undefined)
})

test('copyFromPost takes only published fields from a (possibly crafted) post', () => {
  const data = { title: 't', artist: 'r', lines: [], postId: 'x', tags: ['t'], lists: ['L'], fav: true, status: 'learned' } as unknown as Parameters<typeof copyFromPost>[0]['data']
  const s = copyFromPost({ data, tracks: {}, id: 'p' }, 'n')
  for (const k of ['postId', 'tags', 'lists', 'fav', 'status']) assert.equal(k in s, false, k)
  assert.deepEqual(copyFromPost({ data: { title: 't', artist: 'r', lines: 'bad' } as never, tracks: {}, id: 'p' }, 'n').lines, [])
})

test('copyFromPost ignores unknown or malformed track entries', () => {
  const s = copyFromPost({ data: { title: 't', artist: 'r', lines: [] }, tracks: { vocals: 'vocals-1', evil: 'x', original: '../a' } as never, id: 'p' }, 'n')
  assert.deepEqual(s.audioSrc, { vocals: 'p/vocals-1' })
})
