import { SampleData } from "../SynthEvent"
import { AmplitudeEnvelope } from "./AmplitudeEnvelope"

export class WavetableOscillator {
  private sample: SampleData<Float32Array>
  private sampleIndex = 0
  private _isPlaying = false
  private isLooping = false
  private baseSpeed = 1
  private envelope: AmplitudeEnvelope

  speed = 1
  // 0 to 1
  velocity = 1
  // 0 to 1
  volume = 1

  constructor(sample: SampleData<Float32Array>, envelope: AmplitudeEnvelope) {
    this.sample = sample
    this.envelope = envelope
  }

  noteOn(pitch: number) {
    this._isPlaying = true
    this.isLooping = this.sample.loop !== null
    this.sampleIndex = this.sample.sampleStart
    this.baseSpeed = Math.pow(
      2,
      ((pitch - this.sample.pitch) / 12) * this.sample.scaleTuning
    )
  }

  process(output: Float32Array) {
    if (!this._isPlaying) {
      return
    }

    const speed =
      (this.baseSpeed * this.speed * this.sample.sampleRate) / sampleRate
    const volume = this.velocity * this.volume

    for (let i = 0; i < output.length; ++i) {
      let loopIndex: number | null = null

      if (
        this.sample.loop !== null &&
        this.sampleIndex > this.sample.loop.end &&
        this.isLooping
      ) {
        loopIndex = this.sample.loop.start
      }

      if (this._isPlaying) {
        const index = Math.floor(this.sampleIndex)
        const nextIndex =
          loopIndex ?? Math.min(index + 1, this.sample.sampleEnd - 1)
        const gain = this.envelope.getAmplitude(i)

        // linear interpolation
        const current = this.sample.buffer[index]
        const next = this.sample.buffer[nextIndex]
        const level = current + (next - current) * (this.sampleIndex - index)

        output[i] = level * gain * volume
      } else {
        // finish sample
        output[i] = 0
      }

      this.sampleIndex = loopIndex ?? this.sampleIndex + speed

      if (this.sampleIndex >= this.sample.sampleEnd) {
        this._isPlaying = false
        break
      }
    }

    this.envelope.advance(output.length)
  }

  get isPlaying() {
    return this._isPlaying
  }
}
