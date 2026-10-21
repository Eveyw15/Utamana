import { loadFont as loadMaru } from '@remotion/google-fonts/ZenMaruGothic'
import { loadFont as loadSC } from '@remotion/google-fonts/NotoSansSC'

// Japanese text in a rounded face, Chinese UI text in a PingFang-like sans.
export const JP = loadMaru('normal', { weights: ['500', '700'] }).fontFamily
export const ZH = loadSC('normal', { weights: ['400', '700'] }).fontFamily

export const C = {
  bg: '#f7f4ee',
  paper: '#fffdf9',
  fg: '#2b2a33',
  muted: '#8a8691',
  line: '#e6e0d6',
  accent: '#e0607e',
  soft: '#fbe7ec',
  indigo: '#4b5aa8',
  shadow: '0 2px 4px rgba(60,40,30,.06), 0 18px 50px rgba(60,40,30,.10)',
}
