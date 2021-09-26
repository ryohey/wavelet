import { SampleData } from "../SynthEvent"

export class WavetableOscillator {
  private sample: SampleData<Float32Array>
  private sampleIndex = 0
  private _isPlaying = false
  private isLooping = false
  private baseSpeed = 1
  speed = 1

  constructor(sample: SampleData<Float32Array>) {
    this.sample = sample
  }

  noteOn(pitch: number) {
    this._isPlaying = true
    this.isLooping = this.sample.loop !== null
    this.sampleIndex = this.sample.sampleStart
    this.baseSpeed = Math.pow(2, (pitch - this.sample.pitch) / 12)
  }

  noteOff() {
    // finishing the sustain loop
    this.isLooping = false
  }

  process(output: Float32Array) {
    if (!this._isPlaying) {
      return
    }

    const speed =
      (this.baseSpeed * this.speed * this.sample.sampleRate) / sampleRate

    for (let i = 0; i < output.length; ++i) {
      if (this._isPlaying) {
        const index = Math.floor(this.sampleIndex)
        output[i] = this.sample.buffer[index]
      } else {
        // finish sample
        output[i] = 0
      }

      this.sampleIndex += speed

      if (
        this.sample.loop !== null &&
        this.sampleIndex > this.sample.loop.end &&
        this.isLooping
      ) {
        this.sampleIndex = this.sample.loop.start
      } else if (this.sampleIndex >= this.sample.sampleEnd) {
        this._isPlaying = false
      }
    }
  }

  get isPlaying() {
    return this._isPlaying
  }
}
