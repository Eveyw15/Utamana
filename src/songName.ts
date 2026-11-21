import { toHiragana } from 'wanakana'

// Song names written different ways (width, case, version suffixes, traditional / simplified Chinese,
// romaji / kana) reduced to comparable keys, for grouping community posts and for search.

const BRACKETS = /[(（[［【〔][^)）\]］】〕]*[)）\]］】〕]/g
const NOISE = /[\s\p{P}\p{S}]/gu

// t2s: optional traditional -> simplified converter (opencc), injected so this stays pure and testable.
export function normalizeName(s: string, t2s: (s: string) => string = (x) => x) {
  return t2s(s.normalize('NFKC')).toLowerCase().replace(BRACKETS, '').replace(NOISE, '')
}

export function groupKey(x: { trackId?: number; title: string; artist: string }, t2s?: (s: string) => string) {
  return x.trackId ? `itunes:${x.trackId}` : `name:${normalizeName(x.title, t2s)}|${normalizeName(x.artist, t2s)}`
}

// Kana / romaji to one hiragana spelling: long vowels collapsed (toukyou = tokyo), particle は = わ.
export function readingKey(s: string) {
  return toHiragana(s.normalize('NFKC').toLowerCase())
    .replace(/[\sー]/g, '')
    .replace(NOISE, '')
    .replace(/は/g, 'わ')
    .replace(/([おこごそぞとどのほぼぽもよょろを])[うお]/g, '$1')
    .replace(/([うくぐすずつづぬふぶぷむゆゅる])う/g, '$1')
}

const READABLE = /[ぁ-ヿa-z]/i

export function searchText(parts: string[]) {
  const keys = new Set<string>()
  for (const p of parts) {
    keys.add(normalizeName(p))
    if (READABLE.test(p)) keys.add(readingKey(p))
  }
  keys.delete('')
  return [...keys].join(' ')
}

export function queryKeys(q: string) {
  return [...new Set([normalizeName(q), readingKey(q)])].filter(Boolean)
}
