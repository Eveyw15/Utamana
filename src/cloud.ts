import { createClient } from '@supabase/supabase-js'
import { deleteSong, listSongs, loadSong, saveSong, type Song } from './db'
import type { TrackKey } from './player'
import { planSync } from './syncPlan'
import { tracksToUpload } from './communityData'

// Cloud sync is off unless .env.local sets both values (see README).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase = url && key ? createClient(url, key) : null

const TRACKS: TrackKey[] = ['original', 'vocals', 'instrumental']
type Revs = Partial<Record<TrackKey, number>>
type Data = Pick<Song, 'title' | 'artist' | 'lines' | 'trans' | 'noReading' | 'noTrans' | 'beat' | 'cover' | 'bg' | 'theme' | 'trackId' | 'aliases' | 'audioSrc' | 'postId' | 'tags' | 'status' | 'fav' | 'lists' | 'stemShift'> & { audio: Revs }

const audioPath = (uid: string, id: string, k: TrackKey) => `${uid}/${id}/${k}`

async function currentUser() {
  return supabase ? (await supabase.auth.getSession()).data.session?.user.id : undefined
}

function check<T extends { error: unknown }>(r: T) {
  if (r.error) throw r.error
  return r
}

export async function pushSong(song: Song) {
  const uid = await currentUser()
  if (!supabase || !uid) return
  const { data: row } = check(await supabase.from('songs').select('data').eq('id', song.id).maybeSingle())
  const remoteRev: Revs = (row?.data as Data | null)?.audio ?? {}
  const audio: Revs = {}
  for (const k of TRACKS) if (song.audio[k]) audio[k] = song.audioRev?.[k] ?? 0
  // Tracks copied from the community stay there (audioSrc); only the user's own tracks go to their folder.
  const { upload, remove } = tracksToUpload(song, remoteRev)
  for (const k of upload) check(await supabase.storage.from('audio').upload(audioPath(uid, song.id, k), song.audio[k]!, { upsert: true }))
  if (remove.length) check(await supabase.storage.from('audio').remove(remove.map((k) => audioPath(uid, song.id, k))))
  const { title, artist, lines, trans, noReading, noTrans, beat, cover, bg, theme, trackId, aliases, audioSrc, postId, tags, status, fav, lists, stemShift } = song
  const data: Data = { title, artist, lines, trans, noReading, noTrans, beat, cover, bg, theme, trackId, aliases, audioSrc, postId, tags, status, fav, lists, stemShift, audio }
  check(await supabase.from('songs').upsert({ id: song.id, data, updated: song.updated, deleted: false }))
}

// Leaves a tombstone so other devices delete their copy on next sync.
export async function deleteRemote(id: string) {
  const uid = await currentUser()
  if (!supabase || !uid) return
  check(await supabase.storage.from('audio').remove(TRACKS.map((k) => audioPath(uid, id, k))))
  check(await supabase.from('songs').upsert({ id, data: null, updated: Date.now(), deleted: true }))
}

async function pullSong(uid: string, id: string, local?: Song): Promise<Song> {
  const row = check(await supabase!.from('songs').select('data, updated').eq('id', id).single()).data!
  const d = row.data as Data
  const audio: Song['audio'] = {}
  for (const k of Object.keys(d.audio) as TrackKey[]) {
    // Reuse the local file when the track has not changed.
    if (local?.audio[k] && (local.audioRev?.[k] ?? 0) === d.audio[k]) audio[k] = local.audio[k]
    else if (d.audioSrc?.[k]) {
      // Copied from the community: if an admin deleted that post, the song still syncs, just without this track.
      const { data } = await supabase!.storage.from('community').download(d.audioSrc[k]!)
      if (data) audio[k] = data
    }
    else audio[k] = check(await supabase!.storage.from('audio').download(audioPath(uid, id, k))).data!
  }
  return { id, title: d.title, artist: d.artist, lines: d.lines, trans: d.trans, noReading: d.noReading, noTrans: d.noTrans, beat: d.beat, cover: d.cover, bg: d.bg, theme: d.theme, trackId: d.trackId, aliases: d.aliases, audioSrc: d.audioSrc, postId: d.postId, tags: d.tags, status: d.status, fav: d.fav, lists: d.lists, stemShift: d.stemShift, audio, audioRev: d.audio, updated: row.updated }
}

export async function syncAll() {
  const uid = await currentUser()
  if (!supabase || !uid) return
  const { data: rows } = check(await supabase.from('songs').select('id, updated, deleted'))
  const plan = planSync(await listSongs(), rows!)
  for (const id of plan.removeLocal) await deleteSong(id)
  for (const id of plan.pull) await saveSong(await pullSong(uid, id, await loadSong(id)), false)
  for (const id of plan.push) await pushSong((await loadSong(id))!)
}
