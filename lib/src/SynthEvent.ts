import { AnyChannelEvent } from "midifile-ts"
import { AmplitudeEnvelopeParameter } from "./processor/AmplitudeEnvelope"
import { DistributiveOmit } from "./types"

export type SampleLoop =
  | {
      type: "no_loop"
    }
  | {
      type: "loop_continuous" | "loop_sustain"
      start: number
      end: number
    }

export interface SampleParameter {
  name: string
  sampleID: number
  pitch: number
  loop: SampleLoop
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

export interface SampleRange {
  bank: number
  instrument: number // GM Patch Number
  keyRange: [number, number]
  velRange: [number, number]
}

export interface LoadSampleEvent {
  type: "loadSample"
  data: ArrayBuffer
  sampleID: number
}

export interface SampleParameterEvent {
  type: "sampleParameter"
  parameter: SampleParameter
  range: SampleRange
}

export type MIDIEventBody = DistributiveOmit<AnyChannelEvent, "deltaTime">

export type MIDIEvent = {
  type: "midi"
  midi: MIDIEventBody
  // Time to delay the playback of an event. Number of frames
  // delayInSeconds = delayTime / sampleRate
  delayTime: number
}

export type ImmediateEvent = LoadSampleEvent | SampleParameterEvent
export type SynthEvent = ImmediateEvent | MIDIEvent

// the type to be sent by postMessage
export type SynthMessage = SynthEvent & {
  // A number assigned to each message to ensure the order in which they are sent is preserved upon reception.
  sequenceNumber: number
}

export const DrumInstrumentNumber = 128
