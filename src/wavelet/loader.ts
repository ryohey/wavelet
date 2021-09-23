import { Decoder } from "../MIDI.js/loader"

export interface WaveletSample {
  instrument: number
  buffer: ArrayBuffer
  keyRange: [number, number]
  pitch: number
}

interface Sample {
  file: string
  key: number
  keyRange: [number, number]
}

interface Preset {
  bank: number
  name: string
  program: number
  samples: Sample[]
}

export const loadWaveletSamples = async (
  url: string,
  decoder: Decoder,
  onProgress: (progress: number) => void
): Promise<WaveletSample[]> => {
  let progress = 0
  const baseUrl = url.substring(0, url.lastIndexOf("/"))
  const json = (await (await fetch(url)).json()) as Preset[]
  const count = json.flatMap((p) => p.samples).length
  const result = []

  for await (const preset of json) {
    for await (const sample of preset.samples) {
      const wavUrl = `${baseUrl}/${encodeURIComponent(
        sample.file.replace("#", "s")
      )}.wav`
      const audioData = await (await fetch(wavUrl)).arrayBuffer()
      const buffer = await decoder.decodeAudioData(audioData)
      progress++
      onProgress(progress / count)

      result.push({
        instrument: preset.program,
        name: preset.name,
        buffer: buffer.getChannelData(0).buffer,
        keyRange: sample.keyRange,
        pitch: sample.key,
      })
    }
  }

  return result
}
