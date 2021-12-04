import { MidiFile } from "midifile-ts"
import { SynthProcessorCore } from "../processor/SynthProcessorCore"
import { BufferCreator, getSamplesFromSoundFont } from "../soundfont/loader"
import { midiToSynthEvents } from "./midiToSynthEvents"

export const renderAudio = async (
  context: BufferCreator,
  midi: MidiFile,
  sampleRate: number
): Promise<AudioBuffer> => {
  const url = "soundfonts/A320U.sf2"

  const soundFontData = await (await fetch(url)).arrayBuffer()
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

  const events = midiToSynthEvents(midi, sampleRate)
  events.forEach((e) => synth.addEvent(e))

  const songLengthSec = 5
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
