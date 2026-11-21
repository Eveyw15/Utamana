import type { CSSProperties } from 'react'
import type { Theme } from './theme'

type Props = {
  image?: string // cover or uploaded background; without one the theme colours flow instead
  theme: Theme
  mode: 'practice' | 'page' // practice follows playback and the beat; other pages flow gently, darker
  playing: boolean
  pulse: number // 0..1, brightness kick on the beat
}

// Full-screen flowing background: three heavily blurred copies of the image (or three theme colour blobs)
// slowly turning, under a dark veil so white text stays readable.
export function Backdrop({ image, theme, mode, playing, pulse }: Props) {
  const running = mode === 'page' || playing
  const style = {
    '--b0': theme.bg[0],
    filter: pulse > 0.01 ? `brightness(${1 + 0.12 * pulse})` : undefined,
  } as CSSProperties
  return (
    <div className={`backdrop no-print ${image ? 'img' : 'tint'} ${mode} ${running ? 'running' : ''}`} style={style} aria-hidden>
      {[1, 2, 3].map((i) => (
        <i key={i} style={image ? { backgroundImage: `url(${image})` } : { background: theme.bg[i] }} />
      ))}
    </div>
  )
}
