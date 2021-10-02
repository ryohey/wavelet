export interface AmplitudeEnvelopeParameter {
  attackTime: number
  decayTime: number
  sustainLevel: number
  releaseTime: number
}

export class AmplitudeEnvelope {
  private parameter: AmplitudeEnvelopeParameter
  private frame = 0
  private noteOffFrame: number | null = null
  private _isPlaying = false

  constructor(parameter: AmplitudeEnvelopeParameter) {
    this.parameter = parameter
  }

  noteOn() {
    this.frame = 0
    this.noteOffFrame = null
    this._isPlaying = true
  }

  noteOff() {
    this.noteOffFrame = this.frame
  }

  getAmplitude(deltaFrame: number): number {
    const time = this.frame + deltaFrame
    const { attackTime, decayTime, sustainLevel, releaseTime } = this.parameter

    // Release
    if (this.noteOffFrame !== null) {
      const relativeTime = time - this.noteOffFrame
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

  advance(frame: number) {
    this.frame += frame
  }

  get isPlaying() {
    return this._isPlaying
  }
}
