import { Parser } from "@ryohey/sf2synth"
import { SoundFont } from "@ryohey/sf2synth/bin/parser"
import { RangeValue } from "@ryohey/sf2synth/bin/parser/Structs"
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
    const instrumentID = lastPresetGenertor.value as number
    const instrumentZones = soundFont
      .getInstrumentZoneIndexes(instrumentID)
      .map((i) => soundFont.getInstrumentZone(i))

    // 最初のゾーンがsampleID を持たなければ global instrument zone
    let globalInstrumentZone: any | undefined
    const firstInstrumentZone = instrumentZones[0]
    if (firstInstrumentZone.sampleID === undefined) {
      globalInstrumentZone = instrumentZones[0]
    }

    if (presetHeader.bank === 0 && presetHeader.preset === 5) {
      debugger
    }

    for await (const zone of instrumentZones.filter(
      (zone) => zone.sampleID !== undefined
    )) {
      const sample = parsed.samples[zone.sampleID!]
      const sampleHeader = parsed.sampleHeaders[zone.sampleID!]

      const gen = {
        ...defaultInstrumentZone,
        ...removeUndefined(globalInstrumentZone ?? {}),
        ...removeUndefined(zone),
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
        volDelay: convertTime(gen.volDelay),
        volAttack: convertTime(gen.volAttack),
        volHold: convertTime(gen.volHold),
        volDecay: convertTime(gen.volDecay),
        volSustain: gen.volSustain / 1000,
        volRelease: convertTime(gen.volRelease),
        modDelay: convertTime(gen.modDelay),
        modAttack: convertTime(gen.modAttack),
        modHold: convertTime(gen.modHold),
        modDecay: convertTime(gen.modDecay),
        modSustain: gen.modSustain / 1000,
        modRelease: convertTime(gen.modRelease),
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
        releaseTime: gen.releaseTime,
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
      }
    }
  }
}

const defaultInstrumentZone = {
  keyRange: new RangeValue(0, 127),
  velRange: new RangeValue(0, 127),
  sampleID: undefined,
  volDelay: -12000,
  volAttack: -12000,
  volDecay: -12000,
  volHold: -12000,
  volSustain: 0,
  volRelease: -12000,
  modDelay: -12000,
  modAttack: -12000,
  modHold: -12000,
  modDecay: -12000,
  modSustain: 0,
  modRelease: -12000,
  modEnvToPitch: 0,
  modEnvToFilterFc: 0,
  coarseTune: 0,
  fineTune: 0,
  scaleTuning: 100,
  freqVibLFO: 0,
  startAddrsOffset: 0,
  startAddrsCoarseOffset: 0,
  endAddrsOffset: 0,
  endAddrsCoarseOffset: 0,
  startloopAddrsOffset: 0,
  startloopAddrsCoarseOffset: 0,
  initialAttenuation: 0,
  endloopAddrsOffset: 0,
  endloopAddrsCoarseOffset: 0,
  overridingRootKey: undefined,
  initialFilterQ: 1,
  initialFilterFc: 13500,
  sampleModes: 0,
  mute: false,
  releaseTime: 64,
  pan: undefined,
}

function convertTime(value: number) {
  return Math.pow(2, value / 1200)
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
