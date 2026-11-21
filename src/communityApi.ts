import { supabase } from './cloud'
import { copyFromPost, postData, trackFiles, type PostData } from './communityData'
import { saveSong, type Song } from './db'
import { getTokenizer } from './furigana'
import type { TrackKey } from './player'
import { groupKey, queryKeys, searchText } from './songName'

// Community: thin calls into Supabase. Every rule (who may write what, 10 posts per song, admin-only actions)
// is enforced by the database (supabase/community.sql); this file only asks.

export type Post = {
  id: string
  user_id: string
  author_name: string | null
  author_avatar: string | null
  group_id: string
  title: string
  artist: string
  cover: string | null
  data: PostData
  tracks: Partial<Record<TrackKey, string>>
  copies: number
  hidden: boolean
  created: string
  updated: string
}
export type GroupCard = { id: string; featured: string | null; post: string; title: string; artist: string; cover: string | null; posts: number; updated: string }

const POST_COLUMNS = 'id, user_id, author_name, author_avatar, group_id, title, artist, cover, data, tracks, copies, hidden, created, updated'

export async function uid() {
  return supabase ? (await supabase.auth.getSession()).data.session?.user.id : undefined
}

function check<T extends { error: { message: string; code?: string } | null }>(r: T) {
  if (r.error) throw new Error(friendly(r.error.message))
  return r
}

function friendly(m: string) {
  if (m.includes('group full')) return '这首歌的投稿已满 10 份'
  if (m.includes('posts_one_per_user')) return '你已经发布过这首歌了，可以在自己那首歌上「更新发布」'
  if (m.includes('admin only')) return '只有管理员能做这件事'
  return m
}

// Signed in, and the community tables exist (the SQL was run). Cached per session.
let ready: Promise<boolean> | null = null
let readyFor: string | undefined
export async function communityReady() {
  const id = await uid()
  if (!supabase || !id) return false
  if (!ready || readyFor !== id) {
    readyFor = id
    ready = Promise.resolve(supabase.from('song_groups').select('id').limit(1)).then(({ error }) => !error)
  }
  return ready
}

// Traditional -> simplified for name-based group keys, loaded only when needed.
let t2sPromise: Promise<(s: string) => string> | null = null
function t2s() {
  t2sPromise ??= import('opencc-js/t2cn')
    .then((m) => m.Converter({ from: 'tw', to: 'cn' }))
    .catch(() => (s: string) => s)
  return t2sPromise
}

async function reading(s: string) {
  try {
    const tokens = (await getTokenizer()).tokenize(s)
    return tokens.map((t) => (t.reading && t.reading !== '*' ? t.reading : t.surface_form)).join('')
  } catch {
    return ''
  }
}

export type Author = { name?: string; avatar?: string }

// Publish a snapshot (or update the caller's existing post). Returns the post id, also stored on the song.
export async function publish(song: Song, author: Author, duration?: number): Promise<string> {
  if (!supabase || !(await uid())) throw new Error('请先登录')
  const group = groupKey(song, await t2s())
  const search = searchText([song.title, await reading(song.title), ...(song.aliases ?? []), song.artist, await reading(song.artist)])
  const args = {
    p_group: group,
    p_title: song.title,
    p_artist: song.artist,
    p_cover: song.cover ?? null,
    p_track_id: song.trackId ?? null,
    p_search: search,
    p_data: postData(song),
    p_tracks: {},
    p_duration: duration ?? null,
    p_author_name: author.name ?? null,
    p_author_avatar: author.avatar ?? null,
    p_post: song.postId ?? null,
  }
  // The row first (the storage policy only lets you upload under your own post's folder), then the files.
  const id = check(await supabase.rpc('publish', args)).data as string
  const files = trackFiles(id, song)
  const tracks: Partial<Record<TrackKey, string>> = {}
  for (const [k, path] of Object.entries(files) as [TrackKey, string][]) {
    tracks[k] = path.slice(id.length + 1)
    // Same name = same revision already uploaded (an earlier publish): keep it, never overwrite.
    const { error } = await supabase.storage.from('community').upload(path, song.audio[k]!, { upsert: false })
    if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`音频上传失败：${error.message}`)
  }
  check(await supabase.rpc('publish', { ...args, p_tracks: tracks, p_post: id }))
  return id
}

export async function withdraw(postId: string) {
  check(await supabase!.rpc('withdraw', { p_post: postId }))
}

export async function listGroups(kind: 'featured' | 'latest' | 'mine'): Promise<GroupCard[]> {
  if (!supabase) return []
  if (kind === 'mine') {
    const me = await uid()
    const rows = check(await supabase.from('posts').select('id, group_id, title, artist, cover, updated').eq('user_id', me!).eq('hidden', false).order('updated', { ascending: false })).data ?? []
    return rows.map((p) => ({ id: p.group_id, featured: null, post: p.id, title: p.title, artist: p.artist, cover: p.cover, posts: 1, updated: p.updated }))
  }
  let q = supabase.from('group_cards').select('*')
  q = kind === 'featured' ? q.not('featured', 'is', null).order('updated', { ascending: false }) : q.order('updated', { ascending: false })
  return (check(await q.limit(40)).data ?? []) as GroupCard[]
}

export async function groupPosts(groupId: string): Promise<{ featured: string | null; posts: Post[] }> {
  const g = check(await supabase!.from('song_groups').select('featured').eq('id', groupId).maybeSingle()).data
  const posts = (check(await supabase!.from('posts').select(POST_COLUMNS).eq('group_id', groupId).eq('hidden', false).order('created')).data ?? []) as Post[]
  const featured = g?.featured ?? null
  posts.sort((a, b) => Number(b.id === featured) - Number(a.id === featured))
  return { featured, posts }
}

// Search posts by any name, kana or romaji; one card per song.
export async function search(q: string): Promise<GroupCard[]> {
  const keys = queryKeys(q).map((k) => k.replace(/[%_,()]/g, ''))
  if (!supabase || !keys.length) return []
  const rows = (check(
    await supabase
      .from('posts')
      .select('id, group_id, title, artist, cover, updated')
      .eq('hidden', false)
      .or(keys.map((k) => `search.ilike.%${k}%`).join(','))
      .limit(60),
  ).data ?? []) as { id: string; group_id: string; title: string; artist: string; cover: string | null; updated: string }[]
  const byGroup = new Map<string, GroupCard>()
  for (const p of rows) {
    const g = byGroup.get(p.group_id)
    if (g) g.posts++
    else byGroup.set(p.group_id, { id: p.group_id, featured: null, post: p.id, title: p.title, artist: p.artist, cover: p.cover, posts: 1, updated: p.updated })
  }
  return [...byGroup.values()]
}

// A copy in the caller's library: new id, audio downloaded for playback but left in the community bucket.
export async function copyToLibrary(post: Pick<Post, 'id' | 'data' | 'tracks'>): Promise<Song> {
  const song = copyFromPost(post, crypto.randomUUID())
  for (const [k, path] of Object.entries(song.audioSrc ?? {}) as [TrackKey, string][])
    song.audio[k] = check(await supabase!.storage.from('community').download(path)).data!
  await saveSong(song)
  void supabase!.rpc('count_copy', { p_post: post.id })
  return song
}

// Audio for listening without copying (read-only practice).
export async function postAudio(post: Pick<Post, 'id' | 'tracks'>) {
  const audio: Song['audio'] = {}
  for (const [k, file] of Object.entries(post.tracks) as [TrackKey, string][])
    audio[k] = check(await supabase!.storage.from('community').download(`${post.id}/${file}`)).data!
  return audio
}

export async function isAdmin() {
  if (!supabase || !(await uid())) return false
  return !!check(await supabase.rpc('is_admin')).data
}

export async function setFeatured(groupId: string, postId: string | null) {
  check(await supabase!.rpc('set_featured', { p_group: groupId, p_post: postId }))
}

export async function movePost(postId: string, groupId: string | null) {
  return check(await supabase!.rpc('move_post', { p_post: postId, p_group: groupId })).data as string
}

export async function deletePost(postId: string) {
  const paths = (check(await supabase!.rpc('delete_post', { p_post: postId })).data ?? []) as string[]
  if (paths.length) check(await supabase!.storage.from('community').remove(paths))
}

// Every group, for the admin's "move to another song" picker.
export async function allGroups(): Promise<GroupCard[]> {
  return (check(await supabase!.from('group_cards').select('*').order('title')).data ?? []) as GroupCard[]
}

