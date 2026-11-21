import type { CSSProperties } from 'react'
import { themeFor } from './theme'

type Props = { song: { id: string; title: string; cover?: string; theme?: string }; className?: string }

// A song's square artwork: its cover, or a cover drawn from its default theme (flat pastel field, a circle,
// a thin arc and the title's first character).
export function Art({ song, className = '' }: Props) {
  if (song.cover) return <span className={`art ${className}`}><img src={song.cover} alt="" /></span>
  const [field, circle, ink] = themeFor(song).art
  return (
    <span className={`art gen ${className}`} style={{ '--a0': field, '--a1': circle, '--a2': ink } as CSSProperties}>
      <small>UTAMANA</small>
      <b lang="ja">{[...song.title.trim()][0] ?? '♪'}</b>
    </span>
  )
}
