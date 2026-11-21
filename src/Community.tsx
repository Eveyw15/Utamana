import { useEffect, useState, type CSSProperties } from 'react'
import { Art } from './Art'
import { Shelf } from './Library'
import { Avatar } from './Profile'
import { allGroups, deletePost, groupPosts, isAdmin, listGroups, movePost, search, setFeatured, uid, type GroupCard, type Post } from './communityApi'
import { TRACK_LABEL } from './player'
import { ago } from './rows'

type Props = {
  initialGroup?: string | null // open this song's posts right away (from the new-song wizard)
  onListen: (post: Post) => void // practise it read-only without copying
  onCopy: (post: Post) => Promise<void>
}

const ROWS = [
  ['featured', '精选'],
  ['latest', '最新发布'],
  ['mine', '我发布的'],
] as const

// Community page: songs as vinyl rows (one card per song, showing its featured post), search by any name or
// romaji, and a song's posts in a dialog where they can be listened to or copied into the library.
export function Community({ initialGroup, onListen, onCopy }: Props) {
  const [me, setMe] = useState<string>()
  const [rows, setRows] = useState<Record<string, GroupCard[]>>({})
  const [q, setQ] = useState('')
  const [found, setFound] = useState<GroupCard[] | null>(null)
  const [open, setOpen] = useState<string | null>(initialGroup ?? null)
  const [error, setError] = useState('')
  const [admin, setAdmin] = useState(false)

  async function load() {
    try {
      const got = await Promise.all(ROWS.map(([k]) => listGroups(k)))
      setRows(Object.fromEntries(ROWS.map(([k], i) => [k, got[i]])))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
    void isAdmin().then(setAdmin)
    void uid().then(setMe)
  }, [])

  async function find(e?: React.FormEvent) {
    e?.preventDefault()
    if (!q.trim()) return setFound(null)
    try {
      setFound(await search(q))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const card = (g: GroupCard, i: number) => (
    <div key={`${g.id}:${g.post}`} className="rec" style={{ '--i': Math.min(i, 10) } as CSSProperties} role="button" tabIndex={0} onClick={() => setOpen(g.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(g.id)}>
      <div className="rec-art">
        <span className="disc">
          <Art song={{ id: g.id, title: g.title, cover: g.cover ?? undefined }} />
        </span>
        <Art song={{ id: g.id, title: g.title, cover: g.cover ?? undefined }} className="sleeve" />
      </div>
      <b lang="ja">{g.title}</b>
      <small>
        <span>{g.artist}</span>
        <em>{g.posts > 1 ? `${g.posts} 份` : ago(Date.parse(g.updated))}</em>
      </small>
    </div>
  )

  return (
    <main className="library-page community-page no-print">
      <div className="lib-head">
        <h1>社区</h1>
        <span className="grow" />
        <form className="chips" onSubmit={find}>
          <input type="search" value={q} placeholder="歌名、歌手、罗马音都行" onChange={(e) => (setQ(e.target.value), !e.target.value && setFound(null))} />
          <button type="submit" disabled={!q.trim()}>
            搜索
          </button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {found ? (
        <section className="lib-row">
          <Shelf title={`搜索「${q}」`} count={found.length}>
            {found.map(card)}
          </Shelf>
          {!found.length && <p className="hint lib-empty">社区里还没有这首歌。做好后可以在编辑模式里「发布到社区」。</p>}
        </section>
      ) : (
        ROWS.map(([k, label]) =>
          rows[k]?.length ? (
            <section key={k} className="lib-row">
              <Shelf title={label} count={rows[k].length}>
                {rows[k].map(card)}
              </Shelf>
            </section>
          ) : null,
        )
      )}
      {!found && Object.values(rows).every((r) => !r.length) && !error && <p className="hint lib-empty">社区还是空的。在练习页切到「编辑」，就能把做好的歌发布到这里。</p>}
      {open && <GroupDialog groupId={open} me={me} admin={admin} onClose={() => setOpen(null)} onChanged={load} onListen={onListen} onCopy={onCopy} />}
    </main>
  )
}

function GroupDialog({ groupId, me, admin, onClose, onChanged, onListen, onCopy }: { groupId: string; me?: string; admin: boolean; onClose: () => void; onChanged: () => void } & Pick<Props, 'onListen' | 'onCopy'>) {
  const [state, setState] = useState<{ featured: string | null; posts: Post[] } | null>(null)
  const [busy, setBusy] = useState('')
  const [moving, setMoving] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupCard[]>([])

  const reload = () => groupPosts(groupId).then(setState)
  useEffect(() => {
    void reload()
  }, [groupId])

  async function run(id: string, f: () => Promise<unknown>, after?: () => void) {
    setBusy(id)
    try {
      await f()
      onChanged()
      after ? after() : await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  async function startMove(id: string) {
    setMoving(id)
    setGroups((await allGroups()).filter((g) => g.id !== groupId))
  }

  const head = state?.posts[0]
  return (
    <div className="modal no-print" onClick={onClose}>
      <div className="box group-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <b lang="ja">{head ? `${head.title} · ${head.artist}` : '…'}</b>
          <button className="icon" title="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        {state && !state.posts.length && <p className="hint">这首歌的投稿都撤回了。</p>}
        <ol className="post-list">
          {state?.posts.map((p) => {
            const timed = p.data.lines?.some((l) => l.time != null)
            return (
              <li key={p.id} className={p.id === state.featured ? 'featured' : ''}>
                <div className="post-who">
                  <Avatar profile={{ nickname: p.author_name ?? undefined, avatar: p.author_avatar ?? undefined }} size={28} />
                  <b>{p.author_name || '匿名'}</b>
                  {p.id === state.featured && <i className="badge">精选</i>}
                  {p.user_id === me && <i className="badge">我</i>}
                  <span className="hint">{ago(Date.parse(p.updated))}更新 · 复制 {p.copies} 次</span>
                </div>
                <div className="chips post-has">
                  {Object.keys(p.tracks).map((k) => (
                    <i key={k}>{TRACK_LABEL[k as keyof typeof TRACK_LABEL]}</i>
                  ))}
                  {timed && <i>时间轴</i>}
                  {!!p.data.trans?.length && <i>翻译</i>}
                  {!!p.data.beat?.length && <i>BPM</i>}
                </div>
                <div className="chips">
                  <button disabled={!!busy} onClick={() => onListen(p)}>
                    试听
                  </button>
                  <button className="primary" disabled={!!busy} onClick={() => run(p.id, () => onCopy(p), onClose)}>
                    {busy === p.id ? '加入中…' : '加入我的曲库'}
                  </button>
                  {admin && (
                    <>
                      <span className="grow" />
                      {p.id !== state.featured && (
                        <button disabled={!!busy} onClick={() => run(p.id, () => setFeatured(groupId, p.id))}>
                          设为精选
                        </button>
                      )}
                      <button disabled={!!busy} onClick={() => (moving === p.id ? setMoving(null) : startMove(p.id))}>
                        移到其他歌…
                      </button>
                      <button
                        className="danger"
                        disabled={!!busy}
                        onClick={() =>
                          confirm(`删除这份投稿？${p.copies ? `有 ${p.copies} 人复制了它，删除后他们会失去这份音频。` : ''}不能恢复。`) &&
                          run(p.id, () => deletePost(p.id), state.posts.length > 1 ? undefined : onClose)
                        }
                      >
                        删除
                      </button>
                    </>
                  )}
                </div>
                {moving === p.id && (
                  <ol className="drawer-list move-list">
                    <li onClick={() => run(p.id, () => movePost(p.id, null), onClose)}>
                      <b>拆成单独一首</b>
                    </li>
                    {groups.map((g) => (
                      <li key={g.id} onClick={() => run(p.id, () => movePost(p.id, g.id), onClose)}>
                        <b lang="ja">{g.title}</b>
                        <small>{g.artist}</small>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
