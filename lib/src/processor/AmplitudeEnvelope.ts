export interface AmplitudeEnvelopeParameter {
  attackTime: number
  holdTime: number
  decayTime: number
  sustainLevel: number
  releaseTime: number
}

enum EnvelopePhase {
  trigger, // just 1 frame after note on
  attack,
  attackToHold,
  hold,
  decay,
  sustain,
  release,
  forceStop,
  stopped,
}

const forceStopReleaseTime = 0.1

export class AmplitudeEnvelope {
  private readonly parameter: AmplitudeEnvelopeParameter
  private phase = EnvelopePhase.stopped
  private holdPhaseTime = 0
  private lastAmplitude = 0
  private readonly sampleRate: number

  constructor(parameter: AmplitudeEnvelopeParameter, sampleRate: number) {
    this.parameter = parameter
    this.sampleRate = sampleRate
  }

  noteOn() {
    this.phase = EnvelopePhase.trigger
  }

  noteOff() {
    switch (this.phase) {
      case EnvelopePhase.trigger:
        // To prevent the sound from not being played when the note off comes in the same frame as the note on,
        // the attack processing is performed before moving to the hold.
        this.phase = EnvelopePhase.attackToHold
        break
      case EnvelopePhase.forceStop:
        // do nothing
        break
      default:
        this.phase = EnvelopePhase.release
        break
    }
  }

  // Rapidly decrease the volume. This method ignores release time parameter
  forceStop() {
    this.phase = EnvelopePhase.forceStop
  }

  getAmplitude(bufferSize: number): number {
    const { attackTime, holdTime, decayTime, sustainLevel, releaseTime } =
      this.parameter
    const { sampleRate } = this

    // Attack
    switch (this.phase) {
      case EnvelopePhase.trigger:
        this.phase = EnvelopePhase.attack
      // same as attack
      case EnvelopePhase.attackToHold:
      case EnvelopePhase.attack: {
        const amplificationPerFrame =
          (1 / (attackTime * sampleRate)) * bufferSize
        const value = Math.min(1, this.lastAmplitude + amplificationPerFrame)
        if (value >= 1 || this.phase === EnvelopePhase.attackToHold) {
          this.phase = EnvelopePhase.hold
          this.lastAmplitude = value
          this.holdPhaseTime = 0
          return 1
        }
        this.lastAmplitude = value
        return value
      }
      case EnvelopePhase.hold: {
        if (this.holdPhaseTime >= holdTime) {
          this.phase = EnvelopePhase.decay
        }
        this.holdPhaseTime += bufferSize / sampleRate
        return this.lastAmplitude
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
