import { useState } from 'react'
import { Art } from './Art'
import type { SongMeta } from './db'

type Props = {
  songs: SongMeta[]
  name?: string // editing an existing playlist; omitted for a new one
  taken: string[] // existing playlist names, to stop a new one from merging into another by accident
  onSave: (name: string, ids: string[]) => void
  onClose: () => void
}

// Build a playlist by moving songs from the whole library (left) into it (right); the search box filters both.
export function PlaylistEditor({ songs, name: initial, taken, onSave, onClose }: Props) {
  const [name, setName] = useState(initial ?? '')
  const [ids, setIds] = useState(() => songs.filter((s) => initial && s.lists?.includes(initial)).map((s) => s.id))
  const [q, setQ] = useState('')
  const match = (s: SongMeta) => !q.trim() || `${s.title} ${s.artist}`.toLowerCase().includes(q.trim().toLowerCase())
  const inList = songs.filter((s) => ids.includes(s.id))
  const rest = songs.filter((s) => !ids.includes(s.id))
  const clash = name.trim() !== initial && taken.includes(name.trim())

  const row = (s: SongMeta, add: boolean) => (
    <li key={s.id} onClick={() => setIds(add ? [...ids, s.id] : ids.filter((x) => x !== s.id))} title={add ? '加入歌单' : '移出歌单'}>
      <Art song={s} />
      <span>
        <b lang="ja">{s.title}</b>
        <small>{s.artist || '未填歌手'}</small>
      </span>
      <i>{add ? '＋' : '－'}</i>
    </li>
  )

  return (
    <div className="modal no-print" onClick={onClose}>
      <div className="box playlist-editor" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <b>{initial ? '编辑歌单' : '新歌单'}</b>
          <button className="icon" title="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        <input className="pl-name" autoFocus value={name} placeholder="歌单名" onChange={(e) => setName(e.target.value)} />
        {clash && <p className="hint">已经有叫「{name.trim()}」的歌单了，保存会合并进去。</p>}
        <input type="search" className="pl-search" value={q} placeholder="搜索歌名或歌手" onChange={(e) => setQ(e.target.value)} />
        <div className="pl-cols">
          <section>
            <h4>所有歌曲 · 点一下加入</h4>
            <ol className="drawer-list">{rest.filter(match).map((s) => row(s, true))}</ol>
            {!rest.filter(match).length && <p className="hint">{rest.length ? '没有匹配的歌' : '所有歌都在歌单里了'}</p>}
          </section>
          <section>
            <h4>
              歌单里 {inList.length} 首 · 点一下移出
            </h4>
            <ol className="drawer-list">{inList.filter(match).map((s) => row(s, false))}</ol>
            {!inList.length && <p className="hint">从左边点歌加进来</p>}
          </section>
        </div>
        <div className="wizard-foot">
          <span className="grow" />
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={!name.trim()} onClick={() => onSave(name.trim(), ids)}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
