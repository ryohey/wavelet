import { AudioData, LoadSampleEvent, SynthEvent } from ".."
import { SynthProcessorCore } from "../processor/SynthProcessorCore"

// returns in frame unit
const getSongLength = (events: SynthEvent[]) =>
  Math.max(...events.map((e) => (e.type === "midi" ? e.delayTime : 0)))

const Sleep = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time))

export interface CancellationToken {
  cancelled: boolean
}

export interface RenderAudioOptions {
  sampleRate?: number
  onProgress?: (numFrames: number, totalFrames: number) => void
  cancel?: Readonly<CancellationToken>
  bufferSize?: number
}

export const renderAudio = async (
  samples: LoadSampleEvent[],
  events: SynthEvent[],
  options?: RenderAudioOptions
): Promise<AudioData> => {
  let currentFrame = 0
  const sampleRate = options?.sampleRate ?? 44100
  const bufSize = options?.bufferSize ?? 500

  const synth = new SynthProcessorCore(sampleRate, () => currentFrame)

  samples.forEach((e) => synth.addEvent(e))
  events.forEach((e) => synth.addEvent(e))

  const songLengthSec = getSongLength(events)
  const iterCount = Math.ceil(songLengthSec / bufSize)
  const audioBufferSize = iterCount * bufSize

  const leftData = new Float32Array(audioBufferSize)
  const rightData = new Float32Array(audioBufferSize)

  const buffer = [new Float32Array(bufSize), new Float32Array(bufSize)]

  for (let i = 0; i < iterCount; i++) {
    buffer[0].fill(0)
    buffer[1].fill(0)
    synth.process(buffer)
    const offset = i * bufSize
    leftData.set(buffer[0], offset)
    rightData.set(buffer[0], offset)
    currentFrame += bufSize
    options?.onProgress?.(offset, audioBufferSize)

    // give a chance to terminate the loop
    if (i % 1000 === 0) {
      await Sleep(0)

      if (options?.cancel?.cancelled) {
        throw new Error("renderAudio cancelled")
      }
    }
  }

  return {
    length: audioBufferSize,
    leftData: leftData.buffer,
    rightData: rightData.buffer,
    sampleRate,
  }
}
