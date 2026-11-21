// Lyrics search on LRCLIB (lrclib.net: free, no key, CORS open). Most entries carry timed LRC lyrics,
// which also fill in the line times.

export type LyricHit = { id: number; title: string; artist: string; album: string; duration: number; synced: boolean; text: string }

type Raw = { id: number; trackName: string; artistName: string; albumName: string; duration: number; plainLyrics: string | null; syncedLyrics: string | null }

export const toHit = (r: Raw): LyricHit => ({
  id: r.id,
  title: r.trackName,
  artist: r.artistName,
  album: r.albumName,
  duration: r.duration,
  synced: !!r.syncedLyrics,
  text: r.syncedLyrics || r.plainLyrics || '',
})

// Timed lyrics first, then the closest in length to the song (when its audio is known); empty ones dropped.
export function rankHits(hits: LyricHit[], duration?: number) {
  return hits
    .filter((h) => h.text.trim())
    .map((h, i) => ({ h, i }))
    .sort((a, b) => Number(b.h.synced) - Number(a.h.synced) || (duration ? Math.abs(a.h.duration - duration) - Math.abs(b.h.duration - duration) : 0) || a.i - b.i)
    .map((x) => x.h)
}

export async function searchLyrics(q: string): Promise<LyricHit[]> {
  const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q })}`)
  if (!res.ok) throw new Error(`搜索失败（${res.status}）`)
  return ((await res.json()) as Raw[]).map(toHit)
}
