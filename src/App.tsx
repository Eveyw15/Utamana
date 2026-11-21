import { useEffect, useMemo, useRef, useState } from 'react'
import { KANJI, annotateLine, setReading, type Annotated, type Seg } from './furigana'
import { alignTranslation, fmtTime, parseLyrics, toLrc } from './lrc'
import { Player, TRACK_LABEL, type TrackKey } from './player'
import { alignTimes } from './align'
import { searchCovers, toBackground, toCover, type CoverHit } from './cover'
import { CLICK_LABEL, anchorFirst, beatGrid, beatPhase, parseSections, snapToBeat, tapFit, type ClickSound, type Section } from './beat'
import { translateLines } from './translate'
import { FONTS, applyFonts, loadFonts, type FontSettings } from './fonts'
import { deleteRemote, pushSong, supabase, syncAll } from './cloud'
import { deleteSong, listSongs, loadSong, saveSong, type Song, type SongMeta } from './db'
import { STATUS, markOpened, type Status } from './rows'
import { FALLBACK_THEME, THEMES, themeFor } from './theme'
import { Backdrop } from './Backdrop'
import { Art } from './Art'
import { ChipsPicker } from './ChipsPicker'
import { Library } from './Library'
import { NewSong } from './NewSong'

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
  const [tab, setTab] = useState<'library' | 'practice' | 'settings' | 'new'>('library')
  const [editing, setEditing] = useState(false) // practice page switched to edit mode
  const [editTab, setEditTab] = useState<'lyrics' | 'trans' | 'audio'>('lyrics')
  const [coverPop, setCoverPop] = useState(false)
  const [hovered, setHovered] = useState<SongMeta | null>(null) // library card under the pointer, tints the background
  const newDraft = useRef<Song | null>(null) // new-song wizard contents, kept if the user leaves with lyrics filled in
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
  // Loop: whole song, one line, or lines from..to (indices into song.lines).
  const [loop, setLoop] = useState<{ mode: 'off' | 'song' | 'line' | 'range'; from?: number; to?: number }>({ mode: 'off' })
  const [aligning, setAligning] = useState(false)
  const [coverHits, setCoverHits] = useState<CoverHit[] | null>(null) // online search results
  const [coverBusy, setCoverBusy] = useState(false)
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
  const tabRef = useRef(tab)
  tabRef.current = tab
  songRef.current = song
  const pending = useRef(new Map<string, Song>())
  const taps = useRef<{ at: number; wall: number }[]>([])
  // Rarely used tools open as non-modal popovers (closed only by their own buttons, so tap-sync keeps working):
  // metronome sound / tap tempo, and lyric timing + BPM sections. 'quick' shows the everyday controls on phones.
  const [pop, setPop] = useState<null | 'metro' | 'sync' | 'quick'>(null)
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
      // Fresh device: the unsaved blank song is showing, jump to the synced library (not while filling in a new song).
      if (list[0] && tabRef.current !== 'new' && !list.some((s) => s.id === songRef.current?.id)) await openSaved(list[0].id)
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
      // No songs: new-song wizard. One song: practise it. More: the library.
      setTab(list.length > 1 ? 'library' : recent ? 'practice' : 'new')
      await open(recent || newSong())
    })
  }, [])

  async function openSaved(id: string) {
    markOpened(id)
    setEditing(false)
    setTab('practice')
    await open((await loadSong(id))!)
  }

  // Leaving the wizard keeps the new song if it has lyrics; everything else just switches page.
  async function goTab(t: typeof tab) {
    if (tab === 'new' && t !== 'new' && newDraft.current?.lines.some((l) => l.text)) await saveNew(newDraft.current, false)
    newDraft.current = null
    setSyncAt(null) // Space stamps lyric times while syncing; never outside the practice view
    setEditing(false)
    setCoverPop(false)
    setTab(t)
  }

  async function saveNew(s: Song, practice = true) {
    newDraft.current = null
    await saveSong(s)
    setSongs(await listSongs())
    queuePush(s)
    markOpened(s.id)
    await open(s)
    if (practice) setTab('practice')
  }

  function startEdit() {
    if (player.playing) player.pause()
    setSyncAt(null)
    setDraft(toLrc(song!.lines))
    setEditTab('lyrics')
    setEditing(true)
  }

  async function removeSong(id: string) {
    pending.current.delete(id) // a queued push would re-upload the song after its tombstone
    await deleteSong(id)
    deleteRemote(id).catch(syncFailed)
    setSongs(await listSongs())
    if (id === song?.id) await open(newSong())
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

  // Playlist practice: go to song number i of the queue.
  async function goTo(i: number, play = player.playing) {
    const id = queue?.ids[i]
    if (!id || id === song?.id) return
    markOpened(id)
    await open((await loadSong(id))!)
    if (play) player.play()
  }

  function practiceList(name: string) {
    const ids = songs.filter((s) => s.lists?.includes(name)).map((s) => s.id)
    if (!ids.length) return
    setQueue({ name, ids })
    markOpened(ids[0])
    setEditing(false)
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
    player.onEnd = () => void (queue && goTo(queue.ids.indexOf(song!.id) + 1, true))
  })

  // Ctrl+S in the editor saves instead of opening the browser's save-page dialog.
  useEffect(() => {
    if (!editing) return
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
    if (tab !== 'practice' || editing || syncAt != null) return
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
  const allArtists = [...new Set(songs.map((s) => s.artist).filter(Boolean))].sort()
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

  async function setCover(src: Blob | string, hit?: CoverHit) {
    setCoverBusy(true)
    try {
      const differs = hit && (hit.title !== song!.title || hit.artist !== song!.artist)
      const rename = differs && confirm(`同时把歌名和歌手改成「${hit.title} · ${hit.artist}」吗？`)
      await update({ cover: await toCover(src), ...(rename ? { title: hit.title, artist: hit.artist } : {}) })
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
      await update({ trans: await translateLines(lines) })
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

  async function setBackground(file?: File) {
    if (!file) return
    try {
      await update({ bg: await toBackground(file) })
    } catch (e) {
      alert(`背景读取失败：${e}`)
    }
  }

  // Background: the hovered library card's cover / theme, else this song's background, cover or theme.
  const look = tab === 'library' && hovered ? hovered : tab === 'new' ? { id: '', theme: FALLBACK_THEME } : song
  const lookImage = tab === 'library' && hovered ? hovered.cover : tab === 'new' ? undefined : song.bg ?? song.cover
  const phase = beatPhase(song.beat ?? [], time)
  const pulse = tab === 'practice' && !editing && player.playing && phase != null ? Math.max(0, 1 - phase / 0.5) ** 2 : 0
  const pct = (v: number) => `${Math.round(v * 100)}%`

  const transport = (
    <div className="transport no-print">
      {hasAudio ? (
        <>
          <button className="play" onClick={() => (player.playing ? player.pause() : player.play())}>
            {player.playing ? '暂停' : '播放'}
          </button>
          <span className="time">{fmtTime(time)}</span>
          <input
            className="seek"
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
            🔊 {pct(player.volume)}
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
          {!canVocal ? (
            <span className="pop off" title="单声道的原曲没法去人声；上传分离好的伴奏或人声后可以调">
              🎤 —
            </span>
          ) : (
            <div className="pop" tabIndex={0} title={onlyOriginal ? '只有原曲时按频段去掉居中的人声，效果有限；上传分离好的人声和伴奏效果最好' : '伴奏音量不变，只调人声'}>
              🎤 {player.karaokeBusy ? '处理中…' : pct(player.source.vocal)}
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
          <button className={`chip ${loop.mode !== 'off' ? 'on' : ''}`} title="循环：关 → 单曲 → 单句 → 范围（点两句歌词选范围）" onClick={cycleLoop}>
            🔁 {{ off: '循环', song: '单曲', line: '单句', range: loop.to == null ? '点终点句' : '范围' }[loop.mode]}
          </button>
          <button className={`chip icon-toggle ${metro.on ? 'on' : ''}`} title={metro.on ? '关闭节拍器' : '打开节拍器'} aria-pressed={metro.on} onClick={() => setMetro({ on: !metro.on })}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 3h6l4 18H5L9 3z" />
              <path d="M12 16l5-9" />
              <path d="M7.5 16h9" />
            </svg>
          </button>
          {queue && (
            <div className="pop queue" tabIndex={0} title="按歌单练习">
              ☰ {qPos! + 1}/{queue.ids.length}
              <div className="pop-bar queue-list">
                <div className="queue-head">
                  <b>{queue.name}</b>
                  <button className="icon" title="上一首" disabled={!qPos} onClick={() => goTo(qPos! - 1)}>
                    ⏮
                  </button>
                  <button className="icon" title="下一首" disabled={qPos! + 1 >= queue.ids.length} onClick={() => goTo(qPos! + 1)}>
                    ⏭
                  </button>
                  <button className="icon" title="退出歌单练习" onClick={() => setQueue(null)}>
                    ×
                  </button>
                </div>
                <ol>
                  {queue.ids.map((id, i) => (
                    <li key={id} className={i === qPos ? 'on' : ''} onClick={() => goTo(i)}>
                      {songs.find((x) => x.id === id)?.title ?? '（已删除）'}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </>
      ) : (
        <span className="hint">还没上传音频，点「✎ 编辑」→ 音频 上传。</span>
      )}
      <button className={`chip quick-toggle ${pop === 'quick' ? 'on' : ''}`} title="速度、Key、显示、节拍器" onClick={() => setPop(pop === 'quick' ? null : 'quick')}>
        ⚙
      </button>
    </div>
  )

  // Everyday controls, always in view next to the transport (in a sheet on phones).
  const quick = (
    <div className={`quick no-print ${pop === 'quick' ? 'open' : ''}`}>
      {hasAudio && (
        <>
          <div className="slider">
            <span>速度</span>
            <output>{baseBpm ? `♩=${Math.round(baseBpm * tempo)}` : pct(tempo)}</output>
            {baseBpm ? (
              <input type="range" title={`原速 ${baseBpm} BPM`} min={Math.round(baseBpm * 0.5)} max={Math.round(baseBpm * 1.5)} step={1} value={Math.round(baseBpm * tempo)} onChange={(e) => setTempo(+e.target.value / baseBpm)} />
            ) : (
              <input type="range" min={0.5} max={1.5} step={0.05} value={tempo} onChange={(e) => setTempo(+e.target.value)} />
            )}
          </div>
          <div className="slider">
            <span>Key</span>
            <output>{semi > 0 ? `+${semi}` : semi}</output>
            <input type="range" min={-6} max={6} step={1} value={semi} onChange={(e) => setSemi(+e.target.value)} />
          </div>
          {(tempo !== 1 || semi !== 0) && (
            <button className="link" onClick={() => (setTempo(1), setSemi(0))}>
              复原速度和 Key
            </button>
          )}
        </>
      )}
      <div className="chips">
        {(['kana', 'romaji', 'trans'] as const).map((k) => (
          <button key={k} className={`chip ${show[k] ? 'on' : ''}`} onClick={() => setShow({ ...show, [k]: !show[k] })}>
            {{ kana: '假名', romaji: '罗马音', trans: '翻译' }[k]}
          </button>
        ))}
      </div>
      {hasAudio && (
        <div className="chips">
          <button className={`chip ${pop === 'metro' ? 'on' : ''}`} title="节拍器声音、音量、点按测速" onClick={() => setPop(pop === 'metro' ? null : 'metro')}>
            节拍器设置{baseBpm ? ` ♩=${baseBpm}` : ''}
          </button>
          <button className={`chip ${pop === 'sync' ? 'on' : ''}`} title="打点、校准、BPM 分段、打印" onClick={() => setPop(pop === 'sync' ? null : 'sync')}>
            打点与 BPM
          </button>
        </div>
      )}
      {!hasAudio && (
        <button className="chip" onClick={() => window.print()}>
          打印 / PDF
        </button>
      )}
    </div>
  )

  const popHead = (title: string) => (
    <div className="panel-head">
      <b>{title}</b>
      <button className="icon" title="收起" onClick={() => setPop(null)}>
        ✕
      </button>
    </div>
  )

  const metroPanel = (
    <aside className="panel box no-print">
      {popHead('节拍器')}
      <div className="chips">
        {Object.entries(CLICK_LABEL).map(([k, v]) => (
          <button key={k} className={`chip ${metro.sound === k ? 'on' : ''}`} onClick={() => setMetro({ sound: k as ClickSound })}>
            {v}
          </button>
        ))}
      </div>
      <div className="slider">
        <span>音量</span>
        <output>{pct(metro.volume)}</output>
        <input type="range" min={0} max={1.5} step={0.05} value={metro.volume} onChange={(e) => setMetro({ volume: +e.target.value })} />
      </div>
      <div className="chips">
        <button className={`chip ${taps.current.length ? 'on' : ''}`} disabled={!player.playing} title="播放时跟着拍子点，或按 T 键" onClick={tap}>
          点按测速 T{taps.current.length ? ` · ${taps.current.length}` : ''}
        </button>
      </div>
      <p className="hint">播放时跟着拍子点「点按测速」或按 T，点 4 下以上就设好 BPM，第一下当作小节第一拍。</p>
    </aside>
  )

  const syncPanel = (
    <aside className="panel box wide no-print">
      {popHead('打点与 BPM')}
      <div className="panel-sec">
        <div className="sec-title">歌词时间</div>
        <div className="chips">
          {syncAt == null ? (
            <button className="chip" onClick={() => (setSyncAt(0), player.seek(0), player.play())}>
              {timed ? '重新打点' : '开始打点'}
            </button>
          ) : (
            <button className="chip on" onClick={() => setSyncAt(null)}>
              结束打点
            </button>
          )}
          {timed && syncAt == null && (
            <button className="chip" disabled={aligning} title="在每句打的点附近找人声开始的位置，对齐到节拍（16 分音符）" onClick={autoAlign}>
              {aligning ? '校准中…' : '自动校准打点'}
            </button>
          )}
          {beforeAlign.current && (
            <button className="chip" onClick={() => (update({ lines: song.lines.map((l, i) => ({ ...l, time: beforeAlign.current![i]?.time ?? l.time })) }), (beforeAlign.current = null))}>
              撤销校准
            </button>
          )}
          <button className="chip" onClick={() => window.print()}>
            打印 / PDF
          </button>
        </div>
        {syncAt != null && <p className="hint">每句开始唱时按空格，按退格回到上一句</p>}
      </div>
      <div className="panel-sec">
        <div className="sec-title">BPM 分段</div>
        <div className="chips">
          <button className="chip" onClick={addSection}>
            ＋ 从当前位置变拍
          </button>
          <label className="button chip">
            导入节拍
            <input hidden type="file" accept=".json,application/json" onChange={(e) => importBeat(e.target.files?.[0])} />
          </label>
          <button className="chip" disabled={!song.beat?.length} onClick={() => download(`${song.title}-节拍.json`, JSON.stringify(song.beat))}>
            导出节拍
          </button>
        </div>
                {!!song.beat?.length && (
                  <div className="sections">
                    {song.beat.map((s, i) => (
                      <div className="section" key={i}>
                        <div className="chips">
                          {i > 0 && song.beat![i - 1].bpm > 0 && (
                            <button className="chip" title="提前一拍" onClick={() => setSection(i, { time: +(s.time - 60 / song.beat![i - 1].bpm).toFixed(3) })}>
                              ‹
                            </button>
                          )}
                          <button
                            className="chip time"
                            title={i ? '设为当前播放位置（自动对齐到前一段的拍子）' : '设为当前播放位置'}
                            onClick={() => setSection(i, { time: i ? snapToBeat(song.beat!, player.heardTime, i) : +player.heardTime.toFixed(3) })}
                          >
                            {fmtTime(s.time)}
                          </button>
                          {i > 0 && song.beat![i - 1].bpm > 0 && (
                            <button className="chip" title="推后一拍" onClick={() => setSection(i, { time: +(s.time + 60 / song.beat![i - 1].bpm).toFixed(3) })}>
                              ›
                            </button>
                          )}
                          {i > 0 && (
                            <button className="chip" title="删除这一段" onClick={() => setSection(i, null)}>
                              删除
                            </button>
                          )}
                        </div>
                        <div className="chips">
                          <span className="hint">BPM</span>
                          {[-1, -0.1].map((d) => (
                            <button key={d} className="chip" onClick={() => setSection(i, { bpm: Math.max(0, +(s.bpm + d).toFixed(1)) })}>
                              {d}
                            </button>
                          ))}
                          <input type="number" className="num" min={0} max={400} step={0.1} value={s.bpm} title="0 = 这一段不响" onChange={(e) => setSection(i, { bpm: e.target.value === '' ? s.bpm : Math.max(0, +e.target.value) })} />
                          {[0.1, 1].map((d) => (
                            <button key={d} className="chip" onClick={() => setSection(i, { bpm: +(s.bpm + d).toFixed(1) })}>
                              +{d}
                            </button>
                          ))}
                          <button className="chip" onClick={() => setSection(i, { bpm: s.bpm / 2 })}>
                            ÷2
                          </button>
                          <button className="chip" onClick={() => setSection(i, { bpm: s.bpm * 2 })}>
                            ×2
                          </button>
                        </div>
                        <div className="chips">
                          <span className="hint">每小节</span>
                          {[2, 3, 4, 6].map((n) => (
                            <button key={n} className={`chip ${s.beats === n ? 'on' : ''}`} onClick={() => setSection(i, { beats: n })}>
                              {n} 拍
                            </button>
                          ))}
                          {![2, 3, 4, 6].includes(s.beats) && <span className="chip on">{s.beats} 拍</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
        <p className="hint">变拍子的地方点「从当前位置变拍」，会自动对齐到前一段最近的拍子；差一拍就用 ‹ › 挪。时间按钮 = 设为当前播放位置。</p>
      </div>
    </aside>
  )

  const coverPopover = (
    <div className="cover-pop box" onClick={(e) => e.stopPropagation()}>
      <h4>封面 · 点一条结果</h4>
      <div className="chips">
        <button className="chip" disabled={coverBusy || !song.title.trim()} title="用歌名和歌手在 Apple Music 搜索" onClick={findCovers}>
          {coverBusy ? '处理中…' : coverHits ? '重新搜索' : '联网搜索'}
        </button>
        <label className="button chip">
          上传封面
          <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && setCover(e.target.files[0])} />
        </label>
        {song.cover && (
          <button className="chip" onClick={() => update({ cover: undefined })}>
            移除封面
          </button>
        )}
      </div>
      {coverHits && (
        <div className="cover-hits">
          {!coverHits.length && <p className="hint">没搜到，改一下歌名或歌手再搜，或者自己上传。</p>}
          {coverHits.map((h) => (
            <button key={h.url} title={`${h.title} · ${h.artist}\n${h.album}`} disabled={coverBusy} onClick={() => setCover(h.url, h)}>
              <img src={h.url.replace('600x600bb', '200x200bb')} alt="" />
              <b>{h.title}</b>
              <span>{h.artist}</span>
            </button>
          ))}
        </div>
      )}
      {!song.cover && (
        <>
          <h4>默认主题</h4>
          <div className="theme-picks">
            {THEMES.map((t) => (
              <button key={t.name} className={themeFor(song).name === t.name ? 'on' : ''} title={`${t.name} · ${t.group}`} onClick={() => update({ theme: t.name })}>
                <Art song={{ id: song.id, title: song.title, theme: t.name }} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h4>背景</h4>
      <div className="bg-row">
        <span className="bg-thumb" style={song.bg ?? song.cover ? { backgroundImage: `url(${song.bg ?? song.cover})` } : { background: themeFor(song).bg[1] }} />
        <div>
          <div>{song.bg ? '已上传' : song.cover ? '用封面自动生成' : '默认主题'}</div>
          <div className="chips">
            <label className="button chip">
              上传背景图
              <input hidden type="file" accept="image/*" onChange={(e) => setBackground(e.target.files?.[0])} />
            </label>
            {song.bg && (
              <button className="chip" onClick={() => update({ bg: undefined })}>
                移除
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const editPanes = (
    <section className="work no-print">
      <div className="work-head">
        <div className="seg">
          {(['lyrics', 'trans', 'audio'] as const).map((k) => (
            <button key={k} className={editTab === k ? 'on' : ''} onClick={() => setEditTab(k)}>
              {{ lyrics: '歌词', trans: '翻译', audio: '音频' }[k]}
            </button>
          ))}
        </div>
        <span className="grow" />
        <span className="hint">{savedAt ? `已自动保存 ${new Date(savedAt).toLocaleTimeString()}` : '修改会自动保存'}</span>
        <button onClick={saveNow}>保存</button>
        <button className="primary" onClick={() => setEditing(false)}>
          完成
        </button>
      </div>
      {editTab === 'lyrics' && (
        <div className="pane box">
          <div className="chips">
            <label className="button chip">
              导入 .txt / .lrc
              <input hidden type="file" accept=".txt,.lrc,text/plain" onChange={(e) => importLyrics(e.target.files?.[0])} />
            </label>
            <button className="chip" disabled={!song.lines.length} onClick={() => download(`${song.title}.lrc`, toLrc(song.lines, song.title, song.artist))}>
              导出 .lrc
            </button>
            <span className="hint">
              一行一句，纯文本或 LRC；读音不对写成 <code>漢字{'{'}よみ{'}'}</code>
            </span>
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
        </div>
      )}
      {editTab === 'trans' && (
        <div className="pane box">
          <div className="chips">
            <button className="chip primary" disabled={!song.lines.length || translating} onClick={autoTranslate}>
              {translating ? '翻译中…' : '自动翻译'}
            </button>
            <label className="button chip">
              导入翻译 .txt / .lrc
              <input
                hidden
                type="file"
                accept=".txt,.lrc,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) update({ trans: alignTranslation(song.lines, await f.text()) })
                }}
              />
            </label>
            {!!song.trans?.some(Boolean) && (
              <button className="chip danger" onClick={() => confirm('移除全部翻译？') && update({ trans: undefined })}>
                移除翻译
              </button>
            )}
            <span className="hint">一行对应一句歌词（空行不算），可以直接改</span>
          </div>
          <textarea value={(song.trans ?? []).join('\n')} spellCheck={false} onChange={(e) => update({ trans: e.target.value.split('\n') })} />
        </div>
      )}
      {editTab === 'audio' && (
        <div className="pane box">
          <p className="hint">用 MISST / UVR 分离出人声和伴奏后分别上传，练习页可以调人声音量。只有原曲也可以。</p>
          {/* Link import needs local yt-dlp behind the dev server, so the deployed build hides it. */}
          {import.meta.env.DEV && (
            <div className="chips">
              <input className="grow" placeholder="粘贴 B站 / YouTube 链接，导入为原曲" value={link} onChange={(e) => setLink(e.target.value)} />
              <button disabled={!link.trim() || fetching} onClick={importLink}>
                {fetching ? '下载中…' : '从链接导入'}
              </button>
            </div>
          )}
          {TRACKS.map((k) => (
            <div className="track-row" key={k}>
              <b>{TRACK_LABEL[k]}</b>
              <span className="hint grow">{song.audio[k] ? ((song.audio[k] as File).name ?? '已上传') : '未上传'}</span>
              <label className="button chip">
                {song.audio[k] ? '替换' : '上传'}
                <input hidden type="file" accept="audio/*" onChange={(e) => setAudio(k, e.target.files?.[0])} />
              </label>
              {song.audio[k] && (
                <>
                  <button className="chip" onClick={() => download((song.audio[k] as File).name ?? `${song.title}-${TRACK_LABEL[k]}`, song.audio[k]!)}>
                    保存到本地
                  </button>
                  <button className="chip" onClick={() => setAudio(k)}>
                    移除
                  </button>
                </>
              )}
            </div>
          ))}
          <label
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f?.type.startsWith('audio/')) setAudio(TRACKS.find((k) => !song.audio[k]) ?? 'original', f)
            }}
          >
            把音频文件拖到这里
            <input hidden type="file" accept="audio/*" onChange={(e) => setAudio(TRACKS.find((k) => !song.audio[k]) ?? 'original', e.target.files?.[0])} />
          </label>
        </div>
      )}
    </section>
  )

  return (
    <div className={`app ${tab}`}>
      <Backdrop image={lookImage} theme={themeFor(look)} mode={tab === 'practice' ? 'practice' : 'page'} playing={player.playing} pulse={pulse} />
      <header className="no-print">
        <button className="logo" onClick={() => goTab('library')}>
          うたまな<small>Utamana</small>
        </button>
        <nav>
          <button className={tab === 'library' ? 'on' : ''} onClick={() => goTab('library')}>
            曲库
          </button>
          <button className={tab === 'practice' ? 'on' : ''} onClick={() => goTab('practice')}>
            练习
          </button>
        </nav>
        {user && (
          <span className={`sync ${syncState}`} title={syncState === 'error' ? syncError : undefined}>
            {{ idle: '已同步', syncing: '同步中…', error: `同步失败：${syncError}` }[syncState]}
          </span>
        )}
        <button className={`chip ${tab === 'settings' ? 'on' : ''}`} title="设置" onClick={() => goTab(tab === 'settings' ? 'practice' : 'settings')}>
          设置
        </button>
      </header>

      {dictError && <p className="error no-print">词典加载失败：{dictError}</p>}

      {tab === 'settings' && (
        <main className="settings-page no-print">
          <section className="box">
            <h2>账号同步</h2>
            <div className="chips">
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
          <section className="box">
            <h2>字体</h2>
            <div className="chips">
              <FontPicker label="界面字体" value={fonts.ui} onChange={(ui) => setFonts({ ...fonts, ui })} />
              <FontPicker label="歌词字体" value={fonts.lyric} onChange={(lyric) => setFonts({ ...fonts, lyric })} />
            </div>
            <div className="sec-title">界面大小</div>
            {/* Chips, not a slider: zoom rescales the page, so a slider would move away from the cursor mid-drag. */}
            <div className="chips">
              {[0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map((v) => (
                <button key={v} className={`chip ${fonts.uiScale === v ? 'on' : ''}`} onClick={() => setFonts({ ...fonts, uiScale: v })}>
                  {pct(v)}
                </button>
              ))}
            </div>
            <div className="slider">
              <span>歌词字号</span>
              <output>{fonts.lyricSize}px</output>
              <input type="range" min={14} max={40} value={fonts.lyricSize} onChange={(e) => setFonts({ ...fonts, lyricSize: +e.target.value })} />
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
        <Library
          songs={songs}
          currentId={song.id}
          onOpen={(id) => (setQueue(null), void openSaved(id))}
          onEdit={async (id) => {
            setQueue(null)
            await openSaved(id)
            setEditTab('lyrics')
            setEditing(true)
          }}
          onNew={() => goTab('new')}
          onPatch={patchSong}
          onDelete={removeSong}
          onPracticeList={practiceList}
          onHover={setHovered}
        />
      )}

      {tab === 'new' && <NewSong artists={allArtists} draft={newDraft} onDone={(s) => saveNew(s)} onCancel={() => goTab('library')} />}

      {tab === 'practice' && (
        <main className={`stage ${editing ? 'editing' : ''}`} onClick={() => coverPop && setCoverPop(false)}>
          <div className="stage-art no-print">
            {editing ? (
              <>
                <div className="art-btn" role="button" tabIndex={0} onClick={(e) => (e.stopPropagation(), setCoverPop(!coverPop))} onKeyDown={(e) => e.key === 'Enter' && setCoverPop(!coverPop)}>
                  <Art song={song} />
                  <span className="art-label">更换封面 / 背景</span>
                </div>
                {coverPop && coverPopover}
              </>
            ) : (
              <Art song={song} />
            )}
          </div>

          {editing ? (
            <div className="stage-meta edit-fields no-print">
              <input className="title-input" lang="ja" value={song.title} placeholder="歌名" onChange={(e) => update({ title: e.target.value })} />
              <input className="artist-input" list="artists" value={song.artist} placeholder="歌手" onChange={(e) => update({ artist: e.target.value })} />
              <datalist id="artists">
                {allArtists.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              <div className="field-label">学习状态</div>
              <div className="seg">
                {([...(Object.keys(STATUS) as Status[]), undefined] as (Status | undefined)[]).map((k) => (
                  <button key={k ?? 'none'} className={song.status === k ? 'on' : ''} onClick={() => update({ status: k })}>
                    {k ? STATUS[k] : '不设置'}
                  </button>
                ))}
              </div>
              <div className="field-label">收藏</div>
              <div className="chips">
                <button className={`chip ${song.fav ? 'on' : ''}`} onClick={() => update({ fav: !song.fav })}>
                  {song.fav ? '★ 已收藏' : '☆ 收藏'}
                </button>
              </div>
              <div className="field-label">标签</div>
              <ChipsPicker values={song.tags} options={allTags} onChange={(tags) => update({ tags })} />
              <div className="field-label">歌单</div>
              <ChipsPicker values={song.lists} options={allLists} onChange={(lists) => update({ lists })} newLabel="＋ 新歌单" />
            </div>
          ) : (
            <div className="stage-meta no-print">
              <b className="stage-title" lang="ja">
                {song.title}
              </b>
              <span className="stage-artist">{song.artist || '未填歌手'}</span>
              <button className="chip edit-btn" onClick={startEdit}>
                ✎ 编辑
              </button>
            </div>
          )}

          {editing ? (
            editPanes
          ) : (
            <>
              {transport}
              {quick}
              <article
                className={`sheet ${timed ? 'timed' : ''}`}
                onWheel={() => (manualScroll.current = performance.now())}
                onTouchMove={() => (manualScroll.current = performance.now())}
                onMouseDown={(e) => e.target === e.currentTarget && (manualScroll.current = performance.now())} // scrollbar drag
              >
                <h1 className="sheet-title print-only" lang="ja">
                  {song.title}
                  {song.artist && <small> {song.artist}</small>}
                </h1>
                {!song.lines.length && <p className="hint no-print">还没有歌词，点「✎ 编辑」粘贴。</p>}
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
            </>
          )}
        </main>
      )}

      {tab === 'practice' && !editing && pop === 'metro' && metroPanel}
      {tab === 'practice' && !editing && pop === 'sync' && syncPanel}
    </div>
  )
}
