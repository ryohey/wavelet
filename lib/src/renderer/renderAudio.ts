import { AudioData, LoadSampleEvent, SynthEvent } from ".."
import { SynthProcessorCore } from "../processor/SynthProcessorCore"

const getSongLength = (events: SynthEvent[]) =>
  Math.max(...events.map((e) => (e.type === "midi" ? e.delayTime : 0))) / 1000

export const renderAudio = async (
  samples: LoadSampleEvent[],
  events: SynthEvent[],
  sampleRate: number,
  onProgress?: (numBytes: number, totalBytes: number) => void
): Promise<AudioData> => {
  let currentFrame = 0
  const synth = new SynthProcessorCore(sampleRate, () => currentFrame)

  samples.forEach((e) => synth.addEvent(e))
  events.forEach((e) => synth.addEvent(e))

  const songLengthSec = getSongLength(events)
  const bufSize = 500
  const iterCount = Math.ceil((songLengthSec * sampleRate) / bufSize)
  const audioBufferSize = iterCount * bufSize

  const leftData = new Float32Array(audioBufferSize)
  const rightData = new Float32Array(audioBufferSize)

  for (let i = 0; i < iterCount; i++) {
    const buffer = [new Float32Array(bufSize), new Float32Array(bufSize)]
    synth.process(buffer)
    const offset = i * bufSize
    leftData.set(buffer[0], offset)
    rightData.set(buffer[0], offset)
    currentFrame += bufSize
    onProgress?.(offset, audioBufferSize)
  }

  return {
    length: audioBufferSize,
    leftData: leftData.buffer,
    rightData: rightData.buffer,
    sampleRate,
  }
}
