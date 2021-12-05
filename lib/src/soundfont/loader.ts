import {
  createGeneraterObject,
  defaultInstrumentZone,
  GeneratorParams,
  getInstrumentGenerators,
  getPresetGenerators,
  parse,
} from "@ryohey/sf2parser"
import { SampleData } from "../SynthEvent"
import { sampleToSynthEvent } from "./sampleToSynthEvent"

export type SoundFontSample = SampleData<ArrayBuffer> & {
  bank: number
  instrument: number
  keyRange: [number, number]
  velRange: [number, number]
}

export interface BufferCreator {
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ): AudioBuffer
}

export const getSamplesFromSoundFont = (
  data: Uint8Array,
  ctx: BufferCreator
) => {
  const parsed = parse(data)
  const result: SoundFontSample[] = []

  for (let i = 0; i < parsed.presetHeaders.length; i++) {
    const presetHeader = parsed.presetHeaders[i]
    const presetGenerators = getPresetGenerators(parsed, i)

    for (const lastPresetGenertor of presetGenerators.filter(
      (gen) => gen.type === "instrument"
    )) {
      const presetZone = createGeneraterObject(presetGenerators)

      const instrumentID = lastPresetGenertor.value as number
      const instrumentZones = getInstrumentGenerators(parsed, instrumentID).map(
        createGeneraterObject
      )

      // 最初のゾーンがsampleID を持たなければ global instrument zone
      let globalInstrumentZone: any | undefined
      const firstInstrumentZone = instrumentZones[0]
      if (firstInstrumentZone.sampleID === undefined) {
        globalInstrumentZone = instrumentZones[0]
      }

      for (const zone of instrumentZones.filter(
        (zone) => zone.sampleID !== undefined
      )) {
        const sample = parsed.samples[zone.sampleID!]
        const sampleHeader = parsed.sampleHeaders[zone.sampleID!]

        const gen = {
          ...defaultInstrumentZone,
          ...removeUndefined(globalInstrumentZone ?? {}),
          ...removeUndefined(zone),
        }

        // add presetGenerator value
        for (const key of Object.keys(gen) as (keyof GeneratorParams)[]) {
          if (
            key in presetZone &&
            typeof gen[key] === "number" &&
            typeof presetZone[key] === "number"
          ) {
            gen[key] += presetZone[key]
          }
        }

        const tune = gen.coarseTune + gen.fineTune / 100

        const basePitch =
          tune +
          sampleHeader.pitchCorrection / 100 -
          (gen.overridingRootKey ?? sampleHeader.originalPitch)

        const sampleStart =
          gen.startAddrsCoarseOffset * 32768 + gen.startAddrsOffset

        const sampleEnd = gen.endAddrsCoarseOffset * 32768 + gen.endAddrsOffset

        const loopStart =
          sampleHeader.loopStart +
          gen.startloopAddrsCoarseOffset * 32768 +
          gen.startloopAddrsOffset

        const loopEnd =
          sampleHeader.loopEnd +
          gen.endloopAddrsCoarseOffset * 32768 +
          gen.endloopAddrsOffset

        const sample2 = sample.subarray(0, sample.length + sampleEnd)

        const audioBuffer = ctx.createBuffer(
          1,
          sample2.length,
          sampleHeader.sampleRate
        )
        const audioData = audioBuffer.getChannelData(0)
        sample2.forEach((v, i) => {
          audioData[i] = v / 32767
        })

        const amplitudeEnvelope = {
          attackTime: timeCentToSec(gen.attackVolEnv),
          decayTime: timeCentToSec(gen.decayVolEnv) / 4,
          sustainLevel: 1 - gen.sustainVolEnv / 1000,
          releaseTime: timeCentToSec(gen.releaseVolEnv) / 4,
        }

        result.push({
          buffer: audioData.buffer,
          pitch: -basePitch,
          name: sampleHeader.sampleName,
          sampleStart,
          sampleEnd: sampleEnd === 0 ? audioData.length : sampleEnd,
          loop:
            gen.sampleModes === 1 && loopEnd > 0
              ? {
                  start: loopStart,
                  end: loopEnd,
                }
              : null,
          instrument: presetHeader.preset,
          bank: presetHeader.bank,
          keyRange: [gen.keyRange.lo, gen.keyRange.hi],
          velRange: [gen.velRange.lo, gen.velRange.hi],
          sampleRate: sampleHeader.sampleRate,
          amplitudeEnvelope,
          scaleTuning: gen.scaleTuning / 100,
          pan: (gen.pan ?? 0) / 500,
          exclusiveClass: gen.exclusiveClass,
          volume: 1 - gen.initialAttenuation / 1000,
        })
      }
    }
  }

  return result.map(sampleToSynthEvent)
}

function convertTime(value: number) {
  return Math.pow(2, value / 1200)
}

function timeCentToSec(value: number) {
  if (value <= -32768) {
    return 0
  }

  if (value < -12000) {
    value = -12000
  }

  if (value > 8000) {
    value = 8000
  }

  return convertTime(value)
}

function removeUndefined<T>(obj: T) {
  const result: Partial<T> = {}
  for (let key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key]
    }
  }
  return result
}
