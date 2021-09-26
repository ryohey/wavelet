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
}

export interface LoadSampleEvent {
  type: "loadSample"
  sample: SampleData<ArrayBuffer>
  bank: number
  instrument: number // GM Patch Number
  keyRange: [number, number]
  velRange: [number, number]
}

interface DelayTime {
  delayTime: number
}

interface Channel {
  channel: number
}

export type NoteOnEvent = DelayTime &
  Channel & {
    type: "noteOn"
    velocity: number
    pitch: number
  }

export type NoteOffEvent = DelayTime &
  Channel & {
    type: "noteOff"
    pitch: number
  }

export type PitchBendEvent = DelayTime &
  Channel & {
    type: "pitchBend"
    value: number
  }

export type VolumeEvent = DelayTime &
  Channel & {
    type: "volume"
    value: number
  }

export type ProgramChangeEvent = DelayTime &
  Channel & {
    type: "programChange"
    value: number
  }

export type PitchBendSensitivityEvent = DelayTime &
  Channel & {
    type: "pitchBendSensitivity"
    value: number
  }

export type MainVolumeEvent = DelayTime &
  Channel & {
    type: "mainVolume"
    value: number
  }

export type ExpressionEvent = DelayTime &
  Channel & {
    type: "expression"
    value: number
  }

export type AllSoundsOffEvent = DelayTime &
  Channel & {
    type: "allSoundsOff"
  }

export type DelayableEvent =
  | NoteOnEvent
  | NoteOffEvent
  | PitchBendEvent
  | VolumeEvent
  | ProgramChangeEvent
  | PitchBendSensitivityEvent
  | MainVolumeEvent
  | ExpressionEvent
  | AllSoundsOffEvent

export type SynthEvent = LoadSampleEvent | DelayableEvent

export const DrumInstrumentNumber = 128
