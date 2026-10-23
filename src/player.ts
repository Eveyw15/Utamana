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
