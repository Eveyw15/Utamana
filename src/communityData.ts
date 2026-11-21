import type { Song } from './db'
import type { TrackKey } from './player'

// Pure helpers for community posts (kept apart from communityApi.ts so they can be tested without Supabase).

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

// A copy for the caller's library (audio blobs are filled in by the caller after downloading). Posts are written
// by other users, so only the published fields are taken, and only well-formed track files.
const FILE = /^(original|vocals|instrumental)-\d+$/
export function copyFromPost(post: Pick<PostRow, 'id' | 'data' | 'tracks'>, newId: string): Song {
  const d = post.data
  const audioSrc: Song['audioSrc'] = {}
  const audioRev: Song['audioRev'] = {}
  for (const k of TRACKS) {
    const file = post.tracks?.[k]
    const name = typeof file === 'string' && file.startsWith(`${post.id}/`) ? file.slice(post.id.length + 1) : file
    if (typeof name !== 'string' || !FILE.test(name) || !name.startsWith(`${k}-`)) continue
    audioSrc[k] = `${post.id}/${name}`
    audioRev[k] = 0
  }
  return {
    id: newId,
    title: String(d.title ?? ''),
    artist: String(d.artist ?? ''),
    lines: Array.isArray(d.lines) ? d.lines : [],
    trans: Array.isArray(d.trans) ? d.trans : undefined,
    noReading: d.noReading === true || undefined,
    noTrans: d.noTrans === true || undefined,
    beat: Array.isArray(d.beat) ? d.beat : undefined,
    cover: d.cover,
    bg: d.bg,
    theme: d.theme,
    trackId: d.trackId,
    aliases: Array.isArray(d.aliases) ? d.aliases : undefined,
    audio: {},
    audioRev,
    audioSrc,
    updated: Date.now(),
  }
}
