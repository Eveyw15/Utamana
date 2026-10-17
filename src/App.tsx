import { useEffect, useMemo, useRef, useState } from 'react'
import { KANJI, annotateLine, setReading, type Annotated, type Seg } from './furigana'
import { fmtTime, parseLyrics, toLrc } from './lrc'
import { Player, TRACK_LABEL, type TrackKey } from './player'
import { deleteSong, listSongs, loadSong, saveSong, type Song, type SongMeta } from './db'

const player = new Player()
const TRACKS: TrackKey[] = ['original', 'vocals', 'instrumental']

const newSong = (): Song => ({ id: crypto.randomUUID(), title: '新歌曲', artist: '', lines: [], audio: {}, updated: 0 })

function download(name: string, data: Blob | string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

type LineProps = { a?: Annotated; show: { kana: boolean; romaji: boolean }; onRuby: (s: Seg) => void }

function LyricLine({ a, show, onRuby }: LineProps) {
  if (!a) return null
  const click = (s: Seg) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onRuby(s)
  }
  return (
    <>
      <div className="jp">
        {a.segs.map((s, i) =>
          KANJI.test(s.text) ? (
            <ruby key={i} className="editable" title="点击修改读音" onClick={click(s)}>
              {s.text}
              {show.kana && <rt>{s.ruby}</rt>}
            </ruby>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
      {show.romaji && a.romaji && <div className="romaji">{a.romaji}</div>}
    </>
  )
}

export default function App() {
  const [songs, setSongs] = useState<SongMeta[]>([])
  const [song, setSong] = useState<Song | null>(null)
  const [tab, setTab] = useState<'edit' | 'practice'>('edit')
  const [draft, setDraft] = useState('')
  const [link, setLink] = useState('')
  const [fetching, setFetching] = useState(false)
  const [annotated, setAnnotated] = useState<Annotated[]>([])
  const [dictError, setDictError] = useState('')
  const [show, setShow] = useState({ kana: true, romaji: true })
  const [, rerender] = useState(0)
  const [time, setTime] = useState(0)
  const [tempo, setTempo] = useState(1)
  const [semi, setSemi] = useState(0)
  const [syncAt, setSyncAt] = useState<number | null>(null)
  const activeRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    player.onState = () => rerender((n) => n + 1)
    listSongs().then(async (list) => {
      setSongs(list)
      await open(list[0] ? (await loadSong(list[0].id)) ?? newSong() : newSong())
    })
  }, [])

  async function open(s: Song) {
    player.clear()
    setSong(s)
    setDraft(toLrc(s.lines))
    setSyncAt(null)
    for (const k of TRACKS) await player.load(k, s.audio[k])
    applyDefaultGains(s)
  }

  function applyDefaultGains(s: Song) {
    // With stems, start on the stems; with original + instrumental only, start on the original.
    const stems = !!(s.audio.vocals && s.audio.instrumental)
    player.source.gains = { original: stems ? 0 : 1, vocals: 1, instrumental: s.audio.original && !stems ? 0 : 1 }
    rerender((n) => n + 1)
  }

  async function update(patch: Partial<Song>) {
    if (!song) return
    const next = { ...song, ...patch }
    setSong(next)
    await saveSong(next)
    setSongs(await listSongs())
  }

  // Re-annotate whenever the lyric text changes.
  useEffect(() => {
    if (!song) return
    let stale = false
    Promise.all(song.lines.map((l) => annotateLine(l.text)))
      .then((a) => !stale && setAnnotated(a))
      .catch((e) => setDictError(String(e)))
    return () => {
      stale = true
    }
  }, [song?.lines.map((l) => l.text).join('\n')])

  // Playhead polling while playing.
  useEffect(() => {
    if (!player.playing) return
    let raf = 0
    const tick = () => {
      setTime(player.currentTime)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [player.playing])

  useEffect(() => void (player.tempo = tempo), [tempo])
  useEffect(() => void (player.semitones = semi), [semi])

  const active = useMemo(() => {
    let idx = -1
    song?.lines.forEach((l, i) => l.time != null && l.time <= time && (idx = i))
    return idx
  }, [song, time])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  // Tap-to-sync: Space stamps the current line, Backspace steps back.
  useEffect(() => {
    if (syncAt == null || !song) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        let i = syncAt
        while (i < song.lines.length && !song.lines[i].text) i++
        if (i >= song.lines.length) return setSyncAt(null)
        const lines = song.lines.map((l, j) => (j === i ? { ...l, time: +player.currentTime.toFixed(2) } : l))
        update({ lines })
        setSyncAt(i + 1)
      } else if (e.code === 'Backspace') {
        e.preventDefault()
        let i = syncAt - 1
        while (i > 0 && !song.lines[i].text) i--
        setSyncAt(Math.max(0, i))
        player.seek(Math.max(0, (song.lines[i - 1]?.time ?? 0) - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [syncAt, song])

  if (!song) return <p className="loading">加载中…</p>

  const hasAudio = TRACKS.some((k) => song.audio[k])
  const timed = song.lines.some((l) => l.time != null)
  const nextSync = syncAt == null ? -1 : song.lines.findIndex((l, i) => i >= syncAt && l.text)

  async function setAudio(k: TrackKey, file?: File) {
    const audio = { ...song!.audio }
    if (file) audio[k] = file
    else delete audio[k]
    await update({ audio })
    await player.load(k, file)
    applyDefaultGains({ ...song!, audio })
  }

  async function importLink() {
    setFetching(true)
    try {
      const res = await fetch(`/api/audio?url=${encodeURIComponent(link.trim())}`)
      if (!res.ok) return alert(`导入失败：${await res.text()}`)
      await setAudio('original', new File([await res.blob()], `${song!.title}.m4a`))
      setLink('')
    } catch (e) {
      alert(`导入失败：${e}`)
    } finally {
      setFetching(false)
    }
  }

  function setLine(i: number, text: string) {
    update({ lines: song!.lines.map((l, j) => (j === i ? { ...l, text } : l)) })
  }

  function editReading(i: number, s: Seg) {
    const r = prompt(`「${s.text}」的读音（假名或罗马音，留空恢复自动）`, s.ruby ?? '')
    if (r != null) setLine(i, setReading(song!.lines[i].text, s, r))
  }

  function editLine(i: number) {
    const t = prompt('修改歌词（读音可写成 漢字{よみ}）', song!.lines[i].text)
    if (t != null) setLine(i, t.trim())
  }

  async function importLyrics(file?: File) {
    if (!file) return
    const text = await file.text()
    setDraft(text)
    update({ lines: parseLyrics(text), title: song!.title === '新歌曲' ? file.name.replace(/\.\w+$/, '') : song!.title })
  }

  return (
    <div className="app">
      <header className="no-print">
        <h1>歌词学习</h1>
        <select value={song.id} onChange={async (e) => open((await loadSong(e.target.value))!)}>
          {!songs.some((s) => s.id === song.id) && <option value={song.id}>{song.title}（未保存）</option>}
          {songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.artist && ` - ${s.artist}`}
            </option>
          ))}
        </select>
        <button onClick={() => open(newSong())}>新建</button>
        <button
          onClick={async () => {
            if (!confirm(`删除「${song.title}」？`)) return
            await deleteSong(song.id)
            const list = await listSongs()
            setSongs(list)
            open(list[0] ? (await loadSong(list[0].id))! : newSong())
          }}
        >
          删除
        </button>
        <nav>
          <button className={tab === 'edit' ? 'on' : ''} onClick={() => (setTab('edit'), setDraft(toLrc(song.lines)))}>
            编辑
          </button>
          <button className={tab === 'practice' ? 'on' : ''} onClick={() => setTab('practice')}>
            练习
          </button>
        </nav>
      </header>

      {dictError && <p className="error no-print">词典加载失败：{dictError}</p>}

      {tab === 'edit' && (
        <main className="edit no-print">
          <div className="row">
            <label>
              歌名 <input value={song.title} onChange={(e) => update({ title: e.target.value })} />
            </label>
            <label>
              歌手 <input value={song.artist} onChange={(e) => update({ artist: e.target.value })} />
            </label>
          </div>

          <section>
            <h2>音频</h2>
            <p className="hint">用 MISST / UVR 分离出人声和伴奏后分别上传，练习页可以调人声音量。只有原曲也可以。</p>
            <div className="row">
              <input className="grow" placeholder="粘贴 B站 / YouTube 链接，导入为原曲" value={link} onChange={(e) => setLink(e.target.value)} />
              <button disabled={!link.trim() || fetching} onClick={importLink}>
                {fetching ? '下载中…' : '从链接导入'}
              </button>
            </div>
            {TRACKS.map((k) => (
              <div className="row" key={k}>
                <span className="track">{TRACK_LABEL[k]}</span>
                <input type="file" accept="audio/*" onChange={(e) => setAudio(k, e.target.files?.[0])} />
                {song.audio[k] && (
                  <>
                    <span className="hint">{(song.audio[k] as File).name ?? '已上传'}</span>
                    <button onClick={() => download((song.audio[k] as File).name ?? `${song.title}-${TRACK_LABEL[k]}`, song.audio[k]!)}>保存到本地</button>
                    <button onClick={() => setAudio(k)}>移除</button>
                  </>
                )}
              </div>
            ))}
          </section>

          <section>
            <h2>歌词</h2>
            <p className="hint">
              一行一句，粘贴纯文本或 LRC 都行。读音不对时写成 <code>漢字{'{'}よみ{'}'}</code> 手动指定。
            </p>
            <div className="row">
              <label className="button">
                导入 .txt / .lrc
                <input hidden type="file" accept=".txt,.lrc,text/plain" onChange={(e) => importLyrics(e.target.files?.[0])} />
              </label>
              <button disabled={!song.lines.length} onClick={() => download(`${song.title}.lrc`, toLrc(song.lines, song.title, song.artist))}>
                导出 .lrc
              </button>
            </div>
            <textarea
              value={draft}
              spellCheck={false}
              onChange={(e) => {
                setDraft(e.target.value)
                update({ lines: parseLyrics(e.target.value) })
              }}
            />
          </section>
        </main>
      )}

      {tab === 'practice' && (
        <div className="controls no-print">
          {hasAudio ? (
            <>
              <div className="row">
                <button className="play" onClick={() => (player.playing ? player.pause() : player.play())}>
                  {player.playing ? '暂停' : '播放'}
                </button>
                <span className="time">{fmtTime(time)}</span>
                <input
                  className="grow"
                  type="range"
                  min={0}
                  max={player.duration}
                  step={0.1}
                  value={time}
                  onChange={(e) => {
                    player.seek(+e.target.value)
                    setTime(+e.target.value)
                  }}
                />
                <span className="time">{fmtTime(player.duration)}</span>
              </div>
              <div className="row">
                <label>
                  速度 {Math.round(tempo * 100)}%
                  <input type="range" min={0.5} max={1.5} step={0.05} value={tempo} onChange={(e) => setTempo(+e.target.value)} />
                </label>
                <label>
                  Key {semi > 0 ? `+${semi}` : semi}
                  <input type="range" min={-6} max={6} step={1} value={semi} onChange={(e) => setSemi(+e.target.value)} />
                </label>
                <button onClick={() => (setTempo(1), setSemi(0))}>复原</button>
              </div>
              <div className="row">
                {TRACKS.filter((k) => song.audio[k]).map((k) => (
                  <label key={k}>
                    {TRACK_LABEL[k]} {Math.round(player.source.gains[k] * 100)}%
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={player.source.gains[k]}
                      onChange={(e) => {
                        player.source.gains[k] = +e.target.value
                        rerender((n) => n + 1)
                      }}
                    />
                  </label>
                ))}
                {song.audio.original && (
                  <label title="把原曲左右声道相减，能去掉居中的人声，音质会变差">
                    <input
                      type="checkbox"
                      checked={player.source.karaoke}
                      onChange={(e) => {
                        player.source.karaoke = e.target.checked
                        rerender((n) => n + 1)
                      }}
                    />
                    原曲简易消人声
                  </label>
                )}
              </div>
            </>
          ) : (
            <p className="hint">还没上传音频，可以在「编辑」里上传。</p>
          )}
          <div className="row">
            <label>
              <input type="checkbox" checked={show.kana} onChange={(e) => setShow({ ...show, kana: e.target.checked })} />
              假名
            </label>
            <label>
              <input type="checkbox" checked={show.romaji} onChange={(e) => setShow({ ...show, romaji: e.target.checked })} />
              罗马音
            </label>
            {hasAudio &&
              (syncAt == null ? (
                <button onClick={() => (setSyncAt(0), player.seek(0), player.play())}>{timed ? '重新打点' : '开始打点'}</button>
              ) : (
                <>
                  <button className="on" onClick={() => setSyncAt(null)}>
                    结束打点
                  </button>
                  <span className="hint">每句开始唱时按空格，按退格回到上一句</span>
                </>
              ))}
            <button onClick={() => window.print()}>打印 / 导出 PDF</button>
          </div>
        </div>
      )}

      <article className={`sheet ${tab === 'edit' ? 'print-only' : ''}`}>
        <h1 className="sheet-title">
          {song.title}
          {song.artist && <small> {song.artist}</small>}
        </h1>
        {!song.lines.length && <p className="hint no-print">还没有歌词，去「编辑」里粘贴。</p>}
        <ol>
          {song.lines.map((l, i) => (
            <li
              key={i}
              ref={i === active ? activeRef : undefined}
              className={[!l.text && 'gap', i === active && 'active', i === nextSync && 'next'].filter(Boolean).join(' ')}
              onClick={() => l.time != null && syncAt == null && (player.seek(l.time), setTime(l.time))}
            >
              {l.text && <LyricLine a={annotated[i]} show={show} onRuby={(s) => editReading(i, s)} />}
              {l.text && (
                <button className="edit-line no-print" title="修改这句歌词" onClick={(e) => (e.stopPropagation(), editLine(i))}>
                  ✎
                </button>
              )}
            </li>
          ))}
        </ol>
      </article>
    </div>
  )
}

