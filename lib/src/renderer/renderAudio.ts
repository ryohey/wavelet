import { AudioData, LoadSampleEvent, SynthEvent } from ".."
import { SynthProcessorCore } from "../processor/SynthProcessorCore"

// returns in frame unit
const getSongLength = (events: SynthEvent[]) =>
  Math.max(...events.map((e) => (e.type === "midi" ? e.delayTime : 0)))

export interface RenderAudioOptions {
  sampleRate?: number
  onProgress?: (numFrames: number, totalFrames: number) => void
  cancel?: () => boolean
  bufferSize?: number
  waitForEventLoop?: () => Promise<void>
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

    // give a chance to terminate the loop or update progress
    if (i % 1000 === 0) {
      await options?.waitForEventLoop?.()

      options?.onProgress?.(offset, audioBufferSize)

      if (options?.cancel?.()) {
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
