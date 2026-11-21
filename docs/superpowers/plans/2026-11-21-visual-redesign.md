# Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Utamana into a dark, Apple Music–style app with a per-song flowing background, vinyl-row library, in-place edit mode and a 3-step new-song wizard, without changing any playback/sync behaviour.

**Architecture:** Pure helpers (themes, beat phase, library rows, local "opened" times) go in small tested modules. Visual pieces that are reused (`Backdrop`, `Art`, `Library`, `NewSong`, `ChipsPicker`) become components in `src/`; the practice page, edit mode and practice panel stay in `App.tsx` because they share most of its state. `index.css` is rewritten around one set of dark tokens.

**Tech Stack:** React 19, Vite, TypeScript, plain CSS, `idb-keyval`, `node --test` for unit tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-visual-redesign-design.md` (prototypes in `.superpowers/brainstorm/527-1795237786/content/`: `apple-music-v2.html`, `full-app.html`, `library-rows.html`, `edit-mode.html`, `default-themes-v2.html`).

## Global Constraints

- No new npm dependencies; no UI or animation library.
- No behaviour change to playback, tempo/key, metronome, tap-sync, auto-align, loop, queue, cloud sync, translation, furigana.
- Sans-serif only for UI chrome; lyrics keep `--lyric-font` / `--lyric-size` from settings.
- Lyrics must NOT pulse per beat; the sung line animates once (~0.6 s) when it becomes active.
- Background animates only with transform/filter/opacity, ≤ 3 blurred layers; static under `prefers-reduced-motion: reduce`.
- `@media print` output stays white background, black text, all lyrics visible (current print rules keep working).
- Pick over type: every place with candidates offers clickable choices; typing is the fallback.
- Nav has exactly two items: 曲库 / 练习. Settings stays a header button.
- No git commits unless the user asks; each task ends with tests + typecheck green instead.
- Verify commands: `node --test src/*.test.ts` (all pass) and `npx tsc -b` (no errors).

## Review Focus

1. Song with no cover and no `theme` → stable hash theme, same on every reload and in library, practice and vinyl label. Test in Task 1 (`themeFor`).
2. `song.beat` empty, or current section `bpm: 0`, or time before first section → no pulse. Test in Task 1 (`beatPhase`).
3. Deleting the currently open song from the library → current song becomes a fresh blank song and the app stays in the library. Manual check in Task 5.
4. Library with zero songs / songs in no status, never opened → only the 全部 row (or the empty-state CTA), no empty rows. Test in Task 1 (`buildRows`).
5. Leaving the wizard: with lyrics → saved and listed; without lyrics → nothing saved. Manual check in Task 6.

---

### Task 1: Data fields and pure helpers

**Files:**
- Create: `src/theme.ts`, `src/theme.test.ts`, `src/library.ts`, `src/library.test.ts`
- Modify: `src/beat.ts` (add `beatPhase`), `src/beat.test.ts`, `src/db.ts` (Song, SongMeta, summary), `src/cloud.ts` (Data, push, pull), `src/cover.ts` (add `toBackground`)

**Interfaces:**
- Produces:
  - `db.ts`: `Song` gains `bg?: string` (background JPEG data URL) and `theme?: string` (theme name). `SongMeta` gains `theme?: string` (NOT `bg`). `summary()` copies `theme`.
  - `cloud.ts`: `bg` and `theme` added to `Data`, to the push destructure and to the pull object.
  - `cover.ts`: `toBackground(src: Blob): Promise<string>` — scale so the long side ≤ 1920 px (never upscale), `canvas.toDataURL('image/jpeg', 0.8)`.
  - `beat.ts`: `beatPhase(sections: Section[], t: number): number | null` — section in effect = last with `time <= t` (sections sorted by time); `null` if none or its `bpm <= 0`; else `((t - s.time) * s.bpm / 60) % 1`.
  - `theme.ts`:
    - `type Theme = { name: string; group: '马卡龙' | '莫兰迪'; art: [field: string, circle: string, ink: string]; bg: [base: string, b1: string, b2: string, b3: string] }`
    - `THEMES: Theme[]` — the 10 entries, names and hex values copied from `themes` in `default-themes-v2.html` (樱花 薄荷 柠檬 薰衣草 天空 / 雾粉 灰绿 雾蓝 燕麦 藕紫).
    - `FALLBACK_THEME = '雾蓝'`
    - `themeFor(s: { id: string; theme?: string }): Theme` — named theme if it exists, else `THEMES[hash(id) % THEMES.length]` with a simple string hash (e.g. FNV-1a).
  - `library.ts`:
    - `type RowKey = 'learning' | 'recent' | 'fav' | 'want' | 'learned' | 'all'`
    - `ROW_LABEL: Record<RowKey, string>` = 在学 / 最近播放 / 收藏 / 想学 / 已学会 / 全部
    - `DEFAULT_ROWS: RowKey[] = ['learning', 'recent', 'fav', 'want', 'learned', 'all']`
    - `buildRows(songs: SongMeta[], opened: Record<string, number>, order: RowKey[]): { key: RowKey; songs: SongMeta[] }[]`
    - `loadOpened(): Record<string, number>`, `markOpened(id: string): void` (localStorage key `utamana:opened`), `loadRowOrder(): RowKey[]`, `saveRowOrder(order: RowKey[]): void` (key `utamana:rows`). All localStorage access in try/catch; failures fall back to `{}` / `DEFAULT_ROWS`.

- [ ] **Step 1: Write failing tests**

`src/beat.test.ts` — add:
```ts
test('beatPhase is the fraction of the current beat, null without a running section', () => {
  const s = [{ time: 1, bpm: 120, beats: 4 }, { time: 5, bpm: 0, beats: 4 }]
  assert.equal(beatPhase([], 2), null)
  assert.equal(beatPhase(s, 0.5), null)           // before the first section
  assert.equal(beatPhase(s, 1), 0)
  assert.ok(Math.abs(beatPhase(s, 1.25)! - 0.5) < 1e-9) // 120 BPM: a beat is 0.5 s
  assert.equal(beatPhase(s, 6), null)             // BPM 0 section is silent
})
```
`src/theme.test.ts`:
```ts
test('themeFor uses the chosen theme, else a stable hash of the id', () => {
  assert.equal(THEMES.length, 10)
  assert.equal(themeFor({ id: 'x', theme: '薄荷' }).name, '薄荷')
  assert.equal(themeFor({ id: 'abc' }).name, themeFor({ id: 'abc' }).name)
  assert.equal(themeFor({ id: 'abc', theme: 'nope' }).name, themeFor({ id: 'abc' }).name)
  const names = new Set(Array.from({ length: 40 }, (_, i) => themeFor({ id: `song-${i}` }).name))
  assert.ok(names.size >= 5)
})
```
`src/library.test.ts` (songs built as minimal `SongMeta` objects):
```ts
test('buildRows groups, orders by last opened and drops empty rows', () => {
  const m = (id, extra = {}) => ({ id, title: id, artist: '', updated: 0, ...extra })
  const songs = [m('a', { status: 'learning' }), m('b', { status: 'learning', fav: true }), m('c')]
  const rows = buildRows(songs, { a: 10, b: 20 }, DEFAULT_ROWS)
  assert.deepEqual(rows.map((r) => r.key), ['learning', 'recent', 'fav', 'all'])
  assert.deepEqual(rows[0].songs.map((s) => s.id), ['b', 'a'])   // most recently opened first
  assert.deepEqual(rows[1].songs.map((s) => s.id), ['b', 'a'])   // recent = opened only
  assert.deepEqual(rows[3].songs.map((s) => s.id).sort(), ['a', 'b', 'c'])
})
test('buildRows follows the saved order and appends rows missing from it', () => {
  const rows = buildRows([{ id: 'a', title: 'a', artist: '', updated: 0, fav: true }], {}, ['fav', 'bogus'])
  assert.deepEqual(rows.map((r) => r.key), ['fav', 'all'])
})
test('buildRows caps the recent row at 12', () => {
  const songs = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, title: '', artist: '', updated: 0 }))
  const opened = Object.fromEntries(songs.map((s, i) => [s.id, i]))
  assert.equal(buildRows(songs, opened, ['recent'])[0].songs.length, 12)
})
```

- [ ] **Step 2: Run tests, expect FAIL** — `node --test src/*.test.ts` → missing exports.

- [ ] **Step 3: Implement** the interfaces above. Row sort inside every row: `opened[id]` desc, ties by `updated` desc.

- [ ] **Step 4: Run** `node --test src/*.test.ts` → all pass; `npx tsc -b` → no errors.

---

### Task 2: Dark tokens, Backdrop, Art, two-item nav, settings restyle

**Files:**
- Create: `src/Backdrop.tsx`, `src/Art.tsx`
- Modify: `src/index.css` (rewrite tokens + global components), `src/App.tsx` (header/nav, tab type, settings markup classes, mount Backdrop)

**Interfaces:**
- Consumes: `themeFor`, `Theme`, `FALLBACK_THEME`, `THEMES` (Task 1).
- Produces:
  - `<Backdrop image?: string; theme: Theme; mode: 'practice' | 'page'; playing: boolean; pulse: number />` — fixed full-screen, `z-index:-1`, class `no-print`. With `image`: 3 layers of the image `blur(70px) saturate(1.7)` rotating 26/34/44 s; without: 3 colour blobs from `theme.bg[1..3]` on `theme.bg[0]`. Overlay: `rgba(0,0,0,.45)` for image + practice, `.5` for image + page, `.22` for theme. `animation-play-state` running only when `mode === 'practice' && playing` or `mode === 'page'`. `pulse` (0–1) → `filter: brightness(1 + 0.12 * pulse)` on the layer wrapper; image changes cross-fade (~0.6 s).
  - `<Art song: { id: string; title: string; cover?: string; theme?: string }; className?: string />` — `<img>` when `cover`, else generated art per spec §1 (flat `art[0]` field, `art[1]` circle top-right, thin `art[2]` arc bottom-left, `title[0]` in `art[2]` bottom-left, small "UTAMANA" top-left). Square, scales with its container (font sizes in `em`/`cqw`).
  - Tab state becomes `'library' | 'practice' | 'settings' | 'new'`; `editing: boolean` is separate (Task 4).
  - Header: logo, nav with 曲库 / 练习 only, sync status, 设置 button. Header transparent.
- CSS tokens (on `:root`, screen only): `--fg: #fff; --muted: rgba(255,255,255,.62); --line: rgba(255,255,255,.16); --glass: rgba(255,255,255,.1); --accent: #f07c96; --rt: #f6a5b6; --trans: #c9cffc`. Remove the light/dark `prefers-color-scheme` split. `.box` = glass card (`backdrop-filter: blur(24px)`, 1px `--line` border, radius 16px). Buttons: `.primary` white pill with dark text; default = glass pill. Existing `@media print` block must keep forcing white/black.

- [ ] **Step 1:** Write `Backdrop.tsx` and `Art.tsx`; mount `<Backdrop>` once at the top of `.app` with `image = song.bg ?? song.cover`, `theme = themeFor(song)`, `mode = tab === 'practice' ? 'practice' : 'page'`, `playing = player.playing`, `pulse` from Task 3 (pass `0` for now). On the `'new'` tab use `themeFor({ id: '', theme: FALLBACK_THEME })` and no image.
- [ ] **Step 2:** Rewrite `index.css` tokens and shared controls; restyle settings sections as `.box`. Replace the 3-button nav with 2; remove `'edit'` from the tab union and fix every reference (initial tab: 0 songs → `'new'`, 1 → `'practice'`, more → `'library'`; Ctrl+S handler now active when `editing`).
- [ ] **Step 3:** `npx tsc -b` → no errors; `node --test src/*.test.ts` → pass.
- [ ] **Step 4:** Browser check (preview): library and settings render dark over the flowing background; Ctrl+P print preview is still white with black lyrics.

---

### Task 3: Practice page layout and motion

**Files:**
- Modify: `src/App.tsx` (practice markup, panel), `src/index.css`

**Interfaces:**
- Consumes: `beatPhase` (Task 1), `Backdrop`, `Art` (Task 2).
- Produces: `pulse` value for Backdrop: `p = beatPhase(song.beat ?? [], time)`; `pulse = player.playing && p != null ? Math.max(0, 1 - p / 0.5) ** 2 : 0` (fades over the first half of each beat; `time` already updates every 40 ms).

- [ ] **Step 1: Layout.** Wide (≥ 900px): grid `side | lyrics`, side ≈ 34% with `<Art>` (radius 12px, shadow), title, artist, `✎ 编辑` button, then the transport (progress, play, time, volume pop, loop chip, vocal pop, queue ☰, `⚙ 练习设置`). Horizontal page padding 6%. Phone (< 900px): top row = 56px `<Art>` + title/artist + ✎; lyrics fill; transport fixed at bottom; side padding 24px. Remove the `.sheet-title` from screen view but keep it in print (`print-only`).
- [ ] **Step 2: Lyric styles.** `.jp` uses `calc(var(--lyric-size) * 1.33)` wide / `* 1.05` phone, weight 700; inactive lines `rgba(255,255,255,.35)` + `filter: blur(1.2px)`; active line `#fff`, no blur, keyframe `enter` once: `0% scale 1 → 30% scale 1.04 + text-shadow 0 0 24px rgba(255,255,255,.6) → 100% scale 1`, 0.6 s, `transform-origin: left`. `next` and `in-loop` get a subtle left marker (2px bar, `--muted` / `--trans`). Hover on a line: `opacity .8`, no blur. Remove the old `.sheet li.active` card background.
- [ ] **Step 3: Practice panel → non-modal popover.** Opened/closed only by `⚙ 练习设置` and its ✕ (no outside-click close). Wide: fixed above the left column (anchored to the side column, max-height ~70vh, scrolls); phone: bottom sheet above the transport. Lyrics stay interactive underneath. Remove `.with-panel` padding logic; `panelOpen` default `false`.
- [ ] **Step 4: Pick-over-type in the panel.** Speed: preset chips `50% 75% 90% 100%` beside the slider (set `tempo`). Key: chips `−2 0 +2`. Section rows: beats-per-bar as chips `2 3 4 6` (keep a number input behind a `…` toggle), BPM `−1 −0.1 +0.1 +1` buttons around the existing number input. Click sound select → chips.
- [ ] **Step 5:** Wire `pulse` into `<Backdrop>`.
- [ ] **Step 6:** `npx tsc -b`, `node --test src/*.test.ts` pass. Browser: play a timed song with a beat → background brightens once per beat, the sung line glows once per line change, lyrics never pulse; pause → background stops; tap-sync with Space still works while the panel is open.

---

### Task 4: Edit mode

**Files:**
- Create: `src/ChipsPicker.tsx`
- Modify: `src/App.tsx` (edit-mode markup replacing the old edit tab; cover popover), `src/index.css`

**Interfaces:**
- Consumes: `toBackground`, `THEMES`, `themeFor` (Task 1), `Art` (Task 2), practice layout (Task 3).
- Produces:
  - `editing` state; entering: `player.pause()` if playing, `setDraft(toLrc(song.lines))`. Leaving via `完成`.
  - `<ChipsPicker values?: string[]; options: string[]; onChange: (v: string[]) => void; newLabel: string />` — every option is a toggle chip (on = in values); a trailing `＋ 新建` chip turns into a small input (Enter / comma / blur adds, IME-safe like current `ChipsInput`). Replaces `ChipsInput` for tags and playlists.

- [ ] **Step 1: Left column in edit mode.** `<Art>` with "更换封面 / 背景" badge → opens cover popover. Title and artist become underline inputs; artist input gets a `<datalist>` of existing artists. Below: status as segmented buttons (想学 / 正在学 / 已学会 / 不设置), favourite toggle chip, `ChipsPicker` for 标签 and 歌单. No transport in edit mode.
- [ ] **Step 2: Cover popover** (closes on outside click / Esc): runs `findCovers()` on open when there are no hits yet; hit grid (image, title, artist). Clicking a hit sets the cover; if its title/artist differ from the song's, a `confirm('同时把歌名和歌手改成「…」吗？')` updates them too. Buttons: 上传封面, 移除封面. When there is no cover: the 10 theme swatches (generated `<Art>` with each theme) — click sets `song.theme`. Background section: 16:10 thumbnail, source label (用封面自动生成 / 默认主题 / 已上传), 上传背景图 (`update({ bg: await toBackground(file) })`), 移除 when `bg` is set.
- [ ] **Step 3: Right column tabs** `歌词 | 翻译 | 音频`, header right: save status (`已自动保存 hh:mm`), 保存 (`saveNow`), primary `完成`.
  - 歌词: import .txt/.lrc, export .lrc, reading hint, the existing textarea (no time column needed in the textarea; the spec's read-only time column may be shown as a gutter only if trivial — otherwise skip, builder's call).
  - 翻译: primary 自动翻译, 导入翻译, `移除翻译` (`confirm('移除全部翻译？')` → `update({ trans: undefined })`), textarea.
  - 音频: one row per track (label, file name or 未上传, 上传/替换, 保存到本地, 移除), dev-only link import, drop zone accepting an audio file (goes to the first empty track, else original).
  - Delete section removed from here (moves to library, Task 5).
- [ ] **Step 4:** `npx tsc -b`, tests pass. Browser: ✎ → edit mode with music paused; edit lyrics → back with 完成 → lyrics updated; pick a cover hit → confirm updates title/artist; set a theme on a coverless song → backdrop and art change; upload a background → backdrop uses it; 移除翻译 clears translations.

---

### Task 5: Library rows

**Files:**
- Create: `src/Library.tsx`
- Modify: `src/App.tsx` (replace library markup; call `markOpened` in `openSaved` and `practiceList`), `src/index.css`

**Interfaces:**
- Consumes: `buildRows`, `ROW_LABEL`, `loadOpened`, `markOpened`, `loadRowOrder`, `saveRowOrder` (Task 1); `Art` (Task 2); `ChipsPicker` not needed.
- Produces: `<Library songs: SongMeta[]; currentId: string; onOpen(id): void; onEdit(id): void; onNew(): void; onPatch(id, patch: Partial<Song>): void; onDelete(id): void; onPracticeList(name): void; onHover(meta: SongMeta | null): void />`. App passes `onHover` to swap the Backdrop to the hovered song's `cover` / theme (cover only, never `bg`).

- [ ] **Step 1: Header & filters.** Title 曲库 + count; buttons 调整顺序, primary ＋ 新歌曲 (→ tab `'new'`). One chip row for 歌单 and 标签 (only if any exist). Selecting a chip replaces the rows with one grid of matching songs; for a 歌单 chip also show `▶ 按歌单练习`. Click again to clear.
- [ ] **Step 2: Rows.** For each `buildRows(...)` row: heading (label + count), horizontally scrolling shelf (hidden scrollbar, 48px side padding). Card 168px: `<Art>` sleeve + vinyl disc behind it (label = same `<Art>`); hover lifts the sleeve (`translateY(-6px) rotate(-2deg)`) and slides the disc `translateX(54px)` while it spins. Under the sleeve: title (ellipsis), artist, right-aligned status label — or relative time (`n 分钟前 / n 小时前 / n 天前`) in the 最近播放 row.
- [ ] **Step 3: Card actions.** Favourite button top-right: 34×30px, radius 10px, `rgba(40,40,46,.55)` + blur, white outlined star SVG, filled when fav; always visible. Bottom-left on hover (always visible under `@media (hover: none)`): status chip (cycles `nextStatus`), `⋯` menu with 编辑 (open song + `editing = true`), 加入歌单… (small popover of existing lists as toggle chips + 新建), 删除这首歌 (`confirm('删除「…」？歌词和音频都会删掉，不能恢复。')` → existing delete logic: `deleteSong`, `deleteRemote`, refresh list; if it was the current song, `open(newSong())`; stay in library). All action clicks `stopPropagation`. Card click → `onOpen` (practice).
- [ ] **Step 4: Reorder mode.** 调整顺序 toggles: rows collapse to bars with ⋮⋮ handle (HTML5 drag) and ↑ ↓ buttons; 完成 exits. Persist with `saveRowOrder`.
- [ ] **Step 5:** `openSaved` and `practiceList` call `markOpened(id)`; Library re-reads `loadOpened()` when it mounts.
- [ ] **Step 6:** `npx tsc -b`, tests pass. Browser: rows show in default order; hover changes background; reorder persists across reload; fav button toggles without opening; deleting the open song leaves the library showing and the song gone.

---

### Task 6: New-song wizard

**Files:**
- Create: `src/NewSong.tsx`
- Modify: `src/App.tsx` (tab `'new'` renders it), `src/index.css`

**Interfaces:**
- Consumes: `parseLyrics` (`lrc.ts`), `searchCovers`, `toCover` (`cover.ts`), `Art`.
- Produces: `<NewSong artists: string[]; onDone(song: Song): void; onCancel(): void />`. It builds a local `Song` (`newSong()` shape); `onDone` saves it (`update`-equivalent: `saveSong`, `listSongs`, `queuePush`), opens it and switches to practice.

- [ ] **Step 1: Shell.** Full-screen glass card, step indicator 1·2·3, 上一步 / 下一步 / 跳过 buttons, ✕ (cancel).
- [ ] **Step 2: Step 1 歌词** (required): large textarea + 导入 .txt/.lrc. 下一步 disabled while empty.
- [ ] **Step 3: Step 2 选歌:** search term prefilled with the imported file name or the first lyric line (with `{…}` readings stripped); results auto-load (`searchCovers`) as a grid; clicking one sets title, artist and `cover` (via `toCover`). 改搜索词 input + 手动填写 toggle (title input, artist input with datalist of `artists`). Can skip (title falls back to the first lyric line).
- [ ] **Step 4: Step 3 音频** (optional): three track rows + drop zone; files kept in the local song's `audio` with `audioRev` timestamps. 完成 → `onDone`.
- [ ] **Step 5: Leaving early** (✕ or clicking 曲库 in nav while on `'new'`): if lyrics are non-empty → `onDone`-style save but stay on the target tab; else discard.
- [ ] **Step 6:** `npx tsc -b`, tests pass. Browser: full flow paste → pick hit → skip audio → lands in practice with title/artist/cover set; ✕ with empty lyrics saves nothing.

---

### Task 7: Final verification

- [ ] **Step 1:** `node --test src/*.test.ts` all pass; `npx tsc -b` clean; `npm run lint` no new errors.
- [ ] **Step 2:** Browser at 1280×800 and mobile preset: library, practice (playing + paused), edit mode, wizard, settings. Screenshots of each.
- [ ] **Step 3:** Print preview from the practice panel: white page, black lyrics, title shown, no backdrop.
- [ ] **Step 4:** `prefers-reduced-motion` emulation: background static, no pulse.
