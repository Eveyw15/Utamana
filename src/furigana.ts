import type kuromoji from 'kuromoji'
import { toHiragana, toRomaji } from 'wanakana'

// at/len: where this segment sits in the source line, so an edited reading can be written back.
export type Seg = { text: string; ruby?: string; at?: number; len?: number }
export type Annotated = { segs: Seg[]; romaji: string }

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null

export function getTokenizer() {
  tokenizerPromise ??= new Promise((resolve, reject) =>
    (window as unknown as { kuromoji: typeof kuromoji }).kuromoji.builder({ dicPath: '/dict/' }).build((err, t) => (err ? reject(err) : resolve(t))),
  )
  return tokenizerPromise
}

export const KANJI = /[々一-鿿㐀-䶿豈-﫿]/
const KANJI_RUN = /([々一-鿿㐀-䶿豈-﫿]+)/
// Manual reading override in lyrics text: 漢字{かんじ}
const OVERRIDE = new RegExp(`(${KANJI.source}+)\\{([^}]*)\\}`, 'g')

// Split a word like 取り扱い / とりあつかい into ruby only over the kanji parts.
export function alignRuby(surface: string, reading: string): Seg[] {
  if (!KANJI.test(surface)) return [{ text: surface }]
  const parts = surface.split(KANJI_RUN).filter(Boolean)
  const pattern = parts
    .map((p) => (KANJI.test(p) ? '(.+?)' : toHiragana(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
  const m = new RegExp(`^${pattern}$`).exec(reading)
  if (!m) return [{ text: surface, ruby: reading }]
  let g = 1
  return parts.map((p) => (KANJI.test(p) ? { text: p, ruby: m[g++] } : { text: p }))
}

// Particles are written は/へ/を but sung wa/e/o.
const PARTICLE: Record<string, string> = { は: 'wa', へ: 'e', を: 'o' }

// Words are kept as kana until the end so っ and glued endings romanise together (降って -> futte).
function glues(t: kuromoji.IpadicFeatures, prev: string | undefined) {
  return !!prev && (t.pos === '助動詞' || t.pos_detail_1 === '接続助詞' || t.pos_detail_1 === '接尾' || prev.endsWith('っ'))
}

function annotatePlain(tok: kuromoji.Tokenizer<kuromoji.IpadicFeatures>, text: string, base: number, segs: Seg[], words: string[]) {
  for (const t of tok.tokenize(text)) {
    const surface = t.surface_form
    if (/^\s+$/.test(surface)) continue
    const reading = t.reading && t.reading !== '*' ? toHiragana(t.reading) : null
    let at = base + t.word_position - 1
    for (const s of reading ? alignRuby(surface, reading) : [{ text: surface }]) {
      segs.push({ ...s, at, len: s.text.length })
      at += s.text.length
    }
    if (t.pos === '記号') continue
    const kana = (t.pos === '助詞' && PARTICLE[surface]) || reading || surface
    const prev = words[words.length - 1]
    if (glues(t, prev)) words[words.length - 1] += kana
    else words.push(kana)
  }
}

export async function annotateLine(line: string): Promise<Annotated> {
  const tok = await getTokenizer()
  const segs: Seg[] = []
  const words: string[] = []
  let last = 0
  for (const m of line.matchAll(OVERRIDE)) {
    annotatePlain(tok, line.slice(last, m.index), last, segs, words)
    segs.push({ text: m[1], ruby: m[2], at: m.index, len: m[0].length })
    words.push(m[2])
    last = m.index! + m[0].length
  }
  annotatePlain(tok, line.slice(last), last, segs, words)
  return { segs, romaji: words.map((w) => toRomaji(w)).join(' ').trim() }
}

// Write a reading back into the lyric line as 漢字{よみ}; an empty reading drops the override.
export function setReading(line: string, seg: Seg, reading: string) {
  const kana = toHiragana(reading.trim())
  return line.slice(0, seg.at) + (kana ? `${seg.text}{${kana}}` : seg.text) + line.slice(seg.at! + seg.len!)
}
