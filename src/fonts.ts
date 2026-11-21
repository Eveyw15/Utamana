// Font choices for the settings panel. Web fonts come from the Google Fonts link in index.html.
export const DEFAULT_STACK = "'PingFang SC', 'Hiragino Sans', 'Noto Sans JP', 'Microsoft YaHei', system-ui, sans-serif"

// Chinese UI text uses Chinese glyphs first; a Japanese font draws some hanzi (e.g. 复) oddly next to Chinese ones.
const UI_STACK = "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif"

export const FONTS: { label: string; css: string }[] = [
  { label: '苹方风格（默认）', css: DEFAULT_STACK },
  { label: '圆体 M PLUS Rounded', css: "'M PLUS Rounded 1c', sans-serif" },
  { label: '丸ゴシック Zen Maru', css: "'Zen Maru Gothic', sans-serif" },
  { label: '小杉丸 Kosugi Maru', css: "'Kosugi Maru', sans-serif" },
  { label: '手写感 Klee One', css: "'Klee One', cursive" },
  { label: '明朝 Noto Serif', css: "'Noto Serif JP', serif" },
]

// ui/lyric: a FONTS css value, or the name of a locally installed font. uiScale: whole-page zoom; lyricSize: lyric px;
// bounce: the sung line pops once as it arrives.
export type FontSettings = { ui: string; lyric: string; uiScale: number; lyricSize: number; bounce: boolean }

const KEY = 'utamana:fonts'

const DEFAULTS: FontSettings = { ui: DEFAULT_STACK, lyric: DEFAULT_STACK, uiScale: 1, lyricSize: 21, bounce: true }

export function loadFonts(): FontSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

// A custom name is a single installed font; keep the default stack behind it for missing glyphs.
export const toCss = (v: string) =>
  !v.trim() ? DEFAULT_STACK : FONTS.some((f) => f.css === v) ? v : `"${v.replace(/["\\;]/g, '')}", ${DEFAULT_STACK}`

export function applyFonts(s: FontSettings) {
  document.documentElement.style.setProperty('--ui-font', s.ui === DEFAULT_STACK ? UI_STACK : toCss(s.ui))
  document.documentElement.style.setProperty('--lyric-font', toCss(s.lyric))
  document.documentElement.style.setProperty('--lyric-size', `${s.lyricSize}px`)
  document.documentElement.style.zoom = String(s.uiScale)
  document.documentElement.dataset.bounce = s.bounce ? 'on' : 'off'
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}
