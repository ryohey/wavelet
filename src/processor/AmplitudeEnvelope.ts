export interface AmplitudeEnvelopeParameter {
  attackTime: number
  decayTime: number
  sustainLevel: number
  releaseTime: number
}

enum EnvelopePhase {
  attack,
  decay,
  sustain,
  release,
  stopped,
}

export class AmplitudeEnvelope {
  private parameter: AmplitudeEnvelopeParameter
  private phase = EnvelopePhase.attack
  private lastAmplitude = 0

  constructor(parameter: AmplitudeEnvelopeParameter) {
    this.parameter = parameter
  }

  noteOn() {
    this.phase = EnvelopePhase.attack
  }

  noteOff() {
    this.phase = EnvelopePhase.release
  }

  getAmplitude(): number {
    const { attackTime, decayTime, sustainLevel, releaseTime } = this.parameter

    // Attack
    switch (this.phase) {
      case EnvelopePhase.attack: {
        const amplificationPerFrame = 1 / (attackTime * sampleRate)
        const value = this.lastAmplitude + amplificationPerFrame
        if (value >= 1) {
          this.phase = EnvelopePhase.decay
          this.lastAmplitude = 1
          return 1
        }
        this.lastAmplitude = value
        return value
      }
      case EnvelopePhase.decay: {
        const attenuationPerFrame = 1 / (decayTime * sampleRate)
        const value = this.lastAmplitude - attenuationPerFrame
        if (value <= sustainLevel) {
          if (sustainLevel <= 0) {
            this.phase = EnvelopePhase.stopped
            this.lastAmplitude = 0
            return 0
          } else {
            this.phase = EnvelopePhase.sustain
            this.lastAmplitude = sustainLevel
            return sustainLevel
          }
        }
        this.lastAmplitude = value
        return value
      }
      case EnvelopePhase.sustain: {
        return sustainLevel
      }
      case EnvelopePhase.release: {
        const attenuationPerFrame = 1 / (releaseTime * sampleRate)
        const value = this.lastAmplitude - attenuationPerFrame
        if (value <= 0) {
          this.phase = EnvelopePhase.stopped
          this.lastAmplitude = 0
          return 0
        }
        this.lastAmplitude = value
        return value
      }
      case EnvelopePhase.stopped: {
        return 0
      }
    }
  }

  get isPlaying() {
    return this.phase !== EnvelopePhase.stopped
  }
}
