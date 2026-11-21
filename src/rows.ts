// Library rows (在学, 最近播放, ...) and the per-device data behind them: when each song was last opened
// and the row order the user picked. Both live in localStorage only; they are not synced.
import type { SongMeta } from './db.ts'

export type RowKey = 'learning' | 'recent' | 'fav' | 'want' | 'learned' | 'all'
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

export function buildRows(songs: SongMeta[], opened: Record<string, number>, order: RowKey[]) {
  const keys = [...order.filter((k) => k in pick), ...DEFAULT_ROWS.filter((k) => !order.includes(k))]
  const byRecent = (a: SongMeta, b: SongMeta) => (opened[b.id] ?? 0) - (opened[a.id] ?? 0) || b.updated - a.updated
  return keys
    .map((key) => {
      const list = songs.filter((s) => pick[key](s, opened)).sort(byRecent)
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
export const loadRowOrder = () => read<RowKey[]>('utamana:rows', DEFAULT_ROWS)
export const saveRowOrder = (order: RowKey[]) => write('utamana:rows', order)

export const STATUS = { want: '想学', learning: '正在学', learned: '已学会' } as const
export type Status = keyof typeof STATUS
export const nextStatus = (s?: Status) => ({ none: 'want', want: 'learning', learning: 'learned', learned: undefined } as const)[s ?? 'none']

export function ago(at: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - at) / 60000))
  return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`
}
