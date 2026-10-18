import { del, get, set } from 'idb-keyval'
import type { Line } from './lrc'
import type { TrackKey } from './player'

export type Song = {
  id: string
  title: string
  artist: string
  lines: Line[]
  trans?: string[] // one per non-empty lyric line
  audio: Partial<Record<TrackKey, Blob>>
  audioRev?: Partial<Record<TrackKey, number>> // bumped when a track is replaced, so sync knows what to upload
  updated: number
}

// Summary kept in the index so the library page does not load every song's audio.
export type SongMeta = Pick<Song, 'id' | 'title' | 'artist' | 'updated'> & {
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
