import { useEffect, useState, type MutableRefObject } from 'react'
import { Art } from './Art'
import { searchCovers, toCover, type CoverHit } from './cover'
import type { Song } from './db'
import { parseLyrics } from './lrc'
import { TRACK_LABEL, type TrackKey } from './player'
import { LyricsSearch } from './LyricsSearch'
import { search as searchCommunity, type GroupCard } from './communityApi'

const TRACKS: TrackKey[] = ['original', 'vocals', 'instrumental']

type Props = {
  artists: string[]
  // The song as filled in so far, so leaving the wizard early can keep it (App saves it if it has lyrics).
  draft: MutableRefObject<Song | null>
  onDone: (song: Song) => void
  onCancel: () => void
  // Signed in with the community available: step 2 first shows songs others already made.
  onCommunity?: (groupId: string) => void
}

// New song in three steps: lyrics (required), pick the song from an online search (title, artist and cover in
// one click), audio (optional).
export function NewSong({ artists, draft, onDone, onCancel, onCommunity }: Props) {
  const [shared, setShared] = useState<GroupCard[]>([])
  const [id] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState(1)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<CoverHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [cover, setCover] = useState<string>()
  const [picked, setPicked] = useState<CoverHit>()
  const [audio, setAudio] = useState<Song['audio']>({})
  const [audioRev, setAudioRev] = useState<Song['audioRev']>({})

  const lines = parseLyrics(text)
  const firstLine = lines.find((l) => l.text)?.text.replace(/\{[^}]*\}/g, '') ?? ''
  const song: Song = { id, title: title.trim() || fileName || firstLine || '新歌曲', artist: artist.trim(), lines, cover, trackId: picked?.trackId, aliases: picked?.aliases, audio, audioRev, updated: 0 }
  useEffect(() => {
    draft.current = song
  })

  async function search(q: string) {
    if (!q.trim()) return
    setBusy(true)
    try {
      if (onCommunity) void searchCommunity(q.trim()).then(setShared, () => setShared([]))
      setHits(await searchCovers(q.trim()))
    } catch {
      setHits([])
    } finally {
      setBusy(false)
    }
  }

  // Step 2 opens with results already listed, searched by the file name or the first lyric line.
  function next() {
    if (step === 1 && !hits) {
      const q = title && artist ? `${title} ${artist}` : fileName || firstLine
      setTerm(q)
      void search(q)
    }
    setStep(step + 1)
  }

  async function pick(h: CoverHit) {
    setBusy(true)
    try {
      setTitle(h.title)
      setArtist(h.artist)
      setPicked(h)
      setCover(await toCover(h.url))
    } catch {
      setCover(undefined)
    } finally {
      setBusy(false)
    }
  }

  function addAudio(k: TrackKey, file?: File) {
    if (!file) return
    setAudio({ ...audio, [k]: file })
    setAudioRev({ ...audioRev, [k]: Date.now() })
  }

  return (
    <main className="wizard no-print">
      <div className="box wizard-card">
        <div className="wizard-head">
          <h1>新歌曲</h1>
          <ol className="steps">
            {['歌词', '选歌', '音频'].map((s, i) => (
              <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
                {i + 1} {s}
              </li>
            ))}
          </ol>
          <button className="icon" title="关闭" onClick={onCancel}>
            ✕
          </button>
        </div>

        {step === 1 && (
          <section className="wizard-body">
            <LyricsSearch
              initial=""
              onPick={(h) => {
                setText(h.text)
                setTitle(h.title)
                setArtist(h.artist)
              }}
            />
            <p className="hint">也可以直接粘贴歌词，一行一句；纯文本或带时间的 LRC 都行。</p>
            <textarea lang="ja" spellCheck={false} value={text} placeholder="在这里粘贴歌词…" onChange={(e) => setText(e.target.value)} />
            <div className="chips">
              <label className="button">
                导入 .txt / .lrc
                <input
                  hidden
                  type="file"
                  accept=".txt,.lrc,text/plain"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    setText(await f.text())
                    setFileName(f.name.replace(/\.\w+$/, ''))
                  }}
                />
              </label>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="wizard-body">
            <div className="pick-head">
              <Art song={song} className="pick-art" />
              <div>
                <b lang="ja">{song.title}</b>
                <span className="hint">{song.artist || '点下面的结果选歌'}</span>
              </div>
            </div>
            <form
              className="chips"
              onSubmit={(e) => {
                e.preventDefault()
                void search(term)
              }}
            >
              <input className="grow" value={term} placeholder="歌名 / 歌手" onChange={(e) => setTerm(e.target.value)} />
              <button type="submit" disabled={busy}>
                {busy ? '搜索中…' : '搜索'}
              </button>
              <button type="button" className={manual ? 'on' : ''} onClick={() => setManual(!manual)}>
                手动填写
              </button>
            </form>
            {manual && (
              <div className="chips">
                <input value={title} placeholder="歌名" onChange={(e) => setTitle(e.target.value)} />
                <input list="wizard-artists" value={artist} placeholder="歌手" onChange={(e) => setArtist(e.target.value)} />
                <datalist id="wizard-artists">
                  {artists.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
            )}
            {shared.length > 0 && (
              <div className="shared-hits">
                <p className="hint">社区里已经有人做好了，直接加入就不用自己打点：</p>
                <div className="chips">
                  {shared.slice(0, 6).map((g) => (
                    <button key={g.id} className="shared-hit" onClick={() => onCommunity!(g.id)}>
                      <Art song={{ id: g.id, title: g.title, cover: g.cover ?? undefined }} />
                      <span>
                        <b lang="ja">{g.title}</b>
                        <small>
                          {g.artist}
                          {g.posts > 1 ? ` · ${g.posts} 份` : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="cover-hits">
              {hits?.length === 0 && <p className="hint">没搜到，改一下搜索词，或者手动填写。</p>}
              {hits?.map((h) => (
                <button key={h.trackId} className={picked?.trackId === h.trackId ? 'on' : ''} disabled={busy} onClick={() => pick(h)}>
                  <img src={h.url.replace('600x600bb', '200x200bb')} alt="" />
                  <b>{h.title}</b>
                  <span>{h.artist}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="wizard-body">
            <p className="hint">可以只传原曲；用 MISST / UVR 分离出人声和伴奏，练习时能调人声音量。也可以跳过，以后在编辑里补。</p>
            {TRACKS.map((k) => (
              <div className="track-row" key={k}>
                <b>{TRACK_LABEL[k]}</b>
                <span className="hint grow">{(audio[k] as File | undefined)?.name ?? '未上传'}</span>
                <label className="button">
                  {audio[k] ? '替换' : '上传'}
                  <input hidden type="file" accept="audio/*" onChange={(e) => addAudio(k, e.target.files?.[0])} />
                </label>
              </div>
            ))}
            <label
              className="drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f?.type.startsWith('audio/')) addAudio(TRACKS.find((k) => !audio[k]) ?? 'original', f)
              }}
            >
              把音频文件拖到这里
              <input hidden type="file" accept="audio/*" onChange={(e) => addAudio(TRACKS.find((k) => !audio[k]) ?? 'original', e.target.files?.[0])} />
            </label>
          </section>
        )}

        <div className="wizard-foot">
          {step > 1 && <button onClick={() => setStep(step - 1)}>上一步</button>}
          <span className="grow" />
          {step === 2 && <button onClick={() => setStep(3)}>跳过</button>}
          {step < 3 ? (
            <button className="primary" disabled={!lines.some((l) => l.text)} onClick={next}>
              下一步
            </button>
          ) : (
            <button className="primary" onClick={() => onDone(song)}>
              完成，开始练习
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
