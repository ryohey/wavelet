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
  let count = 0
  const tasks = json.flatMap((preset) => {
    return preset.samples.map(async (sample) => {
      const wavUrl = `${baseUrl}/${encodeURIComponent(
        sample.file.replace("#", "s")
      )}.wav`
      try {
        const audioData = await (await fetch(wavUrl)).arrayBuffer()
        const buffer = await decoder.decodeAudioData(audioData)
        progress++
        onProgress(progress / count)
        return {
          instrument: preset.program,
          name: preset.name,
          buffer: buffer.getChannelData(0).buffer,
          keyRange: sample.keyRange,
          pitch: sample.key,
        }
      } catch (e: any) {
        console.log(wavUrl)
        throw e
      }
    })
  })
  count = tasks.length
  return await Promise.all(tasks)
}
