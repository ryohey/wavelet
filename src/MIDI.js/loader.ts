import stringToArrayBuffer from "string-to-arraybuffer"
import { getNoteNumber } from "./keyName"

export interface MIDIJSSample {
  pitch: number
  buffer: ArrayBuffer
}

export interface MIDIJSInstrument {
  instrument: number
  samples: MIDIJSSample[]
}

export interface Decoder {
  decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer>
}

const loadSamplesFromJSONP = async (
  url: string,
  decoder: Decoder
): Promise<MIDIJSSample[]> => {
  const req = await fetch(url)
  const script = await req.text()
  const sampleTable = eval(script)
  return Promise.all(
    Object.keys(sampleTable).map(async (keyName) => {
      const pitch = getNoteNumber(keyName)
      const base64Audio = sampleTable[keyName]
      const audioData = stringToArrayBuffer(base64Audio)
      const buffer = await decoder.decodeAudioData(audioData)

      return {
        pitch,
        buffer: buffer.getChannelData(0).buffer,
      }
    })
  )
}

export const loadMIDIjsInstruments = async (
  url: string,
  decoder: Decoder,
  onProgress: (progress: number) => void
): Promise<MIDIJSInstrument[]> => {
  let progress = 0
  const names = (await (await fetch(url + "names.json")).json()) as string[]

  return await Promise.all(
    names.map(async (instrumentKey, instrument) => {
      const jsonpUrl = `${url}${instrumentKey}-mp3.js`
      const samples = await loadSamplesFromJSONP(jsonpUrl, decoder)

      progress++
      onProgress(progress / names.length)

      return {
        instrument,
        samples,
      }
    })
  )
}
