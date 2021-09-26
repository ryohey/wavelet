import { AmplitudeEnvelope } from "./AmplitudeEnvelope"

export class GainProcessor {
  private envelope: AmplitudeEnvelope

  // 0 to 1
  velocity: number = 1

  // 0 to 1
  volume: number = 1

  constructor(envelope: AmplitudeEnvelope) {
    this.envelope = envelope
  }

  process(input: Float32Array, output: Float32Array) {
    const volume = this.velocity * this.volume
    for (let i = 0; i < output.length; ++i) {
      const gain = this.envelope.getAmplitude(i)
      output[i] = input[i] * gain * volume
    }
    this.envelope.advance(output.length)
  }
}
