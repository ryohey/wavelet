export interface LoadSampleEvent {
  type: "loadSample"
  data: Float32Array
  pitch: number
  instrument: number // GM Patch Number
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

export type DelayableEvent =
  | NoteOnEvent
  | NoteOffEvent
  | PitchBendEvent
  | VolumeEvent

export type SynthEvent = LoadSampleEvent | DelayableEvent
