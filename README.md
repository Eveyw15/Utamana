# うたまな Utamana

English | [简体中文](README.zh-CN.md)

A practice tool for learning Japanese songs. Paste lyrics to get furigana and romaji automatically, load your own audio and sync it line by line, then change speed and key, adjust the vocal volume, practise with a metronome and print a lyric sheet.

The app ships no lyrics and never fetches them from the web. It only works with what you import yourself.

## Features

- **Automatic furigana**: kuromoji tokenizes each line; readings sit above the kanji and romaji below (particles は/へ/を read as wa/e/o). Fix a reading by clicking the kanji, or write `漢字{よみ}` in the lyrics.
- **Multi-track playback**: original, vocals and instrumental tracks, each with its own volume. Turn vocals down to 0 for karaoke; with only the original there is a simple vocal remover.
- **Speed and key**: real-time SoundTouch processing, speed without pitch change, key ±6 semitones.
- **Lyric sync**: tap Space at the start of each line while the song plays, or import `.lrc`. The current line is highlighted and clicking a line seeks to it.
- **Metronome**: automatic BPM and beat detection, speed shown in BPM, per-section BPM and beats per bar for songs with meter changes, three click sounds.
- **Translations**: import a translation (timed LRC files are matched by timestamp) or translate to Chinese with Google Translate.
- **Online audio**: import the audio of a Bilibili or YouTube video by URL (needs yt-dlp).
- **Print / PDF**: a laid-out lyric sheet; choose whether to include furigana, romaji and translation.
- **Library and cloud sync**: a library page for all songs, and optional sync across devices through your own Supabase project, audio included.
- **Fonts**: pick separate UI and lyric fonts, including fonts installed on your computer.

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

Without cloud sync, songs live only in this browser's IndexedDB, and **clearing browser data deletes them**. Turn on cloud sync, or export `.lrc` from the editor as a backup.

## Usage

1. **New song**: click "＋ 新建歌曲" in the library, fill in title and artist, then paste lyrics (plain text or LRC) or import a `.txt` / `.lrc` file.
2. **Audio**: add any of original, vocals and instrumental. For best results split the song first with [MISST](https://misst.app/) or [UVR](https://github.com/Anjok07/ultimatevocalremovergui) and upload the two stems.
3. **Sync**: on the practice page click "开始打点", press Space as each line starts, Backspace to step back.
4. **Metronome**: click "自动测速". Use ÷2 / ×2 if the BPM is off by an octave. If the accent is off, click the section's time on a downbeat; where the meter changes, click "从当前位置变拍" to add a section.
5. **Print**: click "打印 / 导出 PDF" and choose "Save as PDF" in the print dialog.

### Import from Bilibili / YouTube (optional)

```bash
winget install yt-dlp.yt-dlp
```

Restart `npm run dev`, then paste a link on the edit page. This feature and auto-translate go through the local dev server, so they only work under `npm run dev` / `npm run preview`. Follow each platform's terms and use it for personal study only.

### Accounts and cloud sync (optional)

1. Create a project on [Supabase](https://supabase.com) (the free tier is enough).
2. In the project's SQL Editor, paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. Under Authentication → URL Configuration, set Site URL to `http://localhost:5173`.
4. Copy `.env.example` to `.env.local` and fill in the Project URL and anon public key from Project Settings → API.
5. Restart `npm run dev`, open "设置" (settings) at the top right and sign in with your email.

Lyrics, readings, timings, translations, metronome settings and audio are synced. If a song was edited on two devices, the last save wins. The free tier includes 1 GB of storage.

## Development

```bash
node --test src/*.test.ts   # unit tests
npm run build               # type-check and build
```

| File | What it does |
| --- | --- |
| `src/App.tsx` | UI: library, editor, practice |
| `src/furigana.ts` | Tokenizing, furigana, romaji |
| `src/player.ts` | Track mixing, tempo/pitch, metronome mixing |
| `src/beat.ts` | Tempo detection and beat grid |
| `src/lrc.ts` | LRC parsing, translation alignment |
| `src/db.ts` | Local storage (IndexedDB) |
| `src/cloud.ts`, `src/syncPlan.ts` | Supabase cloud sync |
| `vite.config.ts` | Local API: yt-dlp download, translation proxy |

Built with Vite, React, TypeScript, [kuromoji](https://github.com/takuyaa/kuromoji.js), [wanakana](https://github.com/WaniKani/WanaKana), [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) and [Supabase](https://supabase.com).
