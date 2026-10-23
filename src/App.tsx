import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { KANJI, annotateLine, setReading, type Annotated, type Seg } from './furigana'
import { alignTranslation, fmtTime, parseLyrics, toLrc } from './lrc'
import { Player, TRACK_LABEL, type TrackKey } from './player'
import { alignTimes } from './align'
import { searchCovers, toCover, type CoverHit } from './cover'
import { CLICK_LABEL, anchorFirst, beatGrid, parseSections, snapToBeat, tapFit, type ClickSound, type Section } from './beat'
import { FONTS, applyFonts, loadFonts, type FontSettings } from './fonts'
import { deleteRemote, pushSong, supabase, syncAll } from './cloud'
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

type Show = { kana: boolean; romaji: boolean; trans: boolean }
type LineProps = { a?: Annotated; trans?: string; show: Show; onRuby: (s: Seg) => void }

function LyricLine({ a, trans, show, onRuby }: LineProps) {
  if (!a) return null
  const click = (s: Seg) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onRuby(s)
  }
  return (
    <>
      <div className="jp" lang="ja">
        {a.segs.map((s, i) =>
          KANJI.test(s.text) ? (
            <ruby key={i} className="editable" title="双击修改读音" onDoubleClick={click(s)}>
              {s.text}
              {show.kana && <rt>{s.ruby}</rt>}
            </ruby>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
      {show.romaji && a.romaji && <div className="romaji">{a.romaji}</div>}
      {show.trans && trans && <div className="trans" lang="zh-CN">{trans}</div>}
    </>
  )
}

const STATUS = { want: '想学', learning: '正在学', learned: '已学会' } as const
type Status = keyof typeof STATUS
const nextStatus = (s?: Status) => ({ none: 'want', want: 'learning', learning: 'learned', learned: undefined } as const)[s ?? 'none']

// Free-text chips (tags, playlists): Enter or a comma adds, × removes, earlier values are suggested.
function ChipsInput({ label, values = [], options, placeholder, onChange }: { label: string; values?: string[]; options: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const id = useId()
  const add = () => {
    const t = draft.trim()
    setDraft('')
    if (t && !values.includes(t)) onChange([...values, t])
  }
  return (
    <div className="tag-edit">
      {label}
      {values.map((t) => (
        <span key={t} className="tag">
          {t}
          <button className="icon" title="删除" onClick={() => onChange(values.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        list={id}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // isComposing: Enter that confirms an IME (pinyin / kana) candidate must not add the chip yet
          if (e.nativeEvent.isComposing || (e.key !== 'Enter' && e.key !== ',' && e.key !== '，')) return
          e.preventDefault()
          add()
        }}
        onBlur={add}
      />
      <datalist id={id}>
        {options.filter((t) => !values.includes(t)).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  )
}

function FontPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const custom = !FONTS.some((f) => f.css === value)
  return (
    <label>
      {label}
      <select value={custom ? '' : value} onChange={(e) => onChange(e.target.value)}>
        {FONTS.map((f) => (
          <option key={f.css} value={f.css}>
            {f.label}
          </option>
        ))}
        <option value="">本机字体…</option>
      </select>
      {custom && <input value={value} placeholder="已安装的字体名，如 MiSans" onChange={(e) => onChange(e.target.value)} />}
    </label>
  )
}

export default function App() {
  const [songs, setSongs] = useState<SongMeta[]>([])
  const [song, setSong] = useState<Song | null>(null)
  const [tab, setTab] = useState<'library' | 'edit' | 'practice' | 'settings'>('edit')
  const [draft, setDraft] = useState('')
  const [link, setLink] = useState('')
  const [fetching, setFetching] = useState(false)
  const [annotated, setAnnotated] = useState<Annotated[]>([])
  const [dictError, setDictError] = useState('')
  const [show, setShow] = useState<Show>({ kana: true, romaji: true, trans: true })
  const [translating, setTranslating] = useState(false)
  const [, rerender] = useState(0)
  const [time, setTime] = useState(0)
  const [tempo, setTempo] = useState(1)
  const [tempoEdit, setTempoEdit] = useState<string | null>(null) // typed speed while the box is open
  // Loop: whole song, one line, or lines from..to (indices into song.lines).
  const [loop, setLoop] = useState<{ mode: 'off' | 'song' | 'line' | 'range'; from?: number; to?: number }>({ mode: 'off' })
  const [aligning, setAligning] = useState(false)
  const [coverHits, setCoverHits] = useState<CoverHit[] | null>(null) // online search results
  const [coverBusy, setCoverBusy] = useState(false)
  // Library filter: 'fav', 'status:<s>', 'list:<name>' or 'tag:<name>'.
  const [filter, setFilter] = useState<string | null>(null)
  const [queue, setQueue] = useState<{ name: string; ids: string[] } | null>(null) // practising a playlist
  const [savedAt, setSavedAt] = useState(0)
  const beforeAlign = useRef<Song['lines'] | null>(null) // lines before the last auto-align, for undo
  const [semi, setSemi] = useState(0)
  const [syncAt, setSyncAt] = useState<number | null>(null)
  const activeRef = useRef<HTMLLIElement>(null)
  const manualScroll = useRef(0) // when the user last scrolled the lyrics by hand
  const [fonts, setFonts] = useState<FontSettings>(loadFonts)
  const [user, setUser] = useState<string | null>(null) // signed-in email
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [syncError, setSyncError] = useState('')
  const syncFailed = (e: unknown) => {
    console.error(e)
    setSyncError((e as { message?: string })?.message ?? String(e))
    setSyncState('error')
  }
  const [loginEmail, setLoginEmail] = useState('')
  const [loginSent, setLoginSent] = useState(false)
  const songRef = useRef(song)
  songRef.current = song
  const pending = useRef(new Map<string, Song>())
  const taps = useRef<{ at: number; wall: number }[]>([])
  const [metroOpen, setMetroOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(() => innerWidth > 900) // floating controls panel; collapsed on small screens
  const pushTimer = useRef(0)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setUser(s?.user.email ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) runSync()
  }, [user])

  async function runSync() {
    setSyncState('syncing')
    try {
      await syncAll()
      const list = await listSongs()
      setSongs(list)
      // Fresh device: the unsaved blank song is showing, jump to the synced library.
      if (list[0] && !list.some((s) => s.id === songRef.current?.id)) await openSaved(list[0].id)
      setSyncState('idle')
    } catch (e) {
      syncFailed(e)
    }
  }

  // Debounced so typing in the editor does not upload on every keystroke.
  function queuePush(s: Song) {
    if (!user) return
    pending.current.set(s.id, s)
    clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(async () => {
      const batch = [...pending.current.values()]
      pending.current.clear()
      setSyncState('syncing')
      try {
        for (const x of batch) await pushSong(x)
        setSyncState('idle')
      } catch (e) {
        syncFailed(e)
      }
    }, 2000)
  }

  useEffect(() => applyFonts(fonts), [fonts])

  useEffect(() => {
    player.onState = () => rerender((n) => n + 1)
    listSongs().then(async (list) => {
      setSongs(list)
      const recent = list[0] && (await loadSong(list[0].id))
      // No songs: editor. One song: practise it. More: the library.
      setTab(list.length > 1 ? 'library' : recent ? 'practice' : 'edit')
      await open(recent || newSong())
    })
  }, [])

  async function openSaved(id: string) {
    setTab('practice')
    await open((await loadSong(id))!)
  }

  async function open(s: Song) {
    player.clear()
    setSong(s)
    setDraft(toLrc(s.lines))
    setSyncAt(null)
    setLoop({ mode: 'off' })
    setCoverHits(null)
    beforeAlign.current = null
    player.source.vocal = 1
    for (const k of TRACKS) await player.load(k, s.audio[k])
  }

  async function update(patch: Partial<Song>) {
    if (!song) return
    const next = { ...song, ...patch }
    setSong(next)
    await saveSong(next)
    setSongs(await listSongs())
    queuePush(next)
    setSavedAt(Date.now())
  }

  // Edits already save on every change; this is for peace of mind and uploads right away.
  async function saveNow() {
    if (!song) return
    await saveSong(song)
    setSongs(await listSongs())
    setSavedAt(Date.now())
    if (!user) return
    clearTimeout(pushTimer.current)
    pending.current.delete(song.id)
    setSyncState('syncing')
    try {
      await pushSong(song)
      setSyncState('idle')
    } catch (e) {
      syncFailed(e)
    }
  }

  // Song metadata edited from a library card (no need to open the song).
  async function patchSong(id: string, patch: Partial<Song>) {
    if (id === song?.id) return update(patch)
    const s = await loadSong(id)
    if (!s) return
    const next = { ...s, ...patch }
    await saveSong(next)
    setSongs(await listSongs())
    queuePush(next)
  }

  // Playlist practice: step to the previous / next song of the queue.
  async function step(dir: 1 | -1, play = player.playing) {
    if (!queue || !song) return
    const id = queue.ids[queue.ids.indexOf(song.id) + dir]
    if (!id) return
    await open((await loadSong(id))!)
    if (play) player.play()
  }

  function practiceList(name: string) {
    const ids = songs.filter((s) => s.lists?.includes(name)).map((s) => s.id)
    if (!ids.length) return
    setQueue({ name, ids })
    setTab('practice')
    void loadSong(ids[0]).then(async (s) => {
      await open(s!)
      player.play()
    })
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

  // Playhead polling on a timer that always runs (not tied to a play re-render or to rAF, which can stall),
  // so the bar follows playback however it was started.
  useEffect(() => {
    const id = setInterval(() => player.playing && setTime(player.heardTime), 40)
    return () => clearInterval(id)
  }, [])

  useEffect(() => void (player.tempo = tempo), [tempo])
  useEffect(() => {
    player.source.clicks = beatGrid(song?.beat ?? [], player.duration, player.sampleRate)
  }, [JSON.stringify(song?.beat), player.duration])
  useEffect(() => void (player.semitones = semi), [semi])

  useEffect(() => {
    const lines = song?.lines ?? []
    // A line ends where the next timed line starts, or at the end of the song.
    const end = (j: number) => lines.slice(j + 1).find((l) => l.time != null && l.time > lines[j].time!)?.time ?? player.duration
    const { mode, from, to } = loop
    const a = from != null ? Math.min(from, to ?? from) : -1, b = from != null ? Math.max(from, to ?? from) : -1
    player.setLoop(
      mode === 'song' ? [0, player.duration]
      : mode === 'line' && lines[a]?.time != null ? [lines[a].time!, end(a)]
      : mode === 'range' && to != null && lines[a]?.time != null ? [lines[a].time!, end(b)]
      : null,
    )
  }, [loop, song?.lines, player.duration])

  const active = useMemo(() => {
    let idx = -1
    song?.lines.forEach((l, i) => l.time != null && l.time <= time && (idx = i))
    return idx
  }, [song, time])

  // Keep the sung line centred, Apple Music style, unless the user scrolled away in the last 4 s.
  useEffect(() => {
    const li = activeRef.current
    if (!li || performance.now() - manualScroll.current < 4000) return
    // Centre on the whole window, a little above the middle, not on the lyrics box (which sits low).
    const r = li.getBoundingClientRect()
    li.closest('.sheet')?.scrollBy({ top: r.top + r.height / 2 - innerHeight * 0.45, behavior: 'smooth' })
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
        const lines = song.lines.map((l, j) => (j === i ? { ...l, time: +player.heardTime.toFixed(2) } : l))
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

  // Playlist practice moves on to the next song when one ends (a song loop never ends).
  useEffect(() => {
    player.onEnd = () => void (queue && step(1, true))
  })

  // Ctrl+S in the editor saves instead of opening the browser's save-page dialog.
  useEffect(() => {
    if (tab !== 'edit') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void saveNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Practice page shortcuts: T = tap tempo, Space = play/pause (Space belongs to lyric sync while syncing).
  useEffect(() => {
    if (tab !== 'practice' || syncAt != null) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.repeat || target.closest?.('textarea, select, input:not([type=range]):not([type=checkbox])')) return
      if (e.code === 'KeyT') tap()
      else if (e.code === 'Space') {
        target.blur?.() // otherwise a focused button would also be clicked on keyup
        if (player.playing) player.pause()
        else player.play()
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!song) return <p className="loading">加载中…</p>

  const hasAudio = TRACKS.some((k) => song.audio[k])
  const allTags = [...new Set(songs.flatMap((s) => s.tags ?? []))].sort()
  const allLists = [...new Set(songs.flatMap((s) => s.lists ?? []))].sort()
  const matches = (s: SongMeta) =>
    !filter ||
    (filter === 'fav' ? !!s.fav
    : filter.startsWith('status:') ? s.status === filter.slice(7)
    : filter.startsWith('list:') ? !!s.lists?.includes(filter.slice(5))
    : !!s.tags?.includes(filter.slice(4)))
  const pick = (f: string) => setFilter(filter === f ? null : f)
  const qPos = queue && queue.ids.indexOf(song.id)
  const tracks = player.source.tracks
  const onlyOriginal = !!tracks.original && !tracks.vocals && !tracks.instrumental
  const canVocal = !!tracks.vocals || (!!tracks.original && (!!tracks.instrumental || tracks.original.numberOfChannels > 1))
  const baseBpm = song.beat?.[0]?.bpm
  const metro = player.source.metronome
  const setMetro = (patch: Partial<typeof metro>) => {
    Object.assign(metro, patch)
    rerender((n) => n + 1)
  }
  const timed = song.lines.some((l) => l.time != null)
  const nextSync = syncAt == null ? -1 : song.lines.findIndex((l, i) => i >= syncAt && l.text)

  function clickLine(i: number, t: number) {
    manualScroll.current = 0
    if (loop.mode === 'line') setLoop({ mode: 'line', from: i })
    else if (loop.mode === 'range') {
      // First click picks the start, second the end; a third starts over.
      if (loop.from != null && loop.to == null && loop.from !== i) return setLoop({ ...loop, to: i })
      setLoop({ mode: 'range', from: i })
    }
    player.seek(t)
    setTime(t)
  }

  function cycleLoop() {
    const next = ({ off: 'song', song: timed ? 'line' : 'off', line: 'range', range: 'off' } as const)[loop.mode]
    const here = active >= 0 ? active : song!.lines.findIndex((l) => l.time != null)
    setLoop(next === 'line' || next === 'range' ? { mode: next, from: here } : { mode: next })
  }

  const inLoop = (i: number) => {
    const { mode, from, to } = loop
    if ((mode !== 'line' && mode !== 'range') || from == null) return false
    return i >= Math.min(from, to ?? from) && i <= Math.max(from, to ?? from) && !!song!.lines[i].text
  }

  async function autoAlign() {
    setAligning(true)
    try {
      const onset = await player.vocalOnsets()
      if (!onset) return
      // Always start from the hand taps, so pressing it again gives the same result instead of drifting.
      const tapped = beforeAlign.current?.length === song!.lines.length ? beforeAlign.current : song!.lines
      const times = alignTimes(tapped.map((l) => l.time), song!.beat ?? [], onset)
      beforeAlign.current = tapped
      await update({ lines: song!.lines.map((l, i) => ({ ...l, time: times[i] })) })
    } finally {
      setAligning(false)
    }
  }

  async function setCover(src: Blob | string) {
    setCoverBusy(true)
    try {
      await update({ cover: await toCover(src) })
      setCoverHits(null)
    } catch (e) {
      alert(`封面读取失败：${e}`)
    } finally {
      setCoverBusy(false)
    }
  }

  async function findCovers() {
    setCoverBusy(true)
    try {
      setCoverHits(await searchCovers(`${song!.title} ${song!.artist}`.trim()))
    } catch (e) {
      alert(`搜索失败：${e}`)
    } finally {
      setCoverBusy(false)
    }
  }

  async function setAudio(k: TrackKey, file?: File) {
    const audio = { ...song!.audio }
    if (file) audio[k] = file
    else delete audio[k]
    await update({ audio, audioRev: { ...song!.audioRev, [k]: Date.now() } })
    await player.load(k, file)
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

  async function autoTranslate() {
    if (song!.trans?.some(Boolean) && !confirm('覆盖现有翻译？')) return
    setTranslating(true)
    try {
      // Drop 漢字{よみ} overrides so the translator sees plain lyrics.
      const lines = song!.lines.filter((l) => l.text).map((l) => l.text.replace(/{[^}]*}/g, ''))
      const res = await fetch('/api/translate', { method: 'POST', body: JSON.stringify({ lines }) })
      if (!res.ok) return alert(`翻译失败：${await res.text()}`)
      await update({ trans: await res.json() })
    } catch (e) {
      alert(`翻译失败：${e}`)
    } finally {
      setTranslating(false)
    }
  }

  // Tap along with the beat (button or T). A pause over 2 s starts a new run; from the 4th tap on,
  // the run sets the BPM of the section it started in. In the first section the first tap is bar 1.
  function tap() {
    if (!player.playing) return
    const wall = performance.now()
    if (wall - (taps.current.at(-1)?.wall ?? 0) > 2000) taps.current = []
    taps.current.push({ at: player.heardTime, wall })
    rerender((n) => n + 1)
    const fit = tapFit(taps.current.map((t) => t.at))
    if (!fit || taps.current.length < 4) return
    const beat = song!.beat ?? []
    const i = beat.filter((s) => s.time <= fit.first + 0.05).length - 1
    if (i <= 0) {
      const beats = beat[0]?.beats ?? 4
      update({ beat: [{ time: anchorFirst(fit.first, fit.bpm, beats), bpm: fit.bpm, beats }, ...beat.slice(1)] })
    } else setSection(i, { bpm: fit.bpm })
    player.source.metronome.on = true
  }

  async function importBeat(file?: File) {
    if (!file) return
    try {
      const beat = parseSections(await file.text())
      if (song!.beat?.length && !confirm('导入会覆盖现有的节拍设置，继续？')) return
      update({ beat })
      player.source.metronome.on = true
    } catch (e) {
      alert(`导入失败：${e instanceof Error ? e.message : e}`)
    }
  }

  function setSection(i: number, patch: Partial<Section> | null) {
    const beat = song!.beat ?? []
    update({ beat: patch ? beat.map((s, j) => (j === i ? { ...s, ...patch } : s)) : beat.filter((_, j) => j !== i) })
  }

  // New sections start on the nearest beat of the section before, so the grids join seamlessly.
  function addSection() {
    const beat0 = song!.beat ?? []
    const now = snapToBeat(beat0, player.heardTime)
    const prev = beat0.filter((s) => s.time <= now).at(-1) ?? beat0[0]
    const beat = [...beat0, { time: now, bpm: prev?.bpm ?? 120, beats: prev?.beats ?? 4 }]
    update({ beat: beat.sort((a, b) => a.time - b.time) })
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
    <div className={`app ${tab === 'practice' ? 'practice' : ''} ${tab === 'practice' && panelOpen ? 'with-panel' : ''}`}>
      <header className="no-print">
        <button className="logo" onClick={() => setTab('library')}>
          うたまな<small>Utamana</small>
        </button>
        {tab !== 'library' && <span className="current">{song.title}</span>}
        <nav>
          <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>
            曲库
          </button>
          <button className={tab === 'practice' ? 'on' : ''} onClick={() => setTab('practice')}>
            练习
          </button>
          <button className={tab === 'edit' ? 'on' : ''} onClick={() => (setTab('edit'), setDraft(toLrc(song.lines)))}>
            编辑
          </button>
        </nav>
        {user && (
          <span className={`sync ${syncState}`} title={syncState === 'error' ? syncError : undefined}>
            {{ idle: '已同步', syncing: '同步中…', error: `同步失败：${syncError}` }[syncState]}
          </span>
        )}
        <button className={`gear ${tab === 'settings' ? 'on' : ''}`} title="设置" onClick={() => setTab(tab === 'settings' ? 'practice' : 'settings')}>
          设置
        </button>
      </header>

      {dictError && <p className="error no-print">词典加载失败：{dictError}</p>}

      {tab === 'settings' && (
        <main className="edit no-print">
          <section>
            <h2>账号同步</h2>
            <div className="row">
              {!supabase ? (
                <span className="hint">还没配置云同步，按 README 填好 .env.local 后重启。</span>
              ) : user ? (
                <>
                  <span>{user}</span>
                  <button disabled={syncState === 'syncing'} onClick={runSync}>
                    立即同步
                  </button>
                  <button onClick={() => supabase!.auth.signOut()}>退出</button>
                </>
              ) : loginSent ? (
                <span className="hint">登录链接已发到 {loginEmail}，在这台电脑上点开邮件里的链接即可。</span>
              ) : (
                <>
                  <input type="email" placeholder="邮箱" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                  <button
                    disabled={!loginEmail.includes('@')}
                    onClick={async () => {
                      const { error } = await supabase!.auth.signInWithOtp({ email: loginEmail.trim(), options: { emailRedirectTo: location.origin } })
                      if (error) alert(`发送失败：${error.message}`)
                      else setLoginSent(true)
                    }}
                  >
                    发送登录链接
                  </button>
                </>
              )}
            </div>
          </section>
          <section>
            <h2>字体</h2>
            <div className="row">
              <FontPicker label="界面字体" value={fonts.ui} onChange={(ui) => setFonts({ ...fonts, ui })} />
              <FontPicker label="歌词字体" value={fonts.lyric} onChange={(lyric) => setFonts({ ...fonts, lyric })} />
            </div>
            <p className="jp preview" lang="ja">
              <ruby>
                明日<rt>あした</rt>
              </ruby>
              の
              <ruby>
                空<rt>そら</rt>
              </ruby>
              を見上げて
            </p>
          </section>
        </main>
      )}

      {tab === 'library' && (
        <main className="library no-print">
          <h2>
            我的曲库 <span className="hint">{songs.length} 首</span>
          </h2>
          <div className="chips tag-filter">
            <button className={filter == null ? 'on' : ''} onClick={() => setFilter(null)}>
              全部
            </button>
            <button className={filter === 'fav' ? 'on' : ''} onClick={() => pick('fav')}>
              ★ 收藏
            </button>
            {(Object.keys(STATUS) as Status[]).map((k) => (
              <button key={k} className={filter === `status:${k}` ? 'on' : ''} onClick={() => pick(`status:${k}`)}>
                {STATUS[k]}
              </button>
            ))}
          </div>
          {allLists.length > 0 && (
            <div className="chips tag-filter">
              <span className="hint">歌单</span>
              {allLists.map((t) => (
                <button key={t} className={filter === `list:${t}` ? 'on' : ''} onClick={() => pick(`list:${t}`)}>
                  {t}
                </button>
              ))}
              {filter?.startsWith('list:') && (
                <button className="play" onClick={() => practiceList(filter.slice(5))}>
                  ▶ 按歌单练习
                </button>
              )}
            </div>
          )}
          {allTags.length > 0 && (
            <div className="chips tag-filter">
              <span className="hint">标签</span>
              {allTags.map((t) => (
                <button key={t} className={filter === `tag:${t}` ? 'on' : ''} onClick={() => pick(`tag:${t}`)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="grid">
            <button className="card new" onClick={() => (open(newSong()), setTab('edit'))}>
              ＋ 新建歌曲
            </button>
            {songs.filter(matches).map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                className={`card ${s.id === song.id ? 'current-card' : ''}`}
                onClick={() => (setQueue(null), openSaved(s.id))}
                onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && (setQueue(null), openSaved(s.id))}
              >
                <button className={`fav ${s.fav ? 'on' : ''}`} title={s.fav ? '取消收藏' : '收藏'} onClick={(e) => (e.stopPropagation(), patchSong(s.id, { fav: !s.fav }))}>
                  {s.fav ? '★' : '☆'}
                </button>
                <span className="card-cover">{s.cover ? <img src={s.cover} alt="" /> : <b lang="ja">{s.title.slice(0, 1)}</b>}</span>
                <span className="card-title">{s.title}</span>
                <span className="card-artist">{s.artist || '未填歌手'}</span>
                <button
                  className={`status ${s.status ?? ''}`}
                  title="点击切换：想学 → 正在学 → 已学会"
                  onClick={(e) => (e.stopPropagation(), patchSong(s.id, { status: nextStatus(s.status) }))}
                >
                  {s.status ? STATUS[s.status] : '＋ 学习状态'}
                </button>
                <span className="badges">
                  {s.tags?.map((t) => (
                    <i key={t}>{t}</i>
                  ))}
                </span>
                <span className="card-date">{new Date(s.updated).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </main>
      )}

      {tab === 'edit' && (
        <main className="edit no-print">
          <div className="row">
            <label>
              歌名 <input value={song.title} onChange={(e) => update({ title: e.target.value })} />
            </label>
            <label>
              歌手 <input value={song.artist} onChange={(e) => update({ artist: e.target.value })} />
            </label>
            <ChipsInput label="标签" values={song.tags} options={allTags} placeholder="如 ACG、BanG Dream!，回车添加" onChange={(tags) => update({ tags })} />
            <ChipsInput label="歌单" values={song.lists} options={allLists} placeholder="歌单名，回车添加" onChange={(lists) => update({ lists })} />
            <label>
              学习状态
              <select value={song.status ?? ''} onChange={(e) => update({ status: (e.target.value || undefined) as Status | undefined })}>
                <option value="">未设置</option>
                {(Object.keys(STATUS) as Status[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUS[k]}
                  </option>
                ))}
              </select>
            </label>
            <button className={song.fav ? 'on' : ''} onClick={() => update({ fav: !song.fav })}>
              {song.fav ? '★ 已收藏' : '☆ 收藏'}
            </button>
            <span className="save">
              <button className="play" onClick={saveNow}>
                保存
              </button>
              <span className="hint">{savedAt ? `已保存 ${new Date(savedAt).toLocaleTimeString()}` : '修改会自动保存'}</span>
            </span>
          </div>

          <section>
            <h2>封面</h2>
            <div className="row">
              {song.cover ? <img className="cover-preview" src={song.cover} alt="封面" /> : <span className="cover-preview empty">无封面</span>}
              <button disabled={coverBusy || !song.title.trim()} title="用歌名和歌手在 Apple Music 搜索" onClick={findCovers}>
                {coverBusy ? '处理中…' : '联网搜索'}
              </button>
              <label className="button">
                上传图片
                <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && setCover(e.target.files[0])} />
              </label>
              {song.cover && <button onClick={() => update({ cover: undefined })}>移除</button>}
            </div>
            {coverHits && (
              <div className="cover-hits">
                {!coverHits.length && <p className="hint">没搜到，试试改一下歌名或歌手，或者自己上传。</p>}
                {coverHits.map((h) => (
                  <button key={h.url} title={`${h.title} · ${h.artist}\n${h.album}`} disabled={coverBusy} onClick={() => setCover(h.url)}>
                    <img src={h.url.replace('600x600bb', '200x200bb')} alt={h.album} />
                    <span>{h.album}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

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
              lang="ja"
              value={draft}
              spellCheck={false}
              onChange={(e) => {
                setDraft(e.target.value)
                update({ lines: parseLyrics(e.target.value) })
              }}
            />
          </section>

          <section>
            <h2>翻译</h2>
            <p className="hint">一行对应一句歌词（空行不算）。带时间轴的 LRC 翻译会按时间对齐。</p>
            <div className="row">
              <label className="button">
                导入翻译 .txt / .lrc
                <input hidden type="file" accept=".txt,.lrc,text/plain" onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) update({ trans: alignTranslation(song.lines, await f.text()) })
                }} />
              </label>
              <button disabled={!song.lines.length || translating} onClick={autoTranslate}>
                {translating ? '翻译中…' : '自动翻译（Google）'}
              </button>
            </div>
            <textarea
              className="short"
              value={(song.trans ?? []).join('\n')}
              spellCheck={false}
              onChange={(e) => update({ trans: e.target.value.split('\n') })}
            />
          </section>

          <section className="danger">
            <button
              onClick={async () => {
                if (!confirm(`删除「${song.title}」？歌词和音频都会删掉，不能恢复。`)) return
                await deleteSong(song.id)
                deleteRemote(song.id).catch(syncFailed)
                setSongs(await listSongs())
                open(newSong())
                setTab('library')
              }}
            >
              删除这首歌
            </button>
          </section>
        </main>
      )}

      {tab === 'practice' && (panelOpen ? (
        <aside className={`panel no-print ${metroOpen ? 'wide' : ''}`}>
          <div className="panel-head">
            <b>练习设置</b>
            <button className="icon" title="收起" onClick={() => setPanelOpen(false)}>
              ✕
            </button>
          </div>
          {hasAudio && (
            <>
              <div className="panel-sec">
                <div className="slider">
                  <span>速度</span>
                  {tempoEdit == null ? (
                    <output title="双击输入" onDoubleClick={() => setTempoEdit(String(baseBpm ? +(baseBpm * tempo).toFixed(1) : Math.round(tempo * 100)))}>
                      {baseBpm ? `♩=${Math.round(baseBpm * tempo)}` : `${Math.round(tempo * 100)}%`}
                    </output>
                  ) : (
                    <input
                      className="num"
                      autoFocus
                      value={tempoEdit}
                      onChange={(e) => setTempoEdit(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => {
                        const n = parseFloat(tempoEdit)
                        // Same 50%-150% range as the slider; BPM when the song has one, otherwise percent.
                        if (n > 0) setTempo(Math.min(1.5, Math.max(0.5, baseBpm ? n / baseBpm : n / 100)))
                        setTempoEdit(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        else if (e.key === 'Escape') setTempoEdit(null)
                      }}
                    />
                  )}
                  {baseBpm ? (
                    <input
                      type="range"
                      title={`原速 ${baseBpm} BPM`}
                      min={Math.round(baseBpm * 0.5)}
                      max={Math.round(baseBpm * 1.5)}
                      step={1}
                      value={Math.round(baseBpm * tempo)}
                      onChange={(e) => setTempo(+e.target.value / baseBpm)}
                    />
                  ) : (
                    <input type="range" min={0.5} max={1.5} step={0.05} value={tempo} onChange={(e) => setTempo(+e.target.value)} />
                  )}
                </div>
                <div className="slider">
                  <span>Key</span>
                  <output>{semi > 0 ? `+${semi}` : semi}</output>
                  <input type="range" min={-6} max={6} step={1} value={semi} onChange={(e) => setSemi(+e.target.value)} />
                </div>
                <button className="link" disabled={tempo === 1 && semi === 0} onClick={() => (setTempo(1), setSemi(0))}>
                  复原速度和 Key
                </button>
              </div>
              <div className="panel-sec">
                <div className="sec-title">
                  <span>节拍器</span>
                  {baseBpm && <span className="hint">{song.beat!.length > 1 ? `${song.beat!.length} 段 · ` : ''}♩={baseBpm}</span>}
                  <label className="switch" title="开关节拍器">
                    <input type="checkbox" checked={metro.on} onChange={(e) => setMetro({ on: e.target.checked })} />
                    <i />
                  </label>
                </div>
                <div className="chips">
                  <button className={taps.current.length ? 'on' : ''} disabled={!player.playing} title="播放时跟着拍子点，或按 T 键" onClick={tap}>
                    点按测速 T{taps.current.length ? ` · ${taps.current.length}` : ''}
                  </button>
                  <button className={metroOpen ? 'on' : ''} onClick={() => setMetroOpen(!metroOpen)}>
                    分段设置 {metroOpen ? '▴' : '▾'}
                  </button>
                </div>
              {metroOpen && (
              <div className="metro-details">
                <div className="row">
                <select value={metro.sound} onChange={(e) => setMetro({ sound: e.target.value as ClickSound })}>
                  {Object.entries(CLICK_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <label>
                  音量
                  <input type="range" min={0} max={1.5} step={0.05} value={metro.volume} onChange={(e) => setMetro({ volume: +e.target.value })} />
                </label>
                <button onClick={addSection}>＋ 从当前位置变拍</button>
                <label className="button">
                  导入节拍
                  <input hidden type="file" accept=".json,application/json" onChange={(e) => importBeat(e.target.files?.[0])} />
                </label>
                <button disabled={!song.beat?.length} onClick={() => download(`${song.title}-节拍.json`, JSON.stringify(song.beat))}>
                  导出节拍
                </button>
              </div>
              {!!song.beat?.length && (
                <div className="sections">
                  {song.beat.map((s, i) => (
                    <div className="row" key={i}>
                      {i > 0 && song.beat![i - 1].bpm > 0 && (
                        <button title="提前一拍" onClick={() => setSection(i, { time: +(s.time - 60 / song.beat![i - 1].bpm).toFixed(3) })}>
                          ‹
                        </button>
                      )}
                      <button
                        className="time"
                        title={i ? '设为当前播放位置（自动对齐到前一段的拍子）' : '设为当前播放位置'}
                        onClick={() => setSection(i, { time: i ? snapToBeat(song.beat!, player.heardTime, i) : +player.heardTime.toFixed(3) })}
                      >
                        {fmtTime(s.time)}
                      </button>
                      {i > 0 && song.beat![i - 1].bpm > 0 && (
                        <button title="推后一拍" onClick={() => setSection(i, { time: +(s.time + 60 / song.beat![i - 1].bpm).toFixed(3) })}>
                          ›
                        </button>
                      )}
                      <label>
                        BPM
                        <input type="number" min={0} max={400} step={0.1} value={s.bpm} title="0 = 这一段不响" onChange={(e) => setSection(i, { bpm: e.target.value === '' ? s.bpm : Math.max(0, +e.target.value) })} />
                      </label>
                      <button onClick={() => setSection(i, { bpm: s.bpm / 2 })}>÷2</button>
                      <button onClick={() => setSection(i, { bpm: s.bpm * 2 })}>×2</button>
                      <label>
                        每小节
                        <input type="number" min={1} max={16} value={s.beats} onChange={(e) => setSection(i, { beats: Math.max(1, +e.target.value) })} />
                        拍
                      </label>
                      {i > 0 && <button onClick={() => setSection(i, null)}>删除</button>}
                    </div>
                  ))}
                </div>
              )}
                <p className="hint">播放时跟着拍子点「点按测速」或按 T，点 4 下以上就设好 BPM，第一下当作小节第一拍。变拍子的地方点「从当前位置变拍」，会自动对齐到前一段最近的拍子；差一拍就用 ‹ › 挪。</p>
              </div>
              )}
              </div>
            </>
          )}
          <div className="panel-sec">
            <div className="sec-title">
              <span>显示</span>
            </div>
            <div className="chips">
              {(['kana', 'romaji', 'trans'] as const).map((k) => (
                <button key={k} className={show[k] ? 'on' : ''} onClick={() => setShow({ ...show, [k]: !show[k] })}>
                  {{ kana: '假名', romaji: '罗马音', trans: '翻译' }[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-sec">
            <div className="chips">
              {hasAudio &&
                (syncAt == null ? (
                  <button onClick={() => (setSyncAt(0), player.seek(0), player.play())}>{timed ? '重新打点' : '开始打点'}</button>
                ) : (
                  <button className="on" onClick={() => setSyncAt(null)}>
                    结束打点
                  </button>
                ))}
              {hasAudio && timed && syncAt == null && (
                <button disabled={aligning} title="在每句打的点附近找人声开始的位置，对齐到节拍（16 分音符）" onClick={autoAlign}>
                  {aligning ? '校准中…' : '自动校准打点'}
                </button>
              )}
              {beforeAlign.current && (
                <button onClick={() => (update({ lines: song.lines.map((l, i) => ({ ...l, time: beforeAlign.current![i]?.time ?? l.time })) }), (beforeAlign.current = null))}>撤销校准</button>
              )}
              <button onClick={() => window.print()}>打印 / PDF</button>
            </div>
            {syncAt != null && <p className="hint">每句开始唱时按空格，按退格回到上一句</p>}
            {!hasAudio && <p className="hint">还没上传音频，可以在「编辑」里上传。</p>}
          </div>
        </aside>
      ) : (
        <button className="float-toggle no-print" title="速度、Key、节拍器、显示" onClick={() => setPanelOpen(true)}>
          ⚙ 练习设置
        </button>
      ))}


      <article
        className={`sheet ${timed ? 'timed' : ''} ${tab === 'edit' ? 'print-only' : ''} ${tab === 'library' || tab === 'settings' ? 'hidden' : ''}`}
        onWheel={() => (manualScroll.current = performance.now())}
        onTouchMove={() => (manualScroll.current = performance.now())}
        onMouseDown={(e) => e.target === e.currentTarget && (manualScroll.current = performance.now())} // scrollbar drag
      >
        <h1 className="sheet-title" lang="ja">
          {song.title}
          {song.artist && <small> {song.artist}</small>}
        </h1>
        {!song.lines.length && <p className="hint no-print">还没有歌词，去「编辑」里粘贴。</p>}
        <ol>
          {song.lines.map((l, i, all) => (
            <li
              key={i}
              ref={i === active ? activeRef : undefined}
              className={[!l.text && 'gap', i === active && 'active', i === nextSync && 'next', inLoop(i) && 'in-loop'].filter(Boolean).join(' ')}
              onClick={() => l.time != null && syncAt == null && clickLine(i, l.time)}
            >
              {l.text && <LyricLine a={annotated[i]} trans={song.trans?.[all.slice(0, i).filter((x) => x.text).length]} show={show} onRuby={(s) => editReading(i, s)} />}
              {l.text && (
                <button className="edit-line no-print" title="修改这句歌词" onClick={(e) => (e.stopPropagation(), editLine(i))}>
                  ✎
                </button>
              )}
            </li>
          ))}
        </ol>
      </article>

      {tab === 'practice' && hasAudio && (
        <div className="row transport no-print">
          {queue && (
            <span className="queue">
              <button className="icon" title="上一首" disabled={!qPos} onClick={() => step(-1)}>
                ⏮
              </button>
              <span className="hint" title="按歌单练习">
                {queue.name} {qPos! + 1}/{queue.ids.length}
              </span>
              <button className="icon" title="下一首" disabled={qPos! + 1 >= queue.ids.length} onClick={() => step(1)}>
                ⏭
              </button>
              <button className="icon" title="退出歌单练习" onClick={() => setQueue(null)}>
                ×
              </button>
            </span>
          )}
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
          <div className="pop" tabIndex={0} title="总音量">
            🔊 {Math.round(player.volume * 100)}%
            <span className="pop-bar">
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={player.volume}
                onChange={(e) => {
                  player.volume = +e.target.value
                  rerender((n) => n + 1)
                }}
              />
            </span>
          </div>
          <button
            className={`loop-chip ${loop.mode !== 'off' ? 'on' : ''}`}
            title="循环：关 → 单曲 → 单句 → 范围（点两句歌词选范围）"
            onClick={cycleLoop}
          >
            🔁 {{ off: '循环', song: '单曲', line: '单句', range: loop.to == null ? '点终点句' : '范围' }[loop.mode]}
          </button>
          {canVocal && (
            <div className="pop" tabIndex={0} title={onlyOriginal ? '只有原曲时按频段去掉居中的人声，效果有限；上传分离好的人声和伴奏效果最好' : '伴奏音量不变，只调人声'}>
              🎤 {player.karaokeBusy ? '处理中…' : `${Math.round(player.source.vocal * 100)}%`}
              <span className="pop-bar">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={player.source.vocal}
                  onChange={(e) => {
                    player.source.vocal = +e.target.value
                    if (onlyOriginal && player.source.vocal < 1) void player.buildKaraoke()
                    rerender((n) => n + 1)
                  }}
                />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

