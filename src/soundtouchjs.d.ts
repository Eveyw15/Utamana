declare module 'soundtouchjs' {
  export class SoundTouch {
    tempo: number
    pitchSemitones: number
  }
  export class SimpleFilter {
    constructor(source: { extract(target: Float32Array, numFrames: number, position: number): number }, pipe: SoundTouch, onEnd?: () => void)
    sourcePosition: number
  }
  export function getWebAudioNode(ctx: AudioContext, filter: SimpleFilter, onPosition?: (pos: number) => void, bufferSize?: number): ScriptProcessorNode
}
