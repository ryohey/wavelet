import { SynthEvent } from ".."
import { SynthProcessorCore } from "../processor/SynthProcessorCore"
import { BufferCreator, getSamplesFromSoundFont } from "../soundfont/loader"

const getSongLength = (events: SynthEvent[]) =>
  Math.max(...events.map((e) => (e.type === "midi" ? e.delayTime : 0))) / 1000

export const renderAudio = async (
  soundFontData: ArrayBuffer,
  context: BufferCreator,
  events: SynthEvent[],
  sampleRate: number
): Promise<AudioBuffer> => {
  const parsed = getSamplesFromSoundFont(new Uint8Array(soundFontData), context)

  let currentFrame = 0
  const synth = new SynthProcessorCore(sampleRate, () => currentFrame)

  for (const sample of parsed) {
    synth.addEvent({
      type: "loadSample",
      sample,
      bank: sample.bank,
      instrument: sample.instrument,
      keyRange: sample.keyRange,
      velRange: sample.velRange,
    })
  }

  events.forEach((e) => synth.addEvent(e))

  const songLengthSec = getSongLength(events)
  const bufSize = 500
  const iterCount = Math.ceil((songLengthSec * sampleRate) / bufSize)
  const audioBufferSize = iterCount * bufSize

  const audioBuffer = new AudioBuffer({
    sampleRate,
    length: audioBufferSize,
    numberOfChannels: 2,
  })

  for (let i = 0; i < iterCount; i++) {
    const buffer = [new Float32Array(bufSize), new Float32Array(bufSize)]
    synth.process(buffer)
    audioBuffer.copyToChannel(buffer[0], 0, i * bufSize)
    audioBuffer.copyToChannel(buffer[1], 1, i * bufSize)
    currentFrame += bufSize
  }

  return audioBuffer
}
