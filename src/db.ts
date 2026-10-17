import { del, get, set } from 'idb-keyval'
import type { Line } from './lrc'
import type { TrackKey } from './player'

export type Song = {
  id: string
  title: string
  artist: string
  lines: Line[]
  audio: Partial<Record<TrackKey, Blob>>
  updated: number
}
export type SongMeta = Pick<Song, 'id' | 'title' | 'artist' | 'updated'>

const INDEX = 'songs'

export const listSongs = async () => ((await get<SongMeta[]>(INDEX)) ?? []).sort((a, b) => b.updated - a.updated)
export const loadSong = (id: string) => get<Song>(`song:${id}`)

export async function saveSong(song: Song) {
  song.updated = Date.now()
  await set(`song:${song.id}`, song)
  const { id, title, artist, updated } = song
  await set(INDEX, [...(await listSongs()).filter((s) => s.id !== id), { id, title, artist, updated }])
}

export async function deleteSong(id: string) {
  await del(`song:${id}`)
  await set(INDEX, (await listSongs()).filter((s) => s.id !== id))
}
