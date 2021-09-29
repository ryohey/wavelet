import { SampleData } from "../SynthEvent"
import {
  AmplitudeEnvelope,
  AmplitudeEnvelopeParameter,
} from "./AmplitudeEnvelope"
import { WavetableOscillator } from "./WavetableOscillator"

export class NoteOscillator {
  private wave: WavetableOscillator
  private envelope: AmplitudeEnvelope
  private _isNoteOff = false

  constructor(
    sample: SampleData<Float32Array>,
    envelope: AmplitudeEnvelopeParameter
  ) {
    this.envelope = new AmplitudeEnvelope(envelope)
    this.wave = new WavetableOscillator(sample, this.envelope)
  }

  // velocity: 0 to 1
  noteOn(pitch: number, velocity: number) {
    this.wave.velocity = velocity
    this.wave.noteOn(pitch)
    this.envelope.noteOn()
  }

  noteOff() {
    this.envelope.noteOff()
    this._isNoteOff = true
  }

  process(output: Float32Array) {
    this.wave.process(output)
  }

  set speed(value: number) {
    this.wave.speed = value
  }

  set volume(value: number) {
    this.wave.volume = value
  }

  get isPlaying() {
    return this.wave.isPlaying && this.envelope.isPlaying
  }

  get isNoteOff() {
    return this._isNoteOff
  }
}