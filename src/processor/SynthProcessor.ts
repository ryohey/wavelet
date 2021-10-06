import {
  DelayableEvent,
  NoteOffEvent,
  NoteOnEvent,
  SampleData,
  SynthEvent,
} from "../SynthEvent"
import { addBuffer } from "./bufferUtil"
import { logger } from "./logger"
import { NoteOscillator } from "./NoteOscillator"
import { SampleTable } from "./SampleTable"

interface ChannelState {
  volume: number // 0 to 1
  bank: number
  instrument: number
  pitchBend: number // in semitone
  pitchBendSensitivity: number // in semitone
  expression: number // 0 to 1
  pan: number // -1 to 1
  oscillators: { [key: number]: NoteOscillator[] }
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
})

const RHYTHM_CHANNEL = 9
const RHYTHM_BANK = 128

type DelayedEvent = DelayableEvent & { receivedFrame: number }
type Sample = SampleData<Float32Array>

export class SynthProcessor extends AudioWorkletProcessor {
  private sampleTable = new SampleTable()
  private eventBuffer: DelayedEvent[] = []
  private channels: { [key: number]: ChannelState } = {}

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<SynthEvent>) => {
      logger.log(e.data)
      switch (e.data.type) {
        case "loadSample":
          const {
            bank,
            instrument,
            keyRange,
            velRange,
            sample: _sample,
          } = e.data
          const sample: Sample = {
            ..._sample,
            buffer: new Float32Array(_sample.buffer),
          }
          this.sampleTable.addSample(
            sample,
            bank,
            instrument,
            keyRange,
            velRange
          )
          break
      }
      if ("delayTime" in e.data) {
        // handle in process
        this.eventBuffer.push({ ...e.data, receivedFrame: currentFrame })
      }
    }
  }

  getSamples(channel: number, pitch: number, velocity: number): Sample[] {
    const state = this.getChannelState(channel)
    // Play drums for CH.10
    const bank = channel === RHYTHM_CHANNEL ? RHYTHM_BANK : state.bank
    return this.sampleTable.getSamples(bank, state.instrument, pitch, velocity)
  }

  private noteOn({ pitch, velocity, channel }: NoteOnEvent) {
    const state = this.getChannelState(channel)

    const samples = this.getSamples(channel, pitch, velocity)

    if (samples.length === 0) {
      logger.warn(
        `There is no sample for noteNumber ${pitch} in instrument ${state.instrument} in bank ${state.bank}`
      )
      return
    }

    for (const sample of samples) {
      const oscillator = new NoteOscillator(sample, sample.amplitudeEnvelope)

      const volume = velocity / 0x80
      oscillator.noteOn(pitch, volume)

      if (state.oscillators[pitch] === undefined) {
        state.oscillators[pitch] = []
      }

      if (sample.exclusiveClass !== undefined) {
        Object.values(state.oscillators)
          .flatMap((list) => list)
          .filter((osc) => osc.exclusiveClass === sample.exclusiveClass)
          .forEach((osc) => osc.forceStop())
      }

      state.oscillators[pitch].push(oscillator)
    }
  }

  private noteOff({ pitch, channel }: NoteOffEvent) {
    const state = this.getChannelState(channel)
    state.oscillators[pitch]
      ?.filter((osc) => !osc.isNoteOff)
      ?.forEach((oscillator) => {
        oscillator.noteOff()
      })
  }

  handleDelayableEvent(e: DelayableEvent) {
    logger.log("handle delayable event", e)
    switch (e.type) {
      case "noteOn":
        this.noteOn(e)
        break
      case "noteOff":
        this.noteOff(e)
        break
      case "pitchBend": {
        const state = this.getChannelState(e.channel)
        state.pitchBend = (e.value / 0x2000 - 1) * state.pitchBendSensitivity
        break
      }
      case "volume": {
        const state = this.getChannelState(e.channel)
        state.volume = e.value / 0x80
        break
      }
      case "programChange": {
        const state = this.getChannelState(e.channel)
        state.instrument = e.value
        break
      }
      case "pitchBendSensitivity": {
        const state = this.getChannelState(e.channel)
        state.pitchBendSensitivity = e.value
        break
      }
      case "mainVolume": {
        const state = this.getChannelState(e.channel)
        state.volume = e.value / 0x80
        break
      }
      case "expression": {
        const state = this.getChannelState(e.channel)
        state.expression = e.value / 0x80
        break
      }
      case "allSoundsOff": {
        const state = this.getChannelState(e.channel)
        Object.values(state.oscillators).forEach((list) =>
          list.forEach((osc) => {
            if (!osc.isNoteOff) {
              osc.noteOff()
            }
          })
        )
        break
      }
      case "hold": {
        const hold = e.value >= 64
        const state = this.getChannelState(e.channel)
        Object.values(state.oscillators).forEach((list) =>
          list.forEach((osc) => osc.setHold(hold))
        )
        break
      }
      case "pan": {
        const state = this.getChannelState(e.channel)
        state.pan = (e.value / 127 - 0.5) * 2
        break
      }
      case "bankSelect": {
        const state = this.getChannelState(e.channel)
        state.bank = e.value
        break
      }
    }
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
    const bufferLeft = new Float32Array(outputs[0][0].length)
    const bufferRight = new Float32Array(outputs[0][1].length)

    this.eventBuffer = this.eventBuffer.filter((e) => {
      if (e.receivedFrame + e.delayTime <= currentFrame) {
        this.handleDelayableEvent(e)
        return false
      }
      return true
    })

    Object.values(this.channels).forEach((state) => {
      for (let key in state.oscillators) {
        for (const oscillator of state.oscillators[key]) {
          oscillator.speed = Math.pow(2, state.pitchBend / 12)
          oscillator.volume = state.volume * state.expression
          oscillator.pan = state.pan
          oscillator.process([bufferLeft, bufferRight])
          addBuffer(bufferLeft, outputs[0][0])
          addBuffer(bufferRight, outputs[0][1])
        }

        state.oscillators[key] = state.oscillators[key]?.filter(
          (osc) => osc.isPlaying
        )
      }
    })

    // master volume
    const masterVolume = 0.3
    for (let i = 0; i < outputs[0][0].length; ++i) {
      outputs[0][0][i] *= masterVolume
      outputs[0][1][i] *= masterVolume
    }

    return true
  }
}
