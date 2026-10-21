import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, JP, ZH } from './theme'

// 120 BPM soundtrack: one beat = 15 frames, one 4/4 bar = 60 frames. Scene cuts land on bar lines.
const BEAT = 15
const SCENES: [number, () => ReactNode][] = [
  [120, Intro],
  [120, Pain],
  [180, Furigana],
  [180, Sync],
  [120, Speed],
  [120, Stems],
  [180, Metronome],
  [120, Print],
  [120, Library],
  [150, Outro],
]
export const TOTAL = SCENES.reduce((s, [d]) => s + d, 0)

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp)

function usePop(delay = 0) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 140 } })
}

// Fade + slight lift in and out around every scene.
function Scene({ dur, children }: { dur: number; children: ReactNode }) {
  const f = useCurrentFrame()
  const o = Math.min(ease(f, 0, 10), 1 - ease(f, dur - 10, dur))
  return (
    <AbsoluteFill style={{ opacity: o, transform: `translateY(${(1 - ease(f, 0, 14)) * 24}px)` }}>{children}</AbsoluteFill>
  )
}

function Background() {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 900,
            height: 900,
            borderRadius: '50%',
            filter: 'blur(80px)',
            opacity: 0.55,
            background: i === 1 ? '#dfe3f7' : C.soft,
            left: [-200, 1200, 500][i] + Math.sin(f / 90 + i) * 60,
            top: [-300, 300, 700][i] + Math.cos(f / 110 + i * 2) * 50,
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

const Caption = ({ title, sub, delay = 0 }: { title: string; sub?: string; delay?: number }) => {
  const p = usePop(delay)
  return (
    <div style={{ position: 'absolute', left: 140, top: 110, fontFamily: ZH, opacity: p, transform: `translateX(${(1 - p) * -40}px)` }}>
      <div style={{ fontSize: 68, fontWeight: 700, color: C.fg, letterSpacing: 2 }}>{title}</div>
      {sub && <div style={{ fontSize: 32, color: C.muted, marginTop: 14 }}>{sub}</div>}
    </div>
  )
}

const Card = ({ style, children }: { style?: CSSProperties; children: ReactNode }) => (
  <div style={{ background: C.paper, borderRadius: 36, boxShadow: C.shadow, ...style }}>{children}</div>
)

// Original sample lines written for this video (not song lyrics).
const SAMPLE: { jp: [string, string?][]; romaji: string; zh: string }[] = [
  { jp: [['朝', 'あさ'], ['の'], ['光', 'ひかり'], ['が'], ['窓', 'まど'], ['をたたく']], romaji: 'asa no hikari ga mado o tataku', zh: '晨光轻敲着窗' },
  { jp: [['小', 'ちい'], ['さな'], ['声', 'こえ'], ['で'], ['歌', 'うた'], ['ってみる']], romaji: 'chiisana koe de utatte miru', zh: '小声地试着唱' },
  { jp: [['明日', 'あした'], ['の'], ['空', 'そら'], ['を'], ['見上', 'みあ'], ['げて']], romaji: 'ashita no sora o miagete', zh: '抬头望向明天的天空' },
  { jp: [['君', 'きみ'], ['の'], ['名前', 'なまえ'], ['を'], ['呼', 'よ'], ['んでいる']], romaji: 'kimi no namae o yonde iru', zh: '呼唤着你的名字' },
]

function RubyLine({ segs, size, kanaShow = () => 1 }: { segs: [string, string?][]; size: number; kanaShow?: (i: number) => number }) {
  let k = -1
  return (
    <span style={{ fontFamily: JP, fontSize: size, fontWeight: 500, color: C.fg }}>
      {segs.map(([t, r], i) => {
        if (!r) return <span key={i}>{t}</span>
        const o = kanaShow(++k)
        return (
          <ruby key={i}>
            {t}
            <rt style={{ fontSize: size * 0.38, color: C.accent, opacity: o, transform: `translateY(${(1 - o) * 10}px)`, display: 'ruby-text' }}>{r}</rt>
          </ruby>
        )
      })}
    </span>
  )
}

function Intro() {
  const f = useCurrentFrame()
  const letters = 'うたまな'.split('')
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: JP }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {letters.map((l, i) => {
          const p = usePop(6 + i * 5)
          return (
            <span key={i} style={{ fontSize: 210, fontWeight: 700, color: C.accent, transform: `translateY(${(1 - p) * 80}px) scale(${0.6 + 0.4 * p})`, opacity: p }}>
              {l}
            </span>
          )
        })}
      </div>
      <div style={{ fontSize: 44, letterSpacing: 18, color: C.muted, opacity: ease(f, 30, 45), marginTop: 6 }}>UTAMANA</div>
      <div style={{ fontFamily: ZH, fontSize: 46, color: C.fg, marginTop: 50, opacity: ease(f, 50, 65) }}>学日语歌，从读准每一个字开始</div>
    </AbsoluteFill>
  )
}

function Pain() {
  const f = useCurrentFrame()
  const items = ['汉字不会读', '节奏跟不上', '变拍子数不清']
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: ZH }}>
      <div style={{ fontSize: 56, color: C.fg, marginBottom: 60, opacity: ease(f, 0, 12) }}>想唱日语歌，却总卡在这里？</div>
      <div style={{ display: 'flex', gap: 40 }}>
        {items.map((t, i) => {
          const p = usePop(10 + i * 10)
          const struck = ease(f, 70 + i * 4, 80 + i * 4)
          return (
            <Card key={t} style={{ padding: '36px 56px', fontSize: 52, color: C.fg, transform: `scale(${p})`, position: 'relative' }}>
              {t}
              <div style={{ position: 'absolute', left: 40, right: 40, top: '50%', height: 6, borderRadius: 3, background: C.accent, transformOrigin: 'left', transform: `scaleX(${struck})` }} />
            </Card>
          )
        })}
      </div>
      <div style={{ fontSize: 60, fontWeight: 700, color: C.accent, marginTop: 70, opacity: ease(f, 88, 100) }}>
        交给 <span style={{ fontFamily: JP }}>うたまな</span>
      </div>
    </AbsoluteFill>
  )
}

function Furigana() {
  const f = useCurrentFrame()
  const line = SAMPLE[2]
  const romaji = line.romaji.slice(0, Math.floor(interpolate(f, [80, 120], [0, line.romaji.length], clamp)))
  return (
    <AbsoluteFill>
      <Caption title="自动注音" sub="假名 · 罗马音 · 翻译，粘贴歌词就有" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 120 }}>
        <Card style={{ padding: '70px 110px', minWidth: 1100 }}>
          <div style={{ lineHeight: 2.3 }}>
            <RubyLine segs={line.jp} size={104} kanaShow={(i) => ease(f, 25 + i * 12, 37 + i * 12)} />
          </div>
          <div style={{ fontFamily: ZH, fontSize: 40, color: C.muted, letterSpacing: 1, minHeight: 56 }}>{romaji}</div>
          <div style={{ fontFamily: ZH, fontSize: 44, color: C.indigo, marginTop: 14, opacity: ease(f, 125, 140) }}>{line.zh}</div>
        </Card>
        <div style={{ fontFamily: ZH, fontSize: 30, color: C.muted, marginTop: 34, opacity: ease(f, 140, 155) }}>读音不对？双击汉字直接改</div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function Transport({ progress, playing = true }: { progress: number; playing?: boolean }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: C.paper, boxShadow: '0 -8px 30px rgba(60,40,30,.08)', display: 'flex', alignItems: 'center', gap: 36, padding: '0 140px', fontFamily: ZH }}>
      <div style={{ background: C.accent, color: '#fff', borderRadius: 999, padding: '12px 38px', fontSize: 30, fontWeight: 700 }}>{playing ? '暂停' : '播放'}</div>
      <div style={{ flex: 1, height: 10, borderRadius: 5, background: C.line }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 5, background: C.accent }} />
      </div>
      <div style={{ fontSize: 26, color: C.muted }}>空格 播放 / 暂停</div>
    </div>
  )
}

function Sync() {
  const f = useCurrentFrame()
  const active = Math.min(3, Math.floor(f / 40))
  return (
    <AbsoluteFill>
      <Caption title="逐句同步" sub="跟着高亮唱，点哪句就从哪句开始" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 290 }}>
        <Card style={{ padding: '30px 70px', width: 1150 }}>
          {SAMPLE.map((l, i) => (
            <div
              key={i}
              style={{
                padding: '8px 26px',
                borderRadius: 18,
                borderLeft: `6px solid ${i === active ? C.accent : 'transparent'}`,
                background: i === active ? C.soft : 'transparent',
                opacity: i === active ? 1 : 0.45,
                transition: 'none',
              }}
            >
              <div style={{ lineHeight: 2 }}>
                <RubyLine segs={l.jp} size={44} />
              </div>
              <div style={{ fontFamily: ZH, fontSize: 22, color: C.muted, marginTop: -6 }}>{l.romaji}</div>
            </div>
          ))}
        </Card>
      </AbsoluteFill>
      <Transport progress={interpolate(f, [0, 180], [0.18, 0.42])} />
    </AbsoluteFill>
  )
}

function Slider({ label, value, pct, color = C.accent }: { label: string; value: string; pct: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 34, fontFamily: ZH, fontSize: 40, margin: '34px 0' }}>
      <div style={{ width: 150, color: C.fg, fontWeight: 700 }}>{label}</div>
      <div style={{ width: 620, height: 14, borderRadius: 7, background: C.line, position: 'relative' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 7, background: color }} />
        <div style={{ position: 'absolute', left: `calc(${pct * 100}% - 20px)`, top: -13, width: 40, height: 40, borderRadius: 20, background: '#fff', border: `5px solid ${color}` }} />
      </div>
      <div style={{ width: 260, color, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function Speed() {
  const f = useCurrentFrame()
  const bpm = Math.round(interpolate(f, [20, 70], [165, 132], clamp))
  const key = Math.round(interpolate(f, [60, 95], [0, -2], clamp))
  return (
    <AbsoluteFill>
      <Caption title="慢下来，降个调" sub="按 BPM 变速不变调，Key 升降 ±6" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 120 }}>
        <Card style={{ padding: '40px 80px' }}>
          <Slider label="速度" value={`♩ = ${bpm}`} pct={interpolate(bpm, [82, 248], [0, 1])} />
          <Slider label="Key" value={key > 0 ? `+${key}` : `${key}`} pct={(key + 6) / 12} color={C.indigo} />
        </Card>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function Stems() {
  const f = useCurrentFrame()
  const vocal = interpolate(f, [30, 70], [1, 0], clamp)
  const bars = (seed: number, gain: number) =>
    Array.from({ length: 40 }, (_, i) => (
      <div key={i} style={{ width: 10, borderRadius: 5, background: seed ? C.indigo : C.accent, opacity: 0.25 + 0.75 * gain, height: 8 + gain * 60 * Math.abs(Math.sin(i * 1.7 + seed + f / 6)) }} />
    ))
  return (
    <AbsoluteFill>
      <Caption title="人声一拉到底，就是伴奏" sub="导入 MISST / UVR 分离好的人声和伴奏" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 140 }}>
        <Card style={{ padding: '40px 70px', fontFamily: ZH }}>
          {[
            ['人声', vocal, 0],
            ['伴奏', 1, 1],
          ].map(([name, g, seed]) => (
            <div key={name as string} style={{ display: 'flex', alignItems: 'center', gap: 40, margin: '30px 0' }}>
              <div style={{ width: 110, fontSize: 40, fontWeight: 700 }}>{name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 80, width: 640 }}>{bars(seed as number, g as number)}</div>
              <div style={{ width: 120, fontSize: 38, color: C.muted }}>{Math.round((g as number) * 100)}%</div>
            </div>
          ))}
        </Card>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function Metronome() {
  const f = useCurrentFrame()
  // Show a few meters in turn; dots pulse on every beat, the first dot of each bar is the accent.
  const meters = [
    [4, 4],
    [5, 4],
    [6, 4],
    [7, 8],
  ]
  const idx = Math.min(3, Math.floor(f / 45))
  const [num, den] = meters[idx]
  const local = f - idx * 45
  const beat = Math.floor(local / (den === 8 ? BEAT / 2 : BEAT * 0.75)) % num
  return (
    <AbsoluteFill>
      <Caption title="变拍子也能数清" sub="点按测速 · 分段设置拍号 · 新段自动对齐拍点" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 140, flexDirection: 'row', gap: 120 }}>
        <div style={{ fontFamily: JP, fontWeight: 700, color: C.accent, textAlign: 'center', lineHeight: 1 }}>
          <div style={{ fontSize: 210 }}>{num}</div>
          <div style={{ height: 8, background: C.fg, opacity: 0.6, margin: '6px 0', borderRadius: 4 }} />
          <div style={{ fontSize: 210, color: C.fg }}>{den}</div>
        </div>
        <Card style={{ padding: 50, display: 'grid', gridTemplateColumns: 'repeat(4, 90px)', gap: 34 }}>
          {Array.from({ length: num }, (_, i) => {
            const on = i === beat
            return (
              <div
                key={i}
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 45,
                  background: on ? (i === 0 ? C.accent : C.indigo) : C.line,
                  transform: `scale(${on ? 1.15 : 1})`,
                  boxShadow: on ? `0 0 40px ${i === 0 ? C.accent : C.indigo}` : 'none',
                }}
              />
            )
          })}
        </Card>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function Print() {
  const f = useCurrentFrame()
  const p = usePop(8)
  return (
    <AbsoluteFill>
      <Caption title="打印成歌词本" sub="假名、罗马音、翻译都能带上，另存为 PDF" />
      <div
        style={{
          position: 'absolute',
          left: 1080,
          top: 140 + (1 - p) * 500,
          width: 640,
          height: 860,
          background: '#fff',
          boxShadow: C.shadow,
          borderRadius: 10,
          padding: '60px 56px',
          transform: `rotate(${-4 + f * 0.02}deg)`,
        }}
      >
        <div style={{ fontFamily: JP, fontSize: 34, textAlign: 'center', marginBottom: 30 }}>練習曲</div>
        {SAMPLE.map((l, i) => (
          <div key={i} style={{ marginBottom: 22 }}>
            <div style={{ lineHeight: 2 }}>
              <RubyLine segs={l.jp} size={30} />
            </div>
            <div style={{ fontFamily: ZH, fontSize: 15, color: C.muted }}>{l.romaji}</div>
            <div style={{ fontFamily: ZH, fontSize: 17, color: C.indigo }}>{l.zh}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  )
}

function Library() {
  const titles = ['練習曲 01', '練習曲 02', '練習曲 03', '練習曲 04', '練習曲 05']
  const f = useCurrentFrame()
  return (
    <AbsoluteFill>
      <Caption title="曲库 + 云同步" sub="换电脑、清缓存，登录就回来" />
      <div style={{ position: 'absolute', left: 140, top: 380, display: 'grid', gridTemplateColumns: 'repeat(3, 420px)', gap: 36 }}>
        {titles.map((t, i) => {
          const p = usePop(8 + i * 5)
          return (
            <Card key={t} style={{ padding: 32, height: 220, transform: `scale(${p})`, fontFamily: ZH }}>
              <div style={{ fontFamily: JP, fontSize: 36, fontWeight: 700 }}>{t}</div>
              <div style={{ fontSize: 22, color: C.muted, marginTop: 6 }}>{['已打点', '有翻译', '3 条音轨', '变拍子', '已打点'][i]}</div>
              <div style={{ marginTop: 34, display: 'inline-block', fontSize: 20, padding: '4px 16px', borderRadius: 999, background: C.soft, color: C.accent }}>{12 + i * 7} 句</div>
            </Card>
          )
        })}
      </div>
      <div style={{ position: 'absolute', right: 140, top: 130, fontFamily: ZH, fontSize: 34, color: C.indigo, opacity: ease(f, 50, 65), background: C.paper, borderRadius: 999, padding: '14px 34px', boxShadow: C.shadow }}>
        ☁ 已同步
      </div>
    </AbsoluteFill>
  )
}

function Outro() {
  const f = useCurrentFrame()
  const p = usePop(4)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: ZH }}>
      <div style={{ fontFamily: JP, fontSize: 170, fontWeight: 700, color: C.accent, transform: `scale(${p})` }}>うたまな</div>
      <div style={{ fontSize: 46, color: C.fg, marginTop: 10, opacity: ease(f, 20, 35) }}>开源 · 免费 · 本地运行</div>
      <div style={{ fontSize: 40, color: C.indigo, marginTop: 40, opacity: ease(f, 35, 50), fontFamily: 'monospace' }}>github.com/Eveyw15/Utamana</div>
      <div style={{ fontSize: 26, color: C.muted, marginTop: 60, opacity: ease(f, 50, 65) }}>只处理你自己导入的歌词和音乐</div>
    </AbsoluteFill>
  )
}

export function Promo() {
  let at = 0
  return (
    <AbsoluteFill>
      <Background />
      <Audio src={staticFile('bgm.wav')} />
      {SCENES.map(([dur, Comp], i) => {
        const from = at
        at += dur
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Scene dur={dur}>
              <Comp />
            </Scene>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
