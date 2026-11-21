import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Art } from './Art'
import { ChipsPicker } from './ChipsPicker'
import { PlaylistEditor } from './PlaylistEditor'
import type { Song, SongMeta } from './db'
import { STATUS, ago, buildRows, loadOpened, loadRowPrefs, nextStatus, rowChoices, rowLabel, saveRowPrefs, type Row } from './rows'

type Props = {
  songs: SongMeta[]
  currentId: string
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onNew: () => void
  onPatch: (id: string, patch: Partial<Song>) => void
  onDelete: (id: string) => void
  onPracticeList: (name: string) => void
  onSavePlaylist: (old: string | null, name: string, ids: string[]) => void
  onHover: (s: SongMeta | null) => void
}

const STAR = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </svg>
)

// The library: one horizontally scrolling row of records per group (在学, 最近播放, ...), in an order the user
// can rearrange. A playlist / tag chip swaps the rows for a single grid of the matching songs.
export function Library({ songs, currentId, onOpen, onEdit, onNew, onPatch, onDelete, onPracticeList, onSavePlaylist, onHover }: Props) {
  const [prefs, setPrefs] = useState(loadRowPrefs) // row order and the rows the user hid
  const [opened] = useState(loadOpened)
  const [sorting, setSorting] = useState(false)
  const [picked, setFilter] = useState<string | null>(null) // 'list:<name>' or 'tag:<name>'
  const [menu, setMenu] = useState<string | null>(null) // song id whose ⋯ menu is open
  const [listsFor, setListsFor] = useState<string | null>(null) // song id whose playlist picker is open
  const [drag, setDrag] = useState<Row | null>(null)
  const [playlist, setPlaylist] = useState<string | null | undefined>(undefined) // editor: undefined closed, null new, name editing

  useEffect(() => {
    const close = () => (setMenu(null), setListsFor(null))
    addEventListener('click', close)
    return () => removeEventListener('click', close)
  }, [])

  const keys = rowChoices(songs, prefs.order) // every row that could be shown, in the user's order
  const rows = buildRows(songs, opened, keys, prefs.hidden)
  const allLists = [...new Set(songs.flatMap((s) => s.lists ?? []))].sort()
  const allTags = [...new Set(songs.flatMap((s) => s.tags ?? []))].sort()
  // A playlist / tag that no longer exists (its last song left it) drops the filter.
  const filter = picked && (picked.startsWith('list:') ? allLists.includes(picked.slice(5)) : allTags.includes(picked.slice(4))) ? picked : null
  const filtered = filter && songs.filter((s) => (filter.startsWith('list:') ? s.lists?.includes(filter.slice(5)) : s.tags?.includes(filter.slice(4))))

  function savePrefs(next: typeof prefs) {
    setPrefs(next)
    saveRowPrefs(next)
  }
  function move(from: Row, to: Row) {
    const next = keys.filter((k) => k !== from)
    next.splice(next.indexOf(to) + (keys.indexOf(from) < keys.indexOf(to) ? 1 : 0), 0, from)
    savePrefs({ ...prefs, order: next })
  }
  const toggle = (k: Row) => savePrefs({ ...prefs, hidden: prefs.hidden.includes(k) ? prefs.hidden.filter((x) => x !== k) : [...prefs.hidden, k] })
  // Drop k before `target`, or at the end of the shown / hidden column, and show or hide it to match.
  function place(k: Row, target: Row | null, show: boolean) {
    const order = keys.filter((x) => x !== k)
    const lastShown = order.reduce((at, x, i) => (prefs.hidden.includes(x) ? at : i), -1)
    order.splice(target ? order.indexOf(target) : show ? lastShown + 1 : order.length, 0, k)
    const hidden = prefs.hidden.filter((x) => x !== k)
    savePrefs({ order, hidden: show ? hidden : [...hidden, k] })
  }
  const shownKeys = keys.filter((k) => !prefs.hidden.includes(k))
  const hiddenKeys = keys.filter((k) => prefs.hidden.includes(k))
  const count = (k: Row) => buildRows(songs, opened, [k]).find((r) => r.key === k)?.songs.length ?? 0

  const card = (s: SongMeta, row?: Row, i = 0) => (
    <div
      key={s.id}
      className={`rec ${s.id === currentId ? 'current' : ''}`}
      style={{ '--i': Math.min(i, 10) } as CSSProperties}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // This sleeve morphs into the practice page's cover (see transition() in App).
        const sleeve = e.currentTarget.querySelector<HTMLElement>('.sleeve')
        if (sleeve) sleeve.style.viewTransitionName = 'cover'
        onOpen(s.id)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen(s.id)}
      onMouseEnter={() => onHover(s)}
      onMouseLeave={() => (onHover(null), menu === s.id && setMenu(null))}
    >
      <div className="rec-art">
        <span className="disc">
          <Art song={s} />
        </span>
        <Art song={s} className="sleeve" />
        <button className={`fav ${s.fav ? 'on' : ''}`} title={s.fav ? '取消收藏' : '收藏'} onClick={(e) => (e.stopPropagation(), onPatch(s.id, { fav: !s.fav }))}>
          {STAR}
        </button>
        <div className="acts" onClick={(e) => e.stopPropagation()}>
          <button title="点击切换：想学 → 正在学 → 已学会" onClick={() => onPatch(s.id, { status: nextStatus(s.status) })}>
            {s.status ? STATUS[s.status] : '＋ 状态'}
          </button>
          <button title="更多" onClick={() => (setListsFor(null), setMenu(menu === s.id ? null : s.id))}>
            ⋯
          </button>
        </div>
        {menu === s.id && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onEdit(s.id)}>编辑</button>
            <button onClick={() => (setMenu(null), setListsFor(s.id))}>加入歌单…</button>
            <button
              className="danger"
              onClick={() => {
                setMenu(null)
                if (confirm(`删除「${s.title}」？歌词和音频都会删掉，不能恢复。`)) onDelete(s.id)
              }}
            >
              删除这首歌
            </button>
          </div>
        )}
        {listsFor === s.id && (
          <div className="menu lists" onClick={(e) => e.stopPropagation()}>
            <ChipsPicker values={s.lists} options={allLists} onChange={(lists) => onPatch(s.id, { lists })} newLabel="＋ 新歌单" />
          </div>
        )}
      </div>
      <b lang="ja">{s.title}</b>
      <small>
        <span>{s.artist || '未填歌手'}</span>
        <em>{row === 'recent' && opened[s.id] ? ago(opened[s.id]) : s.status ? STATUS[s.status] : ''}</em>
      </small>
    </div>
  )

  return (
    <main className="library-page no-print">
      {playlist !== undefined && (
        <PlaylistEditor
          songs={songs}
          name={playlist ?? undefined}
          taken={allLists}
          onClose={() => setPlaylist(undefined)}
          onSave={(name, ids) => {
            onSavePlaylist(playlist, name, ids)
            setPlaylist(undefined)
            setFilter(`list:${name}`)
          }}
        />
      )}
      <div className="lib-head">
        <h1>曲库</h1>
        <span className="hint">{songs.length} 首</span>
        <span className="grow" />
        {songs.length > 0 && !filter && (
          <button className={sorting ? 'primary' : ''} onClick={() => setSorting(!sorting)}>
            {sorting ? '完成' : '编辑分组'}
          </button>
        )}
        <button onClick={() => setPlaylist(null)}>＋ 新歌单</button>
        <button className="primary" onClick={onNew}>
          ＋ 新歌曲
        </button>
      </div>

      {(allLists.length > 0 || allTags.length > 0) && !sorting && (
        <div className="chips lib-filter">
          <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter(null)}>
            全部
          </button>
          {allLists.map((t) => (
            <button key={`l${t}`} className={`chip ${filter === `list:${t}` ? 'on' : ''}`} onClick={() => setFilter(filter === `list:${t}` ? null : `list:${t}`)}>
              ☰ {t}
            </button>
          ))}
          {allTags.map((t) => (
            <button key={`t${t}`} className={`chip ${filter === `tag:${t}` ? 'on' : ''}`} onClick={() => setFilter(filter === `tag:${t}` ? null : `tag:${t}`)}>
              # {t}
            </button>
          ))}
        </div>
      )}

      {!songs.length && (
        <button className="empty-card" onClick={onNew}>
          ＋ 添加第一首歌
        </button>
      )}

      {filtered ? (
        <section className="lib-row">
          <div className="row-head">
            <h2>{filter!.slice(filter!.indexOf(':') + 1)}</h2>
            <span className="hint">{filtered.length}</span>
            {filter!.startsWith('list:') && (
              <>
                <button className="edit-list" onClick={() => setPlaylist(filter!.slice(5))}>
                  编辑歌单
                </button>
                {filtered.length > 0 && (
                  <button className="primary" onClick={() => onPracticeList(filter!.slice(5))}>
                    ▶ 按歌单练习
                  </button>
                )}
              </>
            )}
          </div>
          <div className="lib-grid">{filtered.map((s, i) => card(s, undefined, i))}</div>
        </section>
      ) : sorting ? (
        <div className="sorting">
          <p className="hint">左边是显示的分组，右边是不显示的。拖动可以排序，也可以拖到另一边；勾选框打勾就是显示。歌单（☰）和标签（#）也能当分组。</p>
          <div className="sort-cols">
            {([true, false] as const).map((show) => (
              <section
                key={String(show)}
                className={`sort-col ${drag ? 'droppable' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drag && place(drag, null, show)}
              >
                <h4>{show ? `显示 · ${shownKeys.length}` : `不显示 · ${hiddenKeys.length}`}</h4>
                {(show ? shownKeys : hiddenKeys).map((k, i, list) => (
                  <div
                    key={k}
                    className={`sort-bar ${drag === k ? 'dragging' : ''} ${show ? '' : 'off'}`}
                    draggable
                    onDragStart={() => setDrag(k)}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation()
                      if (drag && drag !== k) place(drag, k, show)
                      setDrag(null)
                    }}
                  >
                    <label className="check" title={show ? '取消勾选就不显示' : '勾选就显示'}>
                      <input type="checkbox" checked={show} onChange={() => toggle(k)} />
                      <i />
                    </label>
                    <span className="grip">⋮⋮</span>
                    <b>{rowLabel(k)}</b>
                    <span className="hint">{count(k)}</span>
                    <span className="grow" />
                    {show && (
                      <>
                        <button disabled={!i} title="上移" onClick={() => move(k, list[i - 1])}>
                          ↑
                        </button>
                        <button disabled={i === list.length - 1} title="下移" onClick={() => move(k, list[i + 1])}>
                          ↓
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {!(show ? shownKeys : hiddenKeys).length && <p className="hint drop-hint">拖到这里</p>}
              </section>
            ))}
          </div>
        </div>
      ) : songs.length > 0 && !rows.length ? (
        <p className="hint lib-empty">所有分组都隐藏了，点「编辑分组」打开。</p>
      ) : (
        rows.map((r) => (
          <section key={r.key} className="lib-row">
            <Shelf title={rowLabel(r.key)} count={r.songs.length}>
              {r.songs.map((s, i) => card(s, r.key, i))}
            </Shelf>
          </section>
        ))
      )}
    </main>
  )
}

// A row of records that scrolls sideways; ‹ › page through it (the scrollbar is hidden and a mouse wheel
// only scrolls vertically), each shown only while there is more in that direction.
export function Shelf({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const measure = () => {
    const el = ref.current
    if (el) setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(ref.current!)
    return () => ro.disconnect()
  }, [count])
  const page = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <>
      <div className="row-head">
        <h2>{title}</h2>
        <span className="hint">{count}</span>
        {(more.left || more.right) && (
          <span className="pager">
            <button className="chip" title="上一页" disabled={!more.left} onClick={() => page(-1)}>
              ‹
            </button>
            <button className="chip" title="下一页" disabled={!more.right} onClick={() => page(1)}>
              ›
            </button>
          </span>
        )}
      </div>
      <div className="shelf" ref={ref} onScroll={measure}>
        {children}
      </div>
    </>
  )
}
