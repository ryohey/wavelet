import {
  createGeneraterObject,
  defaultInstrumentZone,
  GeneratorParams,
  getInstrumentGenerators,
  getPresetGenerators,
  parse,
} from "@ryohey/sf2parser"
import {
  LoadSampleEvent,
  SampleParameter,
  SampleParameterEvent,
  SampleRange,
} from "../SynthEvent"
import { getPresetZones } from "./getPresetZones"

export interface BufferCreator {
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ): AudioBuffer
}

const parseSamplesFromSoundFont = (data: Uint8Array) => {
  const parsed = parse(data)
  const result: { parameter: SampleParameter; range: SampleRange }[] = []
  const convertedSampleBuffers: { [key: number]: Float32Array } = {}

  function addSampleIfNeeded(sampleID: number) {
    const cached = convertedSampleBuffers[sampleID]
    if (cached) {
      return cached
    }

    const sample = parsed.samples[sampleID]
    const audioData = new Float32Array(sample.length)
    for (let i = 0; i < sample.length; i++) {
      audioData[i] = sample[i] / 32767
    }

    convertedSampleBuffers[sampleID] = audioData
    return audioData
  }

  for (let i = 0; i < parsed.presetHeaders.length; i++) {
    const presetHeader = parsed.presetHeaders[i]
    const presetGenerators = getPresetGenerators(parsed, i)

    const presetZones = getPresetZones(presetGenerators)

    for (const presetZone of presetZones.instruments) {
      const instrumentID = presetZone.instrument
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
        const sampleID = zone.sampleID!
        const sampleHeader = parsed.sampleHeaders[sampleID]

        const { velRange: defaultVelRange, ...generatorDefault } =
          defaultInstrumentZone

        const gen = {
          ...generatorDefault,
          ...removeUndefined(globalInstrumentZone ?? {}),
          ...removeUndefined(zone),
        }

        // inherit preset's velRange
        gen.velRange = gen.velRange ?? presetZone.velRange ?? defaultVelRange

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

        const audioData = addSampleIfNeeded(sampleID)

        const amplitudeEnvelope = {
          attackTime: timeCentToSec(gen.attackVolEnv),
          decayTime: timeCentToSec(gen.decayVolEnv) / 4,
          sustainLevel: 1 - gen.sustainVolEnv / 1000,
          releaseTime: timeCentToSec(gen.releaseVolEnv) / 4,
        }

        const parameter: SampleParameter = {
          sampleID: sampleID,
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
          sampleRate: sampleHeader.sampleRate,
          amplitudeEnvelope,
          scaleTuning: gen.scaleTuning / 100,
          pan: (gen.pan ?? 0) / 500,
          exclusiveClass: gen.exclusiveClass,
          volume: 1 - gen.initialAttenuation / 1000,
        }

        const range: SampleRange = {
          instrument: presetHeader.preset,
          bank: presetHeader.bank,
          keyRange: [gen.keyRange.lo, gen.keyRange.hi],
          velRange: [gen.velRange.lo, gen.velRange.hi],
        }

        result.push({ parameter, range })
      }
    }
  }

  return {
    parameters: result,
    samples: convertedSampleBuffers,
  }
}

export const getSampleEventsFromSoundFont = (
  data: Uint8Array
): {
  event: LoadSampleEvent | SampleParameterEvent
  transfer?: Transferable[]
}[] => {
  const { samples, parameters } = parseSamplesFromSoundFont(data)

  const loadSampleEvents: LoadSampleEvent[] = Object.entries(samples).map(
    ([key, value]) => ({
      type: "loadSample",
      sampleID: Number(key),
      data: value.buffer,
    })
  )

  const sampleParameterEvents: SampleParameterEvent[] = parameters.map(
    ({ parameter, range }) => ({ type: "sampleParameter", parameter, range })
  )

  return [
    ...loadSampleEvents.map((event) => ({ event, transfer: [event.data] })),
    ...sampleParameterEvents.map((event) => ({ event })),
  ]
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
