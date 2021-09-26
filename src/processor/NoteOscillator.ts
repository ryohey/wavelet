import { SampleData } from "../SynthEvent"
import {
  AmplitudeEnvelope,
  AmplitudeEnvelopeParameter,
} from "./AmplitudeEnvelope"
import { GainProcessor } from "./GainProcessor"
import { WavetableOscillator } from "./WavetableOscillator"

export class NoteOscillator {
  private wave: WavetableOscillator
  private envelope: AmplitudeEnvelope
  private gain: GainProcessor

  constructor(
    sample: SampleData<Float32Array>,
    envelope: AmplitudeEnvelopeParameter
  ) {
    this.wave = new WavetableOscillator(sample)
    this.envelope = new AmplitudeEnvelope(envelope)
    this.gain = new GainProcessor(this.envelope)
  }

  // velocity: 0 to 1
  noteOn(pitch: number, velocity: number) {
    this.wave.noteOn(pitch)
    this.envelope.noteOn()
    this.gain.velocity = velocity
  }

  noteOff() {
    this.wave.noteOff()
    this.envelope.noteOff()
  }

  process(output: Float32Array) {
    this.wave.process(output)
    this.gain.process(output, output)
  }

  set speed(value: number) {
    this.wave.speed = value
  }

  set volume(value: number) {
    this.gain.volume = value
  }

  get isPlaying() {
    return this.wave.isPlaying
  }
}
