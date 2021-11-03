import { SampleData, SynthEvent } from "../SynthEvent"
import { logger } from "./logger"
import { SampleTable } from "./SampleTable"
import { SynthEventHandler } from "./SynthEventHandler"
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

type Sample = SampleData<Float32Array>

export class SynthProcessor extends AudioWorkletProcessor {
  private sampleTable = new SampleTable()
  private channels: { [key: number]: ChannelState } = {}
  private eventHandler = new SynthEventHandler(this)

  constructor() {
    super()

    this.port.onmessage = (e: MessageEvent<SynthEvent>) => {
      this.eventHandler.addEvent(e.data)
    }
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

  loadSample(
    sample: SampleData<ArrayBuffer>,
    bank: number,
    instrument: number,
    keyRange: [number, number],
    velRange: [number, number]
  ) {
    const _sample: Sample = {
      ...sample,
      buffer: new Float32Array(sample.buffer),
    }
    this.sampleTable.addSample(_sample, bank, instrument, keyRange, velRange)
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
      const oscillator = new WavetableOscillator(sample)

      const volume = velocity / 0x80
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
    state.volume = value / 0x80
  }

  expression(channel: number, value: number) {
    const state = this.getChannelState(channel)
    state.expression = value / 0x80
  }

  allSoundsOff(channel: number) {
    const state = this.getChannelState(channel)

    for (const key in state.oscillators) {
      for (const osc of state.oscillators[key]) {
        osc.forceStop()
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
    state.modulation = value / 0x80
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

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    this.eventHandler.processScheduledEvents()

    for (const channel in this.channels) {
      const state = this.channels[channel]

      for (let key in state.oscillators) {
        for (let i = state.oscillators[key].length - 1; i >= 0; i--) {
          const oscillator = state.oscillators[key][i]

          oscillator.speed = Math.pow(2, state.pitchBend / 12)
          oscillator.volume = state.volume * state.expression
          oscillator.pan = state.pan
          oscillator.modulation = state.modulation
          oscillator.process([outputs[0][0], outputs[0][1]])

          if (!oscillator.isPlaying) {
            state.oscillators[key].splice(i, 1)
          }
        }
      }
    }

    // master volume
    const masterVolume = 0.3
    for (let i = 0; i < outputs[0][0].length; ++i) {
      outputs[0][0][i] *= masterVolume
      outputs[0][1][i] *= masterVolume
    }

    return true
  }
}
