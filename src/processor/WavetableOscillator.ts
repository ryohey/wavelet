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

  // -1 to 1
  pan = 0

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

  process(outputs: Float32Array[]) {
    if (!this._isPlaying) {
      return
    }

    const speed =
      (this.baseSpeed * this.speed * this.sample.sampleRate) / sampleRate
    const volume = this.velocity * this.volume

    // zero to pi/2
    const panTheta = ((this.pan + 1) * Math.PI) / 4
    const leftPanVolume = Math.cos(panTheta)
    const rightPanVolume = Math.sin(panTheta)

    for (let i = 0; i < outputs[0].length; ++i) {
      if (!this._isPlaying) {
        // finish sample
        outputs[0][i] = 0
        outputs[1][i] = 0
        continue
      }

      const index = Math.floor(this.sampleIndex)
      const advancedIndex = this.sampleIndex + speed
      let loopIndex: number | null = null

      if (
        this.sample.loop !== null &&
        advancedIndex >= this.sample.loop.end &&
        this.isLooping
      ) {
        loopIndex =
          this.sample.loop.start + (advancedIndex - Math.floor(advancedIndex))
      }

      const nextIndex =
        loopIndex !== null
          ? Math.floor(loopIndex)
          : Math.min(index + 1, this.sample.sampleEnd - 1)
      const gain = this.envelope.getAmplitude()

      // linear interpolation
      const current = this.sample.buffer[index]
      const next = this.sample.buffer[nextIndex]
      const level = current + (next - current) * (this.sampleIndex - index)
      const value = level * gain * volume

      outputs[0][i] = value * leftPanVolume
      outputs[1][i] = value * rightPanVolume

      this.sampleIndex = loopIndex ?? advancedIndex

      if (this.sampleIndex >= this.sample.sampleEnd) {
        this._isPlaying = false
        break
      }
    }
  }

  get isPlaying() {
    return this._isPlaying
  }
}
