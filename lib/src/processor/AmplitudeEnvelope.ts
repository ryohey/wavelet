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
  forceStop,
  stopped,
}

const forceStopReleaseTime = 0.1

export class AmplitudeEnvelope {
  private readonly parameter: AmplitudeEnvelopeParameter
  private phase = EnvelopePhase.attack
  private lastAmplitude = 0
  private readonly sampleRate: number

  constructor(parameter: AmplitudeEnvelopeParameter, sampleRate: number) {
    this.parameter = parameter
    this.sampleRate = sampleRate
  }

  noteOn() {
    this.phase = EnvelopePhase.attack
  }

  noteOff() {
    if (this.phase !== EnvelopePhase.forceStop) {
      this.phase = EnvelopePhase.release
    }
  }

  // Rapidly decrease the volume. This method ignores release time parameter
  forceStop() {
    this.phase = EnvelopePhase.forceStop
  }

  getAmplitude(bufferSize: number): number {
    const { attackTime, decayTime, sustainLevel, releaseTime } = this.parameter
    const { sampleRate } = this

    // Attack
    switch (this.phase) {
      case EnvelopePhase.attack: {
        const amplificationPerFrame =
          (1 / (attackTime * sampleRate)) * bufferSize
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
        const attenuationPerFrame = (1 / (decayTime * sampleRate)) * bufferSize
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
        const attenuationPerFrame =
          (1 / (releaseTime * sampleRate)) * bufferSize
        const value = this.lastAmplitude - attenuationPerFrame
        if (value <= 0) {
          this.phase = EnvelopePhase.stopped
          this.lastAmplitude = 0
          return 0
        }
        this.lastAmplitude = value
        return value
      }
      case EnvelopePhase.forceStop: {
        const attenuationPerFrame =
          (1 / (forceStopReleaseTime * sampleRate)) * bufferSize
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
