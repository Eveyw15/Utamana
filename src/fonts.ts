// Font choices for the settings panel. Web fonts come from the Google Fonts link in index.html.
export const DEFAULT_STACK = "'PingFang SC', 'Hiragino Sans', 'Noto Sans JP', 'Microsoft YaHei', system-ui, sans-serif"

export const FONTS: { label: string; css: string }[] = [
  { label: '苹方风格（默认）', css: DEFAULT_STACK },
  { label: '圆体 M PLUS Rounded', css: "'M PLUS Rounded 1c', sans-serif" },
  { label: '丸ゴシック Zen Maru', css: "'Zen Maru Gothic', sans-serif" },
  { label: '小杉丸 Kosugi Maru', css: "'Kosugi Maru', sans-serif" },
  { label: '手写感 Klee One', css: "'Klee One', cursive" },
  { label: '明朝 Noto Serif', css: "'Noto Serif JP', serif" },
]

export type FontSettings = { ui: string; lyric: string } // a FONTS css value, or the name of a locally installed font

const KEY = 'utamana:fonts'

export function loadFonts(): FontSettings {
  try {
    return { ui: DEFAULT_STACK, lyric: DEFAULT_STACK, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ui: DEFAULT_STACK, lyric: DEFAULT_STACK }
  }
}

// A custom name is a single installed font; keep the default stack behind it for missing glyphs.
export const toCss = (v: string) =>
  !v.trim() ? DEFAULT_STACK : FONTS.some((f) => f.css === v) ? v : `"${v.replace(/["\\;]/g, '')}", ${DEFAULT_STACK}`

export function applyFonts(s: FontSettings) {
  document.documentElement.style.setProperty('--ui-font', toCss(s.ui))
  document.documentElement.style.setProperty('--lyric-font', toCss(s.lyric))
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}
