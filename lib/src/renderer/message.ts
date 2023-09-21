import {
  LoadSampleEvent,
  SampleParameterEvent,
  SynthEvent,
} from "../SynthEvent"

export type InMessage = StartMessage | CancelMessage
export type OutMessage = ProgressMessage | CompleteMessage

export interface StartMessage {
  type: "start"
  samples: (LoadSampleEvent | SampleParameterEvent)[]
  events: SynthEvent[]
  sampleRate: number
  bufferSize?: number
}

export interface CancelMessage {
  type: "cancel"
}

export interface ProgressMessage {
  type: "progress"
  numBytes: number
  totalBytes: number
}

export interface AudioData {
  length: number
  sampleRate: number
  leftData: ArrayBuffer // Float32Array PCM
  rightData: ArrayBuffer // Float32Array PCM
}

export type CompleteMessage = {
  type: "complete"
  audioData: AudioData
}
