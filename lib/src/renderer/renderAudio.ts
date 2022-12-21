import { AudioData, LoadSampleEvent, SynthEvent } from ".."
import { SynthProcessorCore } from "../processor/SynthProcessorCore"

// returns in frame unit
const getSongLength = (events: SynthEvent[]) =>
  Math.max(...events.map((e) => (e.type === "midi" ? e.delayTime : 0)))

// Maximum time to wait for the note release sound to become silent
const silentTimeoutSec = 5

export interface RenderAudioOptions {
  sampleRate?: number
  onProgress?: (numFrames: number, totalFrames: number) => void
  cancel?: () => boolean
  bufferSize?: number
  waitForEventLoop?: () => Promise<void>
}

const isArrayZero = <T>(arr: ArrayLike<T>) => {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== 0) {
      return false
    }
  }
  return true
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

  const songLengthFrame = getSongLength(events)
  const iterCount = Math.ceil(songLengthFrame / bufSize)
  const additionalIterCount = Math.ceil(
    (silentTimeoutSec * sampleRate) / bufSize
  )
  const allIterCount = iterCount + additionalIterCount
  const audioBufferSize = allIterCount * bufSize

  const leftData = new Float32Array(audioBufferSize)
  const rightData = new Float32Array(audioBufferSize)

  const buffer = [new Float32Array(bufSize), new Float32Array(bufSize)]

  for (let i = 0; i < allIterCount; i++) {
    buffer[0].fill(0)
    buffer[1].fill(0)
    synth.process(buffer)
    const offset = i * bufSize
    leftData.set(buffer[0], offset)
    rightData.set(buffer[1], offset)
    currentFrame += bufSize

    // Wait for silence after playback is complete.
    if (i > iterCount && isArrayZero(buffer[0]) && isArrayZero(buffer[1])) {
      console.log(`early break ${i} in ${iterCount + additionalIterCount}`)
      break
    }

    // give a chance to terminate the loop or update progress
    if (i % 1000 === 0) {
      await options?.waitForEventLoop?.()

      options?.onProgress?.(offset, audioBufferSize)

      if (options?.cancel?.()) {
        throw new Error("renderAudio cancelled")
      }
    }
  }

  // slice() to delete silent parts
  const trimmedLeft = leftData.slice(0, currentFrame)
  const trimmedRight = rightData.slice(0, currentFrame)

  return {
    length: trimmedLeft.length,
    leftData: trimmedLeft.buffer,
    rightData: trimmedRight.buffer,
    sampleRate,
  }
}
