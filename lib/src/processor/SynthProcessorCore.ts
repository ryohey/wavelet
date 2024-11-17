import { SampleParameter, SampleRange, SynthEvent } from "../SynthEvent"
import { logger } from "./logger"
import { Sample, SampleTable } from "./SampleTable"
import { SynthEventHandler } from "./SynthEventHandler"
import { SynthEventScheduler } from "./SynthEventScheduler"
import { WavetableOscillator } from "./WavetableOscillator"

interface ChannelState {
  volume: number // 0 to 1
  bank: number
  instrument: number
  pitchBend: number // in semitone
  pitchBendSensitivity: number // in semitone
  expression: number // 0 to 1
  pan: number // -1 to 1
  modulation: number
  oscillators: { [key: number]: WavetableOscillator[] }
  hold: boolean
}

const initialChannelState = (): ChannelState => ({
  volume: 1,
  bank: 0,
  instrument: 0,
  pitchBend: 0,
  pitchBendSensitivity: 2,
  oscillators: {},
  expression: 1,
  pan: 0,
  modulation: 0,
  hold: false,
})

const RHYTHM_CHANNEL = 9
const RHYTHM_BANK = 128

export class SynthProcessorCore {
  private sampleTable = new SampleTable()
  private channels: { [key: number]: ChannelState } = {}
  private readonly eventScheduler: SynthEventScheduler

  constructor(
    private readonly sampleRate: number,
    private readonly getCurrentFrame: () => number
  ) {
    const eventHandler = new SynthEventHandler(this)
    this.eventScheduler = new SynthEventScheduler(
      getCurrentFrame,
      (e) => eventHandler.handleImmediateEvent(e),
      (e) => eventHandler.handleDelayableEvent(e)
    )
    this.sampleRate = sampleRate
    this.getCurrentFrame = getCurrentFrame
  }

  get currentFrame(): number {
    return this.getCurrentFrame()
  }

  private getSamples(
    channel: number,
    pitch: number,
    velocity: number
  ): Sample[] {
    const state = this.getChannelState(channel)
    // Play drums for CH.10
    const bank = channel === RHYTHM_CHANNEL ? RHYTHM_BANK : state.bank
    return this.sampleTable.getSamples(bank, state.instrument, pitch, velocity)
  }

  addSample(data: ArrayBuffer, sampleID: number) {
    this.sampleTable.addSample(new Float32Array(data), sampleID)
  }

  addSampleParameter(parameter: SampleParameter, range: SampleRange) {
    this.sampleTable.addSampleParameter(parameter, range)
  }

  addEvent(e: SynthEvent & { sequenceNumber: number }) {
    this.eventScheduler.addEvent(e)
  }

  noteOn(channel: number, pitch: number, velocity: number) {
    const state = this.getChannelState(channel)

    const samples = this.getSamples(channel, pitch, velocity)

    if (samples.length === 0) {
      logger.warn(
        `There is no sample for noteNumber ${pitch} in instrument ${state.instrument} in bank ${state.bank}`
      )
      return
    }

    for (const sample of samples) {
      const oscillator = new WavetableOscillator(sample, this.sampleRate)

      const volume = velocity / 127
      oscillator.noteOn(pitch, volume)

      if (state.oscillators[pitch] === undefined) {
        state.oscillators[pitch] = []
      }

      if (sample.exclusiveClass !== undefined) {
        for (const key in state.oscillators) {
          for (const osc of state.oscillators[key]) {
            if (osc.exclusiveClass === sample.exclusiveClass) {
              osc.forceStop()
            }
          }
        }
      }

      state.oscillators[pitch].push(oscillator)
    }
  }

  noteOff(channel: number, pitch: number) {
    const state = this.getChannelState(channel)

    if (state.oscillators[pitch] === undefined) {
      return
    }

    for (const osc of state.oscillators[pitch]) {
      if (!osc.isNoteOff) {
        if (state.hold) {
          osc.isHold = true
        } else {
          osc.noteOff()
        }
      }
    }
  }

  pitchBend(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.pitchBend = (value / 0x2000 - 1) * state.pitchBendSensitivity
  }

  programChange(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.instrument = value
  }

  setPitchBendSensitivity(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.pitchBendSensitivity = value
  }

  setMainVolume(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.volume = value / 127
  }

  expression(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.expression = value / 127
  }

  allSoundsOff(channel: number) {
    this.eventScheduler.removeScheduledEvents(channel)
    const state = this.getChannelState(channel)

    for (const key in state.oscillators) {
      for (const osc of state.oscillators[key]) {
        osc.forceStop()
      }
    }
  }

  allNotesOff(channel: number) {
    const state = this.getChannelState(channel)

    for (const key in state.oscillators) {
      for (const osc of state.oscillators[key]) {
        osc.noteOff()
      }
    }
  }

  hold(channel: number, value: number) {
    const hold = value >= 64
    const state = this.getChannelState(channel)
    state.hold = hold

    if (hold) {
      return
    }

    for (const key in state.oscillators) {
      for (const osc of state.oscillators[key]) {
        if (osc.isHold) {
          osc.noteOff()
        }
      }
    }
  }

  setPan(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.pan = (value / 127 - 0.5) * 2
  }

  bankSelect(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.bank = value
  }

  modulation(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.modulation = value / 127
  }

  resetChannel(channel: number) {
    delete this.channels[channel]
  }

  private getChannelState(channel: number): ChannelState {
    const state = this.channels[channel]
    if (state !== undefined) {
      return state
    }
    const newState = initialChannelState()
    this.channels[channel] = newState
    return newState
  }

  process(outputs: Float32Array[]): void {
    this.eventScheduler.processScheduledEvents()

    for (const channel in this.channels) {
      const state = this.channels[channel]

      for (let key in state.oscillators) {
        state.oscillators[key] = state.oscillators[key].filter((oscillator) => {
          oscillator.speed = Math.pow(2, state.pitchBend / 12)
          oscillator.volume = state.volume * state.expression
          oscillator.pan = state.pan
          oscillator.modulation = state.modulation
          oscillator.process([outputs[0], outputs[1]])

          if (!oscillator.isPlaying) {
            return false
          }
          return true
        })
      }
    }
  }
}
