// Library rows (在学, 最近播放, ...) and the per-device data behind them: when each song was last opened
// and the row order the user picked. Both live in localStorage only; they are not synced.
import type { SongMeta } from './db.ts'

export type RowKey = 'learning' | 'recent' | 'fav' | 'want' | 'learned' | 'all'
// A library row: a built-in group, or one the user added for a playlist ('list:<name>') or a tag ('tag:<name>').
export type Row = RowKey | `list:${string}` | `tag:${string}`
export const ROW_LABEL: Record<RowKey, string> = { learning: '在学', recent: '最近播放', fav: '收藏', want: '想学', learned: '已学会', all: '全部' }
export const DEFAULT_ROWS: RowKey[] = ['learning', 'recent', 'fav', 'want', 'learned', 'all']
const RECENT_MAX = 12

const pick: Record<RowKey, (s: SongMeta, opened: Record<string, number>) => boolean> = {
  learning: (s) => s.status === 'learning',
  recent: (s, o) => !!o[s.id],
  fav: (s) => !!s.fav,
  want: (s) => s.status === 'want',
  learned: (s) => s.status === 'learned',
  all: () => true,
}

function matcher(k: string): ((s: SongMeta, opened: Record<string, number>) => boolean) | null {
  if (k in pick) return pick[k as RowKey]
  if (k.startsWith('list:')) return (s) => !!s.lists?.includes(k.slice(5))
  if (k.startsWith('tag:')) return (s) => !!s.tags?.includes(k.slice(4))
  return null
}

export const rowLabel = (k: Row) => (k in ROW_LABEL ? ROW_LABEL[k as RowKey] : k.startsWith('list:') ? `☰ ${k.slice(5)}` : `# ${k.slice(4)}`)

// Every row the user can show or hide: their saved order first (dropping playlists / tags that no longer
// exist), then built-ins not in it, then the remaining playlists and tags.
export function rowChoices(songs: SongMeta[], order: Row[]): Row[] {
  const lists = [...new Set(songs.flatMap((s) => s.lists ?? []))].sort().map((l) => `list:${l}` as Row)
  const tags = [...new Set(songs.flatMap((s) => s.tags ?? []))].sort().map((t) => `tag:${t}` as Row)
  const exists = (k: Row) => k in pick || lists.includes(k) || tags.includes(k)
  const kept = order.filter(exists)
  return [...kept, ...[...DEFAULT_ROWS, ...lists, ...tags].filter((k) => !kept.includes(k))]
}

export function buildRows(songs: SongMeta[], opened: Record<string, number>, order: Row[], hidden: Row[] = []) {
  const keys = [...order.filter((k) => matcher(k)), ...DEFAULT_ROWS.filter((k) => !order.includes(k))].filter((k) => !hidden.includes(k))
  const byRecent = (a: SongMeta, b: SongMeta) => (opened[b.id] ?? 0) - (opened[a.id] ?? 0) || b.updated - a.updated
  return keys
    .map((key) => {
      const list = songs.filter((s) => matcher(key)!(s, opened)).sort(byRecent)
      return { key, songs: key === 'recent' ? list.slice(0, RECENT_MAX) : list }
    })
    .filter((r) => r.songs.length)
}

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: order / recents just won't be remembered.
  }
}

export const loadOpened = () => read<Record<string, number>>('utamana:opened', {})
export const markOpened = (id: string) => write('utamana:opened', { ...loadOpened(), [id]: Date.now() })
// Saved as { order, hidden }; older versions saved just the order array.
export function loadRowPrefs(): { order: Row[]; hidden: Row[] } {
  const v = read<Row[] | { order?: Row[]; hidden?: Row[] }>('utamana:rows', DEFAULT_ROWS)
  return Array.isArray(v) ? { order: v, hidden: [] } : { order: v.order ?? DEFAULT_ROWS, hidden: v.hidden ?? [] }
}
export const saveRowPrefs = (prefs: { order: Row[]; hidden: Row[] }) => write('utamana:rows', prefs)

export const STATUS = { want: '想学', learning: '正在学', learned: '已学会' } as const
export type Status = keyof typeof STATUS
export const nextStatus = (s?: Status) => ({ none: 'want', want: 'learning', learning: 'learned', learned: undefined } as const)[s ?? 'none']

export function ago(at: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - at) / 60000))
  return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`
}
