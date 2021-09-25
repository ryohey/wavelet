import { Decoder } from "../MIDI.js/loader"
import { parseText } from "./parseText"

export interface WaveletSample {
  bank: number
  instrument: number
  buffer: ArrayBuffer
  keyRange: [number, number]
  pitch: number
  name: string
}

interface Sample {
  file: string
  key: number
  sampleFineTune: number
  presetFineTune: number
  keyRange: [number, number]
}

interface Preset {
  bank: number
  name: string
  program: number
  samples: Sample[]
}

const getPresets = (json: any): Preset[] => {
  return Object.keys(json["Presets"]).map((presetName): Preset => {
    const preset = json.Presets[presetName]
    const samples = Object.keys(preset.Instruments).flatMap(
      (instrumentName): Sample[] => {
        const instrument = json.Instruments[instrumentName]
        return instrument.Samples.map((sample: any): Sample => {
          const sampleName = sample.Sample
          const sampleDef = json.Samples[sampleName]
          return {
            file: sampleName,
            key: sample.Z_overridingRootKey ?? sampleDef.Key,
            keyRange: [sample.Z_LowKey, sample.Z_HighKey],
            sampleFineTune: sampleDef.FineTune ?? 0,
            presetFineTune: sample.Z_fineTune ?? 0,
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
      }
    }
  }
}
