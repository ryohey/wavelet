export interface AmplitudeEnvelopeParameter {
  attackTime: number
  decayTime: number
  sustainLevel: number
  releaseTime: number
}

export class AmplitudeEnvelope {
  private parameter: AmplitudeEnvelopeParameter
  private time = 0
  private noteOffTime: number | null = null
  private _isPlaying = false

  constructor(parameter: AmplitudeEnvelopeParameter) {
    this.parameter = parameter
  }

  noteOn() {
    this.time = 0
    this.noteOffTime = null
    this._isPlaying = true
  }

  noteOff() {
    this.noteOffTime = this.time
  }

  getAmplitude(deltaTime: number): number {
    const time = this.time + deltaTime
    const { attackTime, decayTime, sustainLevel, releaseTime } = this.parameter

    // Release
    if (this.noteOffTime !== null) {
      const relativeTime = time - this.noteOffTime
      if (relativeTime < releaseTime) {
        const ratio = relativeTime / releaseTime
        return sustainLevel * (1 - ratio)
      }
      this._isPlaying = false
      return 0
    }

    // Attack
    if (time < attackTime) {
      return time / attackTime
    }

    // Decay
    {
      const relativeTime = time - attackTime
      if (relativeTime < decayTime) {
        const ratio = relativeTime / decayTime
        return 1 - (1 - sustainLevel) * ratio
      }
    }

    // Sustain
    return sustainLevel
  }

  advance(time: number) {
    this.time += time
  }

  get isPlaying() {
    return this._isPlaying
  }
}
