import { Decoder } from "../MIDI.js/loader"
import { SampleData } from "../SynthEvent"
import { parseText } from "./parseText"

export type WaveletSample = SampleData<ArrayBuffer> & {
  bank: number
  instrument: number
  keyRange: [number, number]
}

interface Sample {
  file: string
  key: number
  sampleRate: number
  sampleFineTune: number
  presetFineTune: number
  keyRange: [number, number]
  startAddrsOffset: number // second
  endAddrsOffset: number // second
  startLoopAddrsOffset: number // second
  endLoopAddrsOffset: number // second

  /*
  0 indicates a sound reproduced with no loop,
  1 indicates a sound which loops continuously,
  2 is unused but should be interpreted as indicating no loop, and
  3 indicates a sound which loops for the duration of key depression then proceeds to play the remainder of the sample.
  */
  sampleModes: number
}

interface Preset {
  bank: number
  name: string
  program: number
  samples: Sample[]
}

const getPresets = (json: any): Preset[] => {
  return Object.keys(json["Presets"])
    .map((presetName): Preset => {
      const preset = json.Presets[presetName]
      const samples = Object.keys(preset.Instruments).flatMap(
        (instrumentName): Sample[] => {
          const instrument = json.Instruments[instrumentName]
          return instrument.Samples.map((sample: any): Sample => {
            // https://pjb.com.au/midi/sfspec21.html#g4
            const sampleName = sample.Sample
            const sampleDef = json.Samples[sampleName]
            const sampleRate = sampleDef.SampleRate
            const startAddrsOffset =
              (sample.Z_startAddrsOffset ?? 0) +
              (sample.Z_startAddrsCoarseOffset ?? 0) * 32768
            const endAddrsOffset =
              (sample.Z_endAddrsOffset ?? 0) +
              (sample.Z_endAddrsCoarseOffset ?? 0) * 32768
            const startLoopAddrsOffset =
              (sample.Z_startLoopAddrsOffset ?? 0) +
              (sample.Z_startLoopAddrsCoarseOffset ?? 0) * 32768
            const endLoopAddrsOffset =
              (sample.Z_endLoopAddrsOffset ?? 0) +
              (sample.Z_endLoopAddrsCoarseOffset ?? 0) * 32768
            return {
              file: sampleName,
              sampleRate,
              key: sample.Z_overridingRootKey ?? sampleDef.Key,
              keyRange: [sample.Z_LowKey, sample.Z_HighKey],
              sampleFineTune: sampleDef.FineTune ?? 0,
              presetFineTune: sample.Z_fineTune ?? 0,
              startAddrsOffset: startAddrsOffset,
              endAddrsOffset: endAddrsOffset,
              startLoopAddrsOffset: startLoopAddrsOffset,
              endLoopAddrsOffset: endLoopAddrsOffset,
              sampleModes: sample.Z_sampleModes ?? 0,
              // ループ時間やアタックタイムなどをちゃんと見たほうがいいかも
              // Z_decayVolEnv とか
              // https://www.utsbox.com/?p=2390
            }
          })
        }
      )

      return {
        name: presetName,
        bank: preset.Bank,
        program: preset.Program,
        samples,
      }
    })
    .filter((e) => e.bank === 0 && e.program === 2)
}

const convertUint16ToInt16 = (num: number) => {
  const arr = new Int16Array(1)
  const view = new DataView(arr.buffer)
  view.setUint16(0, num)
  return view.getInt16(0)
}

export const loadWaveletSamples = async function* (
  url: string,
  decoder: Decoder,
  onProgress: (progress: number) => void
): AsyncGenerator<WaveletSample> {
  let progress = 0
  const baseUrl = url.substring(0, url.lastIndexOf("/"))
  const text = await (await fetch(url)).text()
  const json = getPresets(parseText(text))
  const count = json.flatMap((p) => p.samples).length

  for await (const preset of json) {
    for await (const sample of preset.samples) {
      const wavUrl = `${baseUrl}/${encodeURIComponent(
        sample.file.replace("#", "s")
      )}.wav`
      const audioData = await (await fetch(wavUrl)).arrayBuffer()
      const buffer = await decoder.decodeAudioData(audioData)
      progress++
      onProgress(progress / count)

      yield {
        bank: preset.bank,
        instrument: preset.program,
        buffer: buffer.getChannelData(0).buffer,
        keyRange: sample.keyRange,
        pitch:
          sample.key -
          convertUint16ToInt16(sample.sampleFineTune) / 100 -
          convertUint16ToInt16(sample.presetFineTune) / 100,
        name: sample.file,
        sampleStart: sample.startAddrsOffset,
        sampleEnd:
          sample.endAddrsOffset === 0 ? buffer.length : sample.endAddrsOffset,
        loop:
          sample.sampleModes === 1 && sample.endLoopAddrsOffset > 0
            ? {
                start: sample.startLoopAddrsOffset,
                end: sample.endLoopAddrsOffset,
              }
            : null,
        sampleRate: buffer.sampleRate,
        scaleTuning: 1,
        amplitudeEnvelope: {
          attackTime: 0,
          decayTime: 0,
          sustainLevel: 1,
          releaseTime: 0,
        },
      }
    }
  }
}
