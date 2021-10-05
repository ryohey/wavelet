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
    const lastPresetGenertor = presetGenerators[presetGenerators.length - 1]
    if (
      lastPresetGenertor.type !== "instrument" ||
      isNaN(Number(lastPresetGenertor.value))
    ) {
      throw new Error(
        "Invalid SoundFont: invalid preset generator: expect instrument"
      )
    }

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
      for (const key of Object.keys(gen) as (keyof Parser.GeneratorParams)[]) {
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
      const scaleTuning = gen.scaleTuning / 100

      const note = {
        sample,
        sampleRate: sampleHeader.sampleRate,
        sampleName: sampleHeader.sampleName,
        sampleModes: gen.sampleModes,
        playbackRate: (key: number) =>
          Math.pow(Math.pow(2, 1 / 12), (key + basePitch) * scaleTuning),
        modEnvToPitch: gen.modEnvToPitch / 100, // cent
        scaleTuning,
        start: gen.startAddrsCoarseOffset * 32768 + gen.startAddrsOffset,
        end: gen.endAddrsCoarseOffset * 32768 + gen.endAddrsOffset,
        loopStart:
          sampleHeader.loopStart +
          gen.startloopAddrsCoarseOffset * 32768 +
          gen.startloopAddrsOffset,
        loopEnd:
          sampleHeader.loopEnd +
          gen.endloopAddrsCoarseOffset * 32768 +
          gen.endloopAddrsOffset,
        keyRange: gen.keyRange,
        velRange: gen.velRange,
        initialFilterFc: gen.initialFilterFc,
        modEnvToFilterFc: gen.modEnvToFilterFc, // semitone (100 cent)
        initialFilterQ: gen.initialFilterQ,
        initialAttenuation: gen.initialAttenuation,
        freqVibLFO: gen.freqVibLFO
          ? convertTime(gen.freqVibLFO) * 8.176
          : undefined,
        pan: gen.pan,
        mute: false,
      }

      const sample2 = note.sample.subarray(0, note.sample.length + note.end)

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
        sampleStart: note.start,
        sampleEnd: note.end === 0 ? audioData.length : note.end,
        loop:
          note.sampleModes === 1 && note.loopEnd > 0
            ? {
                start: note.loopStart,
                end: note.loopEnd,
              }
            : null,
        instrument: presetHeader.preset,
        bank: presetHeader.bank,
        keyRange: [gen.keyRange.lo, gen.keyRange.hi],
        velRange: [gen.velRange.lo, gen.velRange.hi],
        sampleRate: sampleHeader.sampleRate,
        amplitudeEnvelope,
        scaleTuning,
        pan: (gen.pan ?? 0) / 500,
        exclusiveClass: gen.exclusiveClass,
      }
    }
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
