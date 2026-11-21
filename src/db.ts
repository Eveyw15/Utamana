import { del, get, set } from 'idb-keyval'
import type { Section } from './beat'
import type { Line } from './lrc'
import type { TrackKey } from './player'

export type Song = {
  id: string
  title: string
  artist: string
  lines: Line[]
  trans?: string[] // one per non-empty lyric line
  beat?: Section[] // metronome sections, see beat.ts
  cover?: string // album cover, small JPEG data URL (see cover.ts)
  bg?: string // uploaded background image, large JPEG data URL; replaces the cover as the page background
  theme?: string // default theme name (theme.ts) used when there is no cover
  trackId?: number // Apple Music track id, picked from the cover search: identifies the song across languages
  aliases?: string[] // the song's names in other storefronts (Chinese / English ...), for community search
  tags?: string[] // the user's own labels: genre, series / IP, ...
  status?: 'want' | 'learning' | 'learned'
  fav?: boolean
  lists?: string[] // names of the playlists the song is in
  audio: Partial<Record<TrackKey, Blob>>
  audioRev?: Partial<Record<TrackKey, number>> // bumped when a track is replaced, so sync knows what to upload
  audioSrc?: Partial<Record<TrackKey, string>> // copied from the community: track file in the community bucket (not re-uploaded)
  postId?: string // this song's own community post, if published
  updated: number
}

// Summary kept in the index so the library page does not load every song's audio.
export type SongMeta = Pick<Song, 'id' | 'title' | 'artist' | 'updated' | 'cover' | 'theme' | 'tags' | 'status' | 'fav' | 'lists'> & {
  first?: string
  lines?: number
  tracks?: number
  timed?: boolean
  trans?: boolean
}

const INDEX = 'songs'

function summary(s: Song): SongMeta {
  const text = s.lines.filter((l) => l.text)
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    updated: s.updated,
    cover: s.cover,
    theme: s.theme,
    tags: s.tags,
    status: s.status,
    fav: s.fav,
    lists: s.lists,
    first: text[0]?.text.replace(/\{[^}]*\}/g, ''),
    lines: text.length,
    tracks: Object.keys(s.audio).length,
    timed: text.some((l) => l.time != null),
    trans: !!s.trans?.some(Boolean),
  }
}

export const loadSong = (id: string) => get<Song>(`song:${id}`)

export async function listSongs() {
  let list = (await get<SongMeta[]>(INDEX)) ?? []
  // Rebuild summaries saved by older versions that lacked the card fields.
  if (list.some((s) => s.lines == null)) {
    list = await Promise.all(
      list.map(async (s) => {
        const full = await loadSong(s.id)
        return full ? summary(full) : s
      }),
    )
    await set(INDEX, list)
  }
  return list.sort((a, b) => b.updated - a.updated)
}

// touch = false keeps the timestamp, used when saving a copy pulled from the cloud.
export async function saveSong(song: Song, touch = true) {
  if (touch) song.updated = Date.now()
  await set(`song:${song.id}`, song)
  await set(INDEX, [...(await listSongs()).filter((s) => s.id !== song.id), summary(song)])
}

export async function deleteSong(id: string) {
  await del(`song:${id}`)
  await set(INDEX, (await listSongs()).filter((s) => s.id !== id))
}
