import { SimpleFilter, SoundTouch, getWebAudioNode } from 'soundtouchjs'
import { CLICK_SECONDS, clickSample, type Click, type ClickSound } from './beat.ts'
import { onsetStrength } from './align.ts'

export type TrackKey = 'original' | 'vocals' | 'instrumental'
export const TRACK_LABEL: Record<TrackKey, string> = { original: '原曲', vocals: '人声', instrumental: '伴奏' }

// Mixes the loaded tracks on the fly so every track stays sample-locked through SoundTouch.
export class MixSource {
  tracks: Partial<Record<TrackKey, AudioBuffer>> = {}
  // Vocal level 0..1, like Apple Music Sing: the backing stays at full volume whatever the tracks are.
  vocal = 1
  karaoke?: AudioBuffer // original with the centre vocal band removed, built on demand (see buildKaraoke)
  // Metronome clicks are mixed in here, before SoundTouch, so they follow speed changes in perfect sync.
  clicks: Click[] = []
  metronome = { on: false, volume: 1.5, sound: 'wood' as ClickSound } // volume at the slider's max: clicks get lost under the music otherwise
  sampleRate = 44100

  get length() {
    return Math.max(0, ...Object.values(this.tracks).map((b) => b!.length))
  }

  // Which buffers to mix and how loud, so that only the voice follows the vocal level.
  // original = backing + voice, so v * original + (1 - v) * backing = backing + v * voice.
  layers(): [AudioBuffer | undefined, number][] {
    const { original, vocals, instrumental } = this.tracks
    const v = this.vocal
    if (vocals && instrumental) return [[vocals, v], [instrumental, 1]]
    if (original && instrumental) return [[original, v], [instrumental, 1 - v]]
    if (original) return this.karaoke ? [[original, v], [this.karaoke, 1 - v]] : [[original, 1]]
    return [[vocals, v], [instrumental, 1]]
  }

  // Loop [start, end) in samples. Positions past the end map back into the loop, so SoundTouch
  // keeps streaming without a seek and the loop is gapless.
  loop: [number, number] | null = null

  wrap(p: number) {
    if (!this.loop) return p
    const [a, b] = this.loop
    return p < b ? p : a + ((p - a) % (b - a))
  }

  extract(target: Float32Array, numFrames: number, position: number) {
    let done = 0
    while (done < numFrames) {
      const real = this.wrap(position + done)
      const want = this.loop ? Math.min(numFrames - done, this.loop[1] - real) : numFrames - done
      const got = this.fill(target, done, want, real)
      done += got
      if (got < want) break // end of the song
    }
    return done
  }

  fill(target: Float32Array, offset: number, numFrames: number, position: number) {
    const n = Math.max(0, Math.min(numFrames, this.length - position))
    target.fill(0, offset * 2, (offset + n) * 2)
    const out = target.subarray(offset * 2)
    for (const [buf, g] of this.layers()) {
      if (!buf || !g) continue
      const l = buf.getChannelData(0)
      const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l
      const end = Math.min(n, buf.length - position)
      for (let i = 0; i < end; i++) {
        out[i * 2] += l[i + position] * g
        out[i * 2 + 1] += r[i + position] * g
      }
    }
    if (this.metronome.on) this.mixClicks(out, n, position)
    return n
  }

  mixClicks(target: Float32Array, n: number, position: number) {
    const len = Math.round(CLICK_SECONDS * this.sampleRate)
    // First click that can still sound inside this block.
    let lo = 0, hi = this.clicks.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.clicks[mid].pos + len <= position) lo = mid + 1
      else hi = mid
    }
    const { volume, sound } = this.metronome
    for (let c = lo; c < this.clicks.length && this.clicks[c].pos < position + n; c++) {
      const { pos, accent } = this.clicks[c]
      for (let i = Math.max(pos, position); i < Math.min(pos + len, position + n); i++) {
        const s = volume * clickSample(sound, accent, (i - pos) / this.sampleRate)
        target[(i - position) * 2] += s
        target[(i - position) * 2 + 1] += s
      }
    }
  }
}

// Album original and off-vocal files often start with different amounts of silence. Returns how many
// samples x runs late against o (negative: early), or null when they don't look like the same song.
// Coarse search on ~1 kHz block averages over +-2 s, then sample-exact around the best coarse lag.
export function findLag(o: Float32Array, x: Float32Array, rate: number): number | null {
  const score = (a: Float32Array, b: Float32Array, start: number, n: number, d: number) => {
    let ab = 0, aa = 0, bb = 0
    for (let i = start; i < start + n; i++) {
      const u = a[i], v = b[i + d] ?? 0
      ab += u * v
      aa += u * u
      bb += v * v
    }
    return ab / Math.sqrt(aa * bb + 1e-12)
  }
  const best = (a: Float32Array, b: Float32Array, start: number, n: number, from: number, to: number) => {
    let at = 0, top = -Infinity
    for (let d = from; d <= to; d++) {
      const r = score(a, b, start, n, d)
      if (r > top) (top = r), (at = d)
    }
    return [at, top]
  }
  const dec = Math.max(1, Math.round(rate / 1000))
  const down = (s: Float32Array) => {
    const out = new Float32Array(Math.floor(s.length / dec))
    for (let i = 0; i < out.length; i++) {
      let sum = 0
      for (let j = 0; j < dec; j++) sum += s[i * dec + j]
      out[i] = sum / dec
    }
    return out
  }
  const od = down(o), xd = down(x)
  const maxLag = 2 * 1000
  // 15 s of the original, from 20 s in (where both are playing) or as near as the song allows.
  const n = Math.min(15 * 1000, od.length - 2 * maxLag)
  if (n < 1000) return null
  const start = Math.min(20 * 1000, od.length - n - maxLag)
  const [coarse, r] = best(od, xd, start, n, -Math.min(maxLag, start), maxLag)
  if (r < 0.3) return null
  return best(o, x, start * dec, Math.min(3 * rate, n * dec), coarse * dec - dec, coarse * dec + dec)[0]
}

// Copy of buf moved earlier by lag samples (negative lag: later, padded with silence).
function shifted(buf: AudioBuffer, lag: number) {
  const out = new AudioBuffer({ length: Math.max(1, buf.length - lag), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    if (lag >= 0) out.copyToChannel(d.subarray(lag), c)
    else out.copyToChannel(d, c, -lag)
  }
  return out
}

const mono = (b: AudioBuffer) => {
  if (b.numberOfChannels < 2) return b.getChannelData(0)
  const l = b.getChannelData(0), r = b.getChannelData(1)
  return l.map((v, i) => (v + r[i]) / 2)
}

export class Player {
  ctx = new AudioContext()
  source = Object.assign(new MixSource(), { sampleRate: this.ctx.sampleRate })
  st = new SoundTouch()
  filter = new SimpleFilter(this.source, this.st, () => (this.pause(), this.onEnd()))
  node = getWebAudioNode(this.ctx, this.filter)
  master = this.ctx.createGain()
  playing = false
  karaokeBusy = false
  onState: () => void = () => {}
  onEnd: () => void = () => {} // the song played to its end (never fires while looping)

  get sampleRate() {
    return this.ctx.sampleRate
  }
  get duration() {
    return this.source.length / this.sampleRate
  }
  // Position fed into SoundTouch; runs ahead of what you hear while playing.
  get currentTime() {
    return this.source.wrap(this.filter.sourcePosition) / this.sampleRate
  }
  // shortcut: latency estimated as the ScriptProcessor buffer, SoundTouch's internal buffer and the
  // device output latency; measure it if taps still land early or late.
  get heardTime() {
    if (!this.playing) return this.currentTime
    const seconds = (4096 + 4096) / this.sampleRate + (this.ctx.outputLatency || 0) + this.ctx.baseLatency
    return this.source.wrap(Math.max(0, this.filter.sourcePosition - seconds * this.st.tempo * this.sampleRate)) / this.sampleRate
  }

  // Loop between two times (seconds), or null to stop looping. Jumps into the loop if outside it.
  setLoop(range: [number, number] | null) {
    const now = this.currentTime
    const loop = range && range[1] - range[0] > 0.05 ? ([Math.round(range[0] * this.sampleRate), Math.round(range[1] * this.sampleRate)] as [number, number]) : null
    if (String(loop) === String(this.source.loop)) return
    this.source.loop = loop
    // The raw feed position may be past the old loop end; restart from a real position.
    this.seek(loop && (now < range![0] || now >= range![1]) ? range![0] : now)
  }

  async load(key: TrackKey, blob: Blob | undefined) {
    if (blob) this.source.tracks[key] = await this.ctx.decodeAudioData(await blob.arrayBuffer())
    else delete this.source.tracks[key]
    if (key === 'original') this.source.karaoke = undefined
    // Line the stems up with the original, which the lyric times are tapped against.
    const { tracks } = this.source
    const stems: TrackKey[] = key === 'original' ? ['vocals', 'instrumental'] : [key]
    for (const k of stems) {
      const buf = tracks[k]
      if (!tracks.original || k === 'original' || !buf) continue
      const lag = findLag(mono(tracks.original), mono(buf), this.sampleRate)
      if (lag) tracks[k] = shifted(buf, lag)
    }
    this.onState()
  }

  // Original-only songs: subtract the centre (L+R)/2 only between 150 Hz and 7 kHz, where the voice is.
  // Bass, kick and cymbals stay, and so does everything panned to the sides.
  // shortcut: also removes centre-panned instruments in that band; real separation needs stems (UVR / MISST).
  async buildKaraoke() {
    const buf = this.source.tracks.original
    if (!buf || buf.numberOfChannels < 2 || this.source.karaoke || this.karaokeBusy) return
    this.karaokeBusy = true
    this.onState()
    const off = new OfflineAudioContext(2, buf.length, buf.sampleRate)
    const src = new AudioBufferSourceNode(off, { buffer: buf })
    const split = off.createChannelSplitter(2)
    const mid = new GainNode(off, { gain: -0.5 })
    src.connect(off.destination)
    src.connect(split)
    split.connect(mid, 0)
    split.connect(mid, 1)
    let band: AudioNode = mid
    for (const [type, frequency] of [['highpass', 150], ['highpass', 150], ['lowpass', 7000], ['lowpass', 7000]] as const)
      band = band.connect(new BiquadFilterNode(off, { type, frequency }))
    const merge = off.createChannelMerger(2)
    band.connect(merge, 0, 0)
    band.connect(merge, 0, 1)
    merge.connect(off.destination)
    src.start()
    const out = await off.startRendering()
    if (this.source.tracks.original === buf) this.source.karaoke = out
    this.karaokeBusy = false
    this.onState()
  }

  // Voice-band (200 Hz - 3.5 kHz) mono mix of the vocal stem, or of the original if there is none,
  // turned into per-frame onset strength for aligning lyric lines (see align.ts).
  async vocalOnsets() {
    const buf = this.source.tracks.vocals ?? this.source.tracks.original
    if (!buf) return null
    const off = new OfflineAudioContext(1, buf.length, buf.sampleRate)
    let node: AudioNode = new AudioBufferSourceNode(off, { buffer: buf })
    const src = node as AudioBufferSourceNode
    for (const [type, frequency] of [['highpass', 200], ['highpass', 200], ['lowpass', 3500], ['lowpass', 3500]] as const)
      node = node.connect(new BiquadFilterNode(off, { type, frequency }))
    node.connect(off.destination)
    src.start()
    return onsetStrength((await off.startRendering()).getChannelData(0), buf.sampleRate)
  }

  // Full-band mono mix of the backing (instrumental, else original), as onset strength for tempo detection.
  async beatOnsets() {
    const buf = this.source.tracks.instrumental ?? this.source.tracks.original ?? this.source.tracks.vocals
    if (!buf) return null
    const off = new OfflineAudioContext(1, buf.length, buf.sampleRate)
    const src = new AudioBufferSourceNode(off, { buffer: buf })
    src.connect(off.destination)
    src.start()
    return onsetStrength((await off.startRendering()).getChannelData(0), buf.sampleRate)
  }

  clear() {
    this.pause()
    this.source.tracks = {}
    this.seek(0)
  }

  play() {
    if (this.playing || !this.source.length) return
    if (this.currentTime >= this.duration) this.seek(0)
    void this.ctx.resume()
    this.master.connect(this.ctx.destination)
    this.node.connect(this.master)
    this.playing = true
    this.onState()
  }

  pause() {
    if (!this.playing) return
    this.node.disconnect()
    this.playing = false
    this.onState()
  }

  seek(seconds: number) {
    this.filter.sourcePosition = Math.round(Math.max(0, Math.min(seconds, this.duration)) * this.sampleRate)
    this.onState()
  }

  set tempo(v: number) {
    this.st.tempo = v
  }
  set semitones(v: number) {
    this.st.pitchSemitones = v
  }
  get volume() {
    return this.master.gain.value
  }
  set volume(v: number) {
    this.master.gain.value = v
  }
}
