import { LoadSampleEvent, SynthEvent } from "../SynthEvent"

export type InMessage = StartMessage
export type OutMessage = ProgressMessage | CompleteMessage

export interface StartMessage {
  samples: LoadSampleEvent[]
  events: SynthEvent[]
  sampleRate: number
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