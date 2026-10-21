import type { ReactNode } from 'react'
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, JP, ZH } from './theme'
import markers from '../public/markers.json'

// Sharing-style video: why I built it, then the real app in action with casual subtitles.
type Clip = { from: number; to: number; rate?: number; focusY: number; chapter: string; lines: string[] }
const m = markers as Record<string, number>
const CLIPS: Clip[] = [
  { from: m.edit, to: m.furigana, focusY: 260, chapter: '① 粘贴歌词', lines: ['新建一首歌，把歌词整段粘进去'] },
  { from: m.furigana, to: m.reading, focusY: 330, chapter: '② 自动注音', lines: ['切到练习页，假名和罗马音直接就标好了'] },
  { from: m.reading, to: m.audio, focusY: 300, chapter: '③ 改读音', lines: ['读音不对就双击汉字改，比如「明日」我想读成あす'] },
  { from: m.audio, to: m.sync, focusY: 160, chapter: '④ 放入音乐', lines: ['再把歌放进来，原曲、人声、伴奏可以分开放'] },
  { from: m.sync, to: m.sync + 15, rate: 1.5, focusY: 420, chapter: '⑤ 打点同步', lines: ['边听边按空格，一句一句打点', '打完歌词就会跟着歌走'] },
  { from: m.seek, to: m.seek + 6.5, focusY: 450, chapter: '⑥ 逐句跟唱', lines: ['点哪句就从哪句开始，空格暂停'] },
  { from: m.tap, to: m.metronome, focusY: 380, chapter: '⑦ 变速降调', lines: ['跟着拍子按 T 测出 BPM', '然后按 BPM 放慢，再降个调，跟唱轻松多了'] },
  { from: m.metronome, to: m.translate, focusY: 330, chapter: '⑧ 节拍器', lines: ['节拍器还能分段设拍号', '变拍子的歌终于数得清了'] },
  { from: m.translate, to: m.print, focusY: 420, chapter: '⑨ 翻译', lines: ['翻译可以导入，也可以一键机翻'] },
  { from: m.print, to: m.library, focusY: 420, chapter: '⑩ 打印', lines: ['还能直接打印成纸质歌词本'] },
  { from: m.library, to: m.end, focusY: 300, chapter: '⑪ 曲库', lines: ['所有歌都在曲库里，登录后还能云同步'] },
]
const clipFrames = (c: Clip) => Math.round(((c.to - c.from) / (c.rate ?? 1)) * 30)

const INTRO: [number, () => ReactNode][] = [
  [80, Hook],
  [150, Search],
  [165, Chat],
  [90, Reveal],
]
const OUTRO = 210
export const VLOG_TOTAL = INTRO.reduce((s, [d]) => s + d, 0) + CLIPS.reduce((s, c) => s + clipFrames(c), 0) + OUTRO

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp)
function usePop(delay = 0) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 140 } })
}

function Typing({ text, start = 0, cps = 14, style }: { text: string; start?: number; cps?: number; style?: React.CSSProperties }) {
  const f = useCurrentFrame()
  const n = Math.max(0, Math.floor(((f - start) / 30) * cps))
  return (
    <span style={style}>
      {text.slice(0, n)}
      {n < text.length && <span style={{ opacity: f % 20 < 10 ? 1 : 0 }}>▍</span>}
    </span>
  )
}

const Center = ({ children }: { children: ReactNode }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: ZH, background: C.bg }}>{children}</AbsoluteFill>
)

function Hook() {
  return (
    <Center>
      <Typing text="学日语歌的时候……" start={6} cps={9} style={{ fontSize: 84, fontWeight: 700, color: C.fg }} />
    </Center>
  )
}

function Search() {
  const f = useCurrentFrame()
  const results = ['某某歌 歌词 平假名版', '某某歌 罗马音 歌词', '某某歌 歌词 假名标注（不全）']
  return (
    <Center>
      <div style={{ width: 1200, background: C.paper, borderRadius: 24, boxShadow: C.shadow, padding: '30px 40px' }}>
        <div style={{ border: `2px solid ${C.line}`, borderRadius: 999, padding: '16px 28px', fontSize: 34, color: C.fg }}>
          🔍 <Typing text="某某歌 歌词 罗马音 假名" start={4} cps={12} />
        </div>
        {results.map((r, i) => {
          const p = usePop(40 + i * 12)
          return (
            <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, padding: '18px 24px', borderRadius: 16, background: C.bg, fontSize: 32, opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
              <span style={{ color: C.indigo, textDecoration: 'underline' }}>{r}</span>
              <span style={{ color: C.accent, fontSize: 28, opacity: ease(f, 90 + i * 6, 100 + i * 6) }}>{['格式乱', '对不上', '只有一半'][i]}</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 46, color: C.fg, marginTop: 50, opacity: ease(f, 100, 115) }}>每首歌都要到处找假名和罗马音版本，找到了还经常对不上</div>
    </Center>
  )
}

function Chat() {
  const f = useCurrentFrame()
  return (
    <Center>
      <div style={{ fontSize: 56, fontWeight: 700, color: C.fg, marginBottom: 50, opacity: ease(f, 0, 12) }}>
        于是我干脆让 <span style={{ color: C.accent }}>Claude Opus 5.5</span> 帮我搓了一个
      </div>
      <div style={{ width: 1250, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: 1000, background: C.accent, color: '#fff', borderRadius: '28px 28px 6px 28px', padding: '24px 34px', fontSize: 32, lineHeight: 1.5, opacity: ease(f, 14, 22) }}>
          <Typing text="我想做一个类似 utaten 的网页：上传歌词自动注假名和罗马音，能放自己的音乐对歌词，调速度、升降 key，还能打印成纸质版，方便我学日语歌" start={20} cps={30} />
        </div>
        <div style={{ alignSelf: 'flex-start', background: C.paper, boxShadow: C.shadow, borderRadius: '28px 28px 28px 6px', padding: '24px 34px', fontSize: 32, color: C.fg, opacity: ease(f, 125, 135) }}>
          好，先搭项目、做注音……
        </div>
      </div>
    </Center>
  )
}

function Reveal() {
  const f = useCurrentFrame()
  const p = usePop(2)
  return (
    <Center>
      <div style={{ fontFamily: JP, fontSize: 180, fontWeight: 700, color: C.accent, transform: `scale(${p})` }}>うたまな</div>
      <div style={{ fontSize: 42, color: C.muted, marginTop: 6, opacity: ease(f, 15, 28) }}>歌 + 学ぶ ＝ 学唱歌</div>
      <div style={{ fontSize: 48, color: C.fg, marginTop: 50, opacity: ease(f, 35, 48) }}>下面直接看实际效果 👇</div>
    </Center>
  )
}

function Subtitle({ text, enter }: { text: string; enter: number }) {
  const f = useCurrentFrame()
  const o = ease(f, enter, enter + 6)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div style={{ fontFamily: ZH, fontSize: 52, fontWeight: 700, color: '#fff', background: 'rgba(43,42,51,.78)', padding: '14px 36px', borderRadius: 18 }}>{text}</div>
    </div>
  )
}

function ClipScene({ clip }: { clip: Clip }) {
  const f = useCurrentFrame()
  const dur = clipFrames(clip)
  const s = 1.75
  const lineAt = (i: number) => Math.round((dur / clip.lines.length) * i)
  const current = clip.lines.reduce((acc, _, i) => (f >= lineAt(i) ? i : acc), 0)
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: Math.min(ease(f, 0, 6), 1 - ease(f, dur - 6, dur)) }}>
      <AbsoluteFill style={{ transform: `scale(${s}) translateY(${540 - clip.focusY}px)`, transformOrigin: '960px 540px' }}>
        <OffthreadVideo src={staticFile('demo.webm')} startFrom={Math.round(clip.from * 30)} playbackRate={clip.rate ?? 1} muted />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 60, top: 50, fontFamily: ZH, fontSize: 34, fontWeight: 700, color: '#fff', background: C.accent, padding: '10px 28px', borderRadius: 999, boxShadow: C.shadow }}>
        {clip.chapter}
      </div>
      <Subtitle key={current} text={clip.lines[current]} enter={lineAt(current)} />
    </AbsoluteFill>
  )
}

function Outro() {
  const f = useCurrentFrame()
  return (
    <Center>
      <div style={{ fontSize: 60, fontWeight: 700, color: C.fg, opacity: ease(f, 0, 12) }}>整个项目都开源了，本地就能跑</div>
      <div style={{ fontSize: 46, color: C.indigo, marginTop: 40, fontFamily: 'monospace', opacity: ease(f, 15, 28) }}>github.com/Eveyw15/Utamana</div>
      <div style={{ fontSize: 40, color: C.muted, marginTop: 50, opacity: ease(f, 45, 58) }}>喜欢的话点个 star ⭐ 你们学日语歌最头疼什么？评论区聊聊～</div>
      <div style={{ fontSize: 26, color: C.muted, marginTop: 70, opacity: ease(f, 70, 85) }}>视频里的日语例句是自编的；应用只处理你自己导入的歌词和音乐</div>
    </Center>
  )
}

export function Vlog() {
  let at = 0
  const seq = (dur: number, node: ReactNode, key: string) => {
    const from = at
    at += dur
    return (
      <Sequence key={key} from={from} durationInFrames={dur}>
        {node}
      </Sequence>
    )
  }
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Audio src={staticFile('bgm.wav')} volume={0.35} loop />
      {INTRO.map(([d, Comp], i) => seq(d, <Comp />, `i${i}`))}
      {CLIPS.map((c, i) => seq(clipFrames(c), <ClipScene clip={c} />, `c${i}`))}
      {seq(OUTRO, <Outro />, 'outro')}
    </AbsoluteFill>
  )
}
