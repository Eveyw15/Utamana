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
