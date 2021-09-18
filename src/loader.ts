import stringToArrayBuffer from "string-to-arraybuffer"
import { getInstrumentKeys } from "./GMPatchNames"
import { SynthEvent } from "./SynthEvent"

const keys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

// 0: C-1 ~ 127: G9
export const getKeyName = (pitch: number) => {
  const oct = Math.floor(pitch / 12) - 1
  return `${keys[pitch % 12]}${oct}`
}

// C-1: 0
export const getPitch = (keyName: string) => {
  const octStr = keyName.replaceAll(/[A-Gb]/gm, "")
  const oct = parseInt(octStr)
  const keyStr = keyName.replace(octStr, "")
  const key = keys.indexOf(keyStr)
  return oct * 12 + key
}

export const getSampleUrl = (
  baseUrl: string,
  instrument: string,
  pitch: number
) => {
  const ext = ".mp3"
  const key = getKeyName(pitch)
  return `${baseUrl}${instrument}-mp3/${key}${ext}`
}

export const getSampleJSUrl = (baseUrl: string, instrument: string) => {
  return `${baseUrl}${instrument}-mp3.js`
}

const loadSamples = async (
  instrument: number,
  context: AudioContext,
  postMessage: (e: SynthEvent, transfer?: Transferable[]) => void
) => {
  const baseUrl = "/midi-js-soundfonts-with-drums/FluidR3_GM/"
  const instrumentKeys = [...getInstrumentKeys(), "drums"] // Use 128 to drum
  const instrumentKey = instrumentKeys[instrument]
  const url = getSampleJSUrl(baseUrl, instrumentKey)
  const req = await fetch(url)
  const script = await req.text()
  const sampleTable = eval(script)
  const step = instrument !== 128 ? 12 : 1
  for (let pitch = 21; pitch <= 107; pitch += step) {
    const keyName = getKeyName(pitch)
    const base64Audio = sampleTable[keyName]
    if (base64Audio !== undefined) {
      const audioData = stringToArrayBuffer(base64Audio)
      console.log(
        `loaded sample for ${keyName} instrument ${instrumentKey} from ${url}`
      )
      try {
        const buffer = await context.decodeAudioData(audioData)
        const data = buffer.getChannelData(0)

        const audioBuffer = data.buffer.slice(0)
        postMessage(
          {
            type: "loadSample",
            pitch,
            instrument,
            data: audioBuffer,
            keyRange: [pitch, pitch + step],
          },
          [audioBuffer] // transfer instead of copy
        )
      } catch (e) {
        console.error("failed to decode audio", e)
      }
    }
  }
}

export const loadAllSamples = async (
  context: AudioContext,
  postMessage: (e: SynthEvent) => void,
  onProgress: (progress: number, transfer?: Transferable[]) => void
) => {
  let progress = 0

  for (let instrument = 0; instrument <= 128; instrument++) {
    await loadSamples(instrument, context, postMessage)
    progress++
    onProgress(progress / 128)
  }
}
