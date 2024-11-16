export interface AmplitudeEnvelopeParameter {
  attackTime: number
  holdTime: number
  decayTime: number
  sustainLevel: number
  releaseTime: number
}

enum EnvelopePhase {
  attack,
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
  private _phase = EnvelopePhase.stopped
  private isNoteOff = false
  private phaseTime = 0
  private decayLevel = 0 // amplitude level at the end of decay phase
  private lastAmplitude = 0
  private readonly sampleRate: number

  constructor(parameter: AmplitudeEnvelopeParameter, sampleRate: number) {
    this.parameter = parameter
    this.sampleRate = sampleRate
  }

  private get phase() {
    return this._phase
  }

  private set phase(phase: EnvelopePhase) {
    if (this._phase === phase) {
      return
    }
    this._phase = phase
    this.phaseTime = 0
  }

  noteOn() {
    this.phase = EnvelopePhase.attack
    this.isNoteOff = false
    this.phaseTime = 0
    this.decayLevel = this.parameter.sustainLevel
  }

  noteOff() {
    this.isNoteOff = true
  }

  // Rapidly decrease the volume. This method ignores release time parameter
  forceStop() {
    this.phase = EnvelopePhase.forceStop
  }

  calculateAmplitude(bufferSize: number): number {
    const { attackTime, holdTime, decayTime, sustainLevel, releaseTime } =
      this.parameter
    const { sampleRate } = this

    if (
      this.isNoteOff &&
      (this.phase === EnvelopePhase.decay ||
        this.phase === EnvelopePhase.sustain)
    ) {
      this.phase = EnvelopePhase.release
      this.decayLevel = this.lastAmplitude
    }

    // Attack
    switch (this.phase) {
      case EnvelopePhase.attack: {
        const amplificationPerFrame =
          (1 / (attackTime * sampleRate)) * bufferSize
        const value = this.lastAmplitude + amplificationPerFrame
        if (value >= 1) {
          this.phase = EnvelopePhase.hold
          return 1
        }
        return value
      }
      case EnvelopePhase.hold: {
        if (this.phaseTime >= holdTime) {
          this.phase = EnvelopePhase.decay
        }
        return this.lastAmplitude
      }
      case EnvelopePhase.decay: {
        const attenuationDecibel = linearToDecibel(sustainLevel / 1)
        const value = logAttenuation(
          1.0,
          attenuationDecibel,
          decayTime,
          this.phaseTime
        )
        if (this.phaseTime > decayTime) {
          if (sustainLevel <= 0) {
            this.phase = EnvelopePhase.stopped
            return 0
          } else {
            this.phase = EnvelopePhase.sustain
            return sustainLevel
          }
        }
        return value
      }
      case EnvelopePhase.sustain: {
        return sustainLevel
      }
      case EnvelopePhase.release: {
        const value = logAttenuation(
          this.decayLevel,
          -100, // -100dB means almost silence
          releaseTime,
          this.phaseTime
        )
        if (this.phaseTime > releaseTime || value <= 0) {
          this.phase = EnvelopePhase.stopped
          return 0
        }
        return value
      }
      case EnvelopePhase.forceStop: {
        const attenuationPerFrame =
          (1 / (forceStopReleaseTime * sampleRate)) * bufferSize
        const value = this.lastAmplitude - attenuationPerFrame
        if (value <= 0) {
          this.phase = EnvelopePhase.stopped
          return 0
        }
        return value
      }
      case EnvelopePhase.stopped: {
        return 0
      }
    }
  }

  getAmplitude(bufferSize: number): number {
    const value = this.calculateAmplitude(bufferSize)
    this.lastAmplitude = value
    this.phaseTime += bufferSize / sampleRate
    return value
  }

  get isPlaying() {
    return this.phase !== EnvelopePhase.stopped
  }
}

// An exponential decay function. It attenuates the value of decibel over the duration time.
function logAttenuation(
  fromLevel: number,
  attenuationDecibel: number,
  duration: number,
  time: number
): number {
  return fromLevel * decibelToLinear((attenuationDecibel / duration) * time)
}

function linearToDecibel(value: number): number {
  return 20 * Math.log10(value)
}

function decibelToLinear(value: number): number {
  return Math.pow(10, value / 20)
}
