// Default looks for songs without a cover: a pastel (macaron / Morandi) palette per theme, used to draw a
// generated cover (art) and the flowing page background (bg). A song keeps its theme by name in song.theme;
// without one it gets a stable theme from a hash of its id.

export type Theme = {
  name: string
  group: '马卡龙' | '莫兰迪'
  art: [field: string, circle: string, ink: string]
  bg: [base: string, b1: string, b2: string, b3: string]
}

export const THEMES: Theme[] = [
  { name: '樱花', group: '马卡龙', art: ['#fbe3e8', '#f7b9c6', '#c46b80'], bg: ['#3a2a30', '#f7b9c6', '#fbe3e8', '#e8a3b8'] },
  { name: '薄荷', group: '马卡龙', art: ['#dff3ea', '#a8dcc4', '#4f8f74'], bg: ['#24332d', '#a8dcc4', '#dff3ea', '#9fd0d8'] },
  { name: '柠檬', group: '马卡龙', art: ['#fbf3d0', '#f4dc86', '#a88a2c'], bg: ['#35311f', '#f4dc86', '#fbf3d0', '#f6c9a0'] },
  { name: '薰衣草', group: '马卡龙', art: ['#ebe4f7', '#c9b8ec', '#7a65a8'], bg: ['#2c2836', '#c9b8ec', '#ebe4f7', '#b9c6f0'] },
  { name: '天空', group: '马卡龙', art: ['#ddeefa', '#a9d1f0', '#4b7fa8'], bg: ['#243039', '#a9d1f0', '#ddeefa', '#b8e0e0'] },
  { name: '雾粉', group: '莫兰迪', art: ['#e8d9d6', '#c9a9a4', '#8a6a66'], bg: ['#2f2a29', '#c9a9a4', '#e8d9d6', '#b7a3a8'] },
  { name: '灰绿', group: '莫兰迪', art: ['#dfe3d9', '#a9b5a0', '#66735e'], bg: ['#2a2d28', '#a9b5a0', '#dfe3d9', '#b8bfae'] },
  { name: '雾蓝', group: '莫兰迪', art: ['#d9e0e6', '#9fb0bf', '#5f7080'], bg: ['#272b30', '#9fb0bf', '#d9e0e6', '#aab3c4'] },
  { name: '燕麦', group: '莫兰迪', art: ['#ece4d8', '#cdbba2', '#8a7559'], bg: ['#302c26', '#cdbba2', '#ece4d8', '#c7b9b0'] },
  { name: '藕紫', group: '莫兰迪', art: ['#e3dbe3', '#b8a6b8', '#776478'], bg: ['#2c282d', '#b8a6b8', '#e3dbe3', '#a9a0b6'] },
]

export const FALLBACK_THEME = '雾蓝'

// FNV-1a: tiny, stable across sessions and devices.
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

export const themeFor = (s: { id: string; theme?: string }): Theme =>
  THEMES.find((t) => t.name === s.theme) ?? THEMES[hash(s.id) % THEMES.length]
