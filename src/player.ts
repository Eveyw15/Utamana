import { SimpleFilter, SoundTouch, getWebAudioNode } from 'soundtouchjs'

export type TrackKey = 'original' | 'vocals' | 'instrumental'
export const TRACK_LABEL: Record<TrackKey, string> = { original: '原曲', vocals: '人声', instrumental: '伴奏' }

// Mixes the loaded tracks on the fly so every track stays sample-locked through SoundTouch.
class MixSource {
  tracks: Partial<Record<TrackKey, AudioBuffer>> = {}
  gains: Record<TrackKey, number> = { original: 1, vocals: 1, instrumental: 1 }
  karaoke = false // naive vocal removal on the original: L - R cancels centre-panned voice

  get length() {
    return Math.max(0, ...Object.values(this.tracks).map((b) => b!.length))
  }

  extract(target: Float32Array, numFrames: number, position: number) {
    const n = Math.max(0, Math.min(numFrames, this.length - position))
    target.fill(0, 0, n * 2)
    for (const [key, buf] of Object.entries(this.tracks) as [TrackKey, AudioBuffer][]) {
      const g = this.gains[key]
      if (!g) continue
      const l = buf.getChannelData(0)
      const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l
      const end = Math.min(n, buf.length - position)
      const removeVoice = key === 'original' && this.karaoke && buf.numberOfChannels > 1
      for (let i = 0; i < end; i++) {
        const a = l[i + position], b = r[i + position]
        if (removeVoice) {
          const s = (a - b) * g
          target[i * 2] += s
          target[i * 2 + 1] += s
        } else {
          target[i * 2] += a * g
          target[i * 2 + 1] += b * g
        }
      }
    }
    return n
  }
}

export class Player {
  ctx = new AudioContext()
  source = new MixSource()
  st = new SoundTouch()
  filter = new SimpleFilter(this.source, this.st, () => this.pause())
  node = getWebAudioNode(this.ctx, this.filter)
  playing = false
  onState: () => void = () => {}

  get sampleRate() {
    return this.ctx.sampleRate
  }
  get duration() {
    return this.source.length / this.sampleRate
  }
  // shortcut: this is the position fed into SoundTouch, about 0.1-0.2 s ahead of what you hear.
  get currentTime() {
    return this.filter.sourcePosition / this.sampleRate
  }

  async load(key: TrackKey, blob: Blob | undefined) {
    if (blob) this.source.tracks[key] = await this.ctx.decodeAudioData(await blob.arrayBuffer())
    else delete this.source.tracks[key]
    this.onState()
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
    this.node.connect(this.ctx.destination)
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
}
