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
  instrument: number // GM Patch Number
  keyRange: [number, number]
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

export type DelayableEvent =
  | NoteOnEvent
  | NoteOffEvent
  | PitchBendEvent
  | VolumeEvent
  | ProgramChangeEvent

export type SynthEvent = LoadSampleEvent | DelayableEvent

export const DrumInstrumentNumber = 128
