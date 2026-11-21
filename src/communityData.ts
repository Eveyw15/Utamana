import type { Song } from './db'
import type { TrackKey } from './player'

// Pure helpers for community posts (kept apart from community.ts so they can be tested without Supabase).

const TRACKS: TrackKey[] = ['original', 'vocals', 'instrumental']

export type PostData = Omit<Song, 'id' | 'updated' | 'audio' | 'audioRev' | 'audioSrc' | 'postId' | 'tags' | 'status' | 'fav' | 'lists'>
export type PostRow = { id: string; data: PostData; tracks: Partial<Record<TrackKey, string>> }

// The published snapshot: the song without the author's own labels, progress, favourites, playlists or audio.
export function postData(song: Song): PostData {
  const { id: _i, updated: _u, audio: _a, audioRev: _r, audioSrc: _s, postId: _p, tags: _t, status: _st, fav: _f, lists: _l, ...data } = song
  return data
}

// Community file for each track; the revision is in the name, so a re-publish with a new track never
// overwrites a file someone's copy still points at.
export function trackFiles(postId: string, song: Song): Partial<Record<TrackKey, string>> {
  const files: Partial<Record<TrackKey, string>> = {}
  for (const k of TRACKS) if (song.audio[k]) files[k] = `${postId}/${k}-${song.audioRev?.[k] ?? 0}`
  return files
}

// Private-bucket sync for one song: tracks that point at community files are never uploaded or removed.
export function tracksToUpload(song: Song, remote: Partial<Record<TrackKey, number>>) {
  const upload: TrackKey[] = []
  const remove: TrackKey[] = []
  for (const k of TRACKS) {
    if (song.audioSrc?.[k]) continue
    if (song.audio[k]) {
      if (remote[k] !== (song.audioRev?.[k] ?? 0)) upload.push(k)
    } else if (remote[k] != null) remove.push(k)
  }
  return { upload, remove }
}

// A copy for the caller's library (audio blobs are filled in by the caller after downloading).
export function copyFromPost(post: Pick<PostRow, 'id' | 'data' | 'tracks'>, newId: string): Song {
  const audioSrc: Song['audioSrc'] = {}
  const audioRev: Song['audioRev'] = {}
  for (const [k, file] of Object.entries(post.tracks) as [TrackKey, string][]) {
    audioSrc[k] = file.includes('/') ? file : `${post.id}/${file}`
    audioRev[k] = 0
  }
  return { ...post.data, id: newId, audio: {}, audioRev, audioSrc, updated: Date.now() }
}
