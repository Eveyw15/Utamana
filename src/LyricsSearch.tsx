import { useEffect, useState } from 'react'
import { fmtTime } from './lrc'
import { rankHits, searchLyrics, type LyricHit } from './lrclib'

type Props = { initial: string; duration?: number; onPick: (hit: LyricHit) => void }

// Search box + results; picking one hands its lyrics (timed LRC when available) to the caller.
export function LyricsSearch({ initial, duration, onPick }: Props) {
  const [q, setQ] = useState(initial)
  const [hits, setHits] = useState<LyricHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(query: string) {
    if (!query.trim()) return
    setBusy(true)
    setError('')
    try {
      setHits(rankHits(await searchLyrics(query.trim()), duration))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setHits(null)
    } finally {
      setBusy(false)
    }
  }

  // Search right away when we already know what to look for (edit mode: the song's title and artist).
  useEffect(() => {
    if (initial.trim()) void run(initial)
  }, [])

  return (
    <div className="lyrics-search">
      <form
        className="chips"
        onSubmit={(e) => {
          e.preventDefault()
          void run(q)
        }}
      >
        <input type="search" className="grow" value={q} placeholder="歌名、歌手，例如 夜に駆ける YOASOBI" onChange={(e) => setQ(e.target.value)} />
        <button type="submit" disabled={busy || !q.trim()}>
          {busy ? '搜索中…' : '搜索歌词'}
        </button>
      </form>
      {error && <p className="hint">{error}</p>}
      {hits && !hits.length && <p className="hint">没搜到，换个写法试试（日文原名、去掉括号里的版本信息），或者直接粘贴。</p>}
      {hits && hits.length > 0 && (
        <ol className="lyric-hits">
          {hits.slice(0, 12).map((h) => (
            <li key={h.id} onClick={() => onPick(h)} title="用这份歌词">
              <span>
                <b lang="ja">{h.title}</b>
                <small>
                  {h.artist}
                  {h.album ? ` · ${h.album}` : ''}
                </small>
              </span>
              <em>{fmtTime(h.duration).replace(/\.\d+$/, '')}</em>
              <i className={h.synced ? 'on' : ''}>{h.synced ? '带时间轴' : '纯文本'}</i>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
