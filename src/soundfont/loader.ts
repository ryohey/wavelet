import { Parser } from "@ryohey/sf2synth"
import { SoundFont } from "@ryohey/sf2synth/bin/parser"
import { SampleData } from "../SynthEvent"

export type SoundFontSample = SampleData<ArrayBuffer> & {
  bank: number
  instrument: number
  keyRange: [number, number]
  velRange: [number, number]
}

export const loadSoundFontSamples = async function* (
  url: string,
  ctx: AudioContext,
  onProgress: (progress: number) => void
): AsyncGenerator<SoundFontSample> {
  let progress = 0
  const data = await (await fetch(url)).arrayBuffer()
  const parsed = Parser.parse(new Uint8Array(data))
  const soundFont = new SoundFont(parsed)

  for (let i = 0; i < parsed.presetHeaders.length; i++) {
    const presetHeader = parsed.presetHeaders[i]
    const presetGenerators = soundFont.getPresetZone(i)

    for (const lastPresetGenertor of presetGenerators.filter(
      (gen) => gen.type === "instrument"
    )) {
      const presetZone = Parser.createGeneraterObject(presetGenerators)

      const instrumentID = lastPresetGenertor.value as number
      const instrumentZones = Parser.getInstrumentGenerators(
        parsed,
        instrumentID
      ).map(Parser.createGeneraterObject)

      // 最初のゾーンがsampleID を持たなければ global instrument zone
      let globalInstrumentZone: any | undefined
      const firstInstrumentZone = instrumentZones[0]
      if (firstInstrumentZone.sampleID === undefined) {
        globalInstrumentZone = instrumentZones[0]
      }

      for await (const zone of instrumentZones.filter(
        (zone) => zone.sampleID !== undefined
      )) {
        const sample = parsed.samples[zone.sampleID!]
        const sampleHeader = parsed.sampleHeaders[zone.sampleID!]

        const gen = {
          ...Parser.defaultInstrumentZone,
          ...removeUndefined(globalInstrumentZone ?? {}),
          ...removeUndefined(zone),
        }

        // add presetGenerator value
        for (const key of Object.keys(
          gen
        ) as (keyof Parser.GeneratorParams)[]) {
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

        yield {
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
        }
      }
    }

    onProgress(progress++ / parsed.presetHeaders.length)
  }
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
