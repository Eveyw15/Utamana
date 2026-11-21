// Album covers: searched on the iTunes Search API (no key, CORS open) or uploaded, and stored as a
// small JPEG data URL so they fit in the song summary and in the synced song data.

// trackId is Apple's id for the recording, the same in every storefront (only the shown name differs), so it
// identifies a song across languages. aliases: the other storefronts' names for it.
export type CoverHit = { trackId: number; title: string; artist: string; album: string; url: string; aliases: string[] }
type ItunesResult = { trackId: number; trackName: string; artistName: string; collectionName: string; artworkUrl100?: string }

const STORES = ['jp', 'tw', 'cn', 'us']

// One list from several storefronts' results, joined by trackId; the Japanese store's names win.
export function mergeHits(byCountry: { country: string; results: ItunesResult[] }[]): CoverHit[] {
  const hits = new Map<number, CoverHit & { jp: boolean }>()
  for (const { country, results } of byCountry)
    for (const r of results) {
      if (!r.artworkUrl100) continue
      const jp = country === 'jp'
      const h = hits.get(r.trackId)
      if (!h) {
        hits.set(r.trackId, { trackId: r.trackId, title: r.trackName, artist: r.artistName, album: r.collectionName, url: r.artworkUrl100.replace('100x100bb', '600x600bb'), aliases: [], jp })
        continue
      }
      if (jp && !h.jp) {
        h.aliases.push(h.title)
        Object.assign(h, { title: r.trackName, artist: r.artistName, album: r.collectionName, jp })
      } else h.aliases.push(r.trackName)
    }
  return [...hits.values()].map(({ jp: _, ...h }) => ({ ...h, aliases: [...new Set(h.aliases)].filter((a) => a !== h.title) }))
}

// Searched in the jp / tw / cn / us stores at once, so Chinese (simplified or traditional) and English names
// find the Japanese song too. A store that fails is skipped; only all failing is an error.
export async function searchCovers(term: string): Promise<CoverHit[]> {
  const got = await Promise.allSettled(
    STORES.map(async (country) => {
      const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: 'song', limit: '12', country })}`)
      if (!res.ok) throw new Error(`搜索失败（${res.status}）`)
      return { country, results: ((await res.json()) as { results: ItunesResult[] }).results }
    }),
  )
  const ok = got.flatMap((g) => (g.status === 'fulfilled' ? [g.value] : []))
  if (!ok.length) throw (got[0] as PromiseRejectedResult).reason
  // Japanese store first: its order is the best match for Japanese songs.
  return mergeHits(ok.sort((a, b) => Number(b.country === 'jp') - Number(a.country === 'jp')))
}

// The Japanese store's name for a track: the canonical title / artist used for lyrics search and grouping.
export async function lookupJp(trackId: number): Promise<{ title: string; artist: string } | null> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?${new URLSearchParams({ id: String(trackId), country: 'jp' })}`)
    const r = ((await res.json()) as { results: ItunesResult[] }).results[0]
    return r ? { title: r.trackName, artist: r.artistName } : null
  } catch {
    return null
  }
}

// Square-crop and shrink to `size` px (300 px is ~40 KB; avatars use 128).
export async function toCover(src: Blob | string, size = 300) {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src
  const img = await createImageBitmap(blob)
  const side = Math.min(img.width, img.height)
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.8)
}

// Uploaded page background: keep the aspect ratio, long side at most 1920 px (~200-400 KB).
export async function toBackground(src: Blob) {
  const img = await createImageBitmap(src)
  const k = Math.min(1, 1920 / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}
