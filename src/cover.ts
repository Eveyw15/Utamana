// Album covers: searched on the iTunes Search API (no key, CORS open) or uploaded, and stored as a
// small JPEG data URL so they fit in the song summary and in the synced song data.

export type CoverHit = { title: string; artist: string; album: string; url: string }

export async function searchCovers(term: string): Promise<CoverHit[]> {
  // Japanese store first: most songs here are Japanese and titles match better there.
  const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: 'song', limit: '12', country: 'jp' })}`)
  if (!res.ok) throw new Error(`搜索失败（${res.status}）`)
  const { results } = (await res.json()) as { results: { trackName: string; artistName: string; collectionName: string; artworkUrl100?: string }[] }
  const seen = new Set<string>()
  return results
    .filter((r) => r.artworkUrl100 && !seen.has(r.artworkUrl100) && seen.add(r.artworkUrl100))
    .map((r) => ({ title: r.trackName, artist: r.artistName, album: r.collectionName, url: r.artworkUrl100!.replace('100x100bb', '600x600bb') }))
}

// Square-crop and shrink to 300 px (~40 KB).
export async function toCover(src: Blob | string) {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src
  const img = await createImageBitmap(blob)
  const side = Math.min(img.width, img.height)
  const canvas = Object.assign(document.createElement('canvas'), { width: 300, height: 300 })
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 300, 300)
  return canvas.toDataURL('image/jpeg', 0.8)
}
