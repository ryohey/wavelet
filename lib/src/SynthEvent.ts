import { AnyChannelEvent } from "midifile-ts"
import { AmplitudeEnvelopeParameter } from "./processor/AmplitudeEnvelope"
import { DistributiveOmit } from "./types"

export interface SampleLoop {
  start: number
  end: number
}

export interface SampleData<BufferType> {
  name: string
  buffer: BufferType
  pitch: number
  loop: SampleLoop | null
  sampleStart: number
  sampleEnd: number
  sampleRate: number
  amplitudeEnvelope: AmplitudeEnvelopeParameter
  // This parameter represents the degree to which MIDI key number influences pitch.
  // A value of zero indicates that MIDI key number has no effect on pitch
  // a value of 1 represents the usual tempered semitone scale.
  scaleTuning: number
  pan: number
  exclusiveClass?: number | undefined
  volume: number // 0 to 1
}

export interface LoadSampleEvent {
  type: "loadSample"
  sample: SampleData<ArrayBuffer>
  bank: number
  instrument: number // GM Patch Number
  keyRange: [number, number]
  velRange: [number, number]
}

export type MIDIEventBody = DistributiveOmit<AnyChannelEvent, "deltaTime">

export type MIDIEvent = {
  type: "midi"
  midi: MIDIEventBody
  // Time to delay the playback of an event. Number of frames
  // delayInSeconds = delayTime / sampleRate
  delayTime: number
}

export type ImmediateEvent = LoadSampleEvent
export type SynthEvent = ImmediateEvent | MIDIEvent

export const DrumInstrumentNumber = 128
