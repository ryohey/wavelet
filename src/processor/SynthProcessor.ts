import { DelayableEvent, SampleData, SynthEvent } from "../SynthEvent"
import { AmplitudeEnvelopeParameter } from "./AmplitudeEnvelope"
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
  playingOscillators: { [key: number]: NoteOscillator }
}

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

  getSample(channel: number, pitch: number, velocity: number): Sample | null {
    const state = this.getChannelState(channel)
    // Play drums for CH.10
    const bank = channel === RHYTHM_CHANNEL ? RHYTHM_BANK : state.bank
    return this.sampleTable.getSample(bank, state.instrument, pitch, velocity)
  }

  handleDelayableEvent(e: DelayableEvent) {
    logger.log("handle delayable event", e)
    switch (e.type) {
      case "noteOn": {
        const { pitch, velocity, channel } = e
        const state = this.getChannelState(channel)

        if (state.playingOscillators[pitch] !== undefined) {
          break
        }

        const sample = this.getSample(channel, pitch, velocity)

        if (sample === null) {
          logger.warn(
            `There is no sample for noteNumber ${pitch} in instrument ${state.instrument} in bank ${state.bank}`
          )
          break
        }

        const envelope: AmplitudeEnvelopeParameter = {
          attackTime: 0,
          decayTime: 0,
          sustainLevel: 1,
          releaseTime: 1000,
        }
        const oscillator = new NoteOscillator(sample, envelope)
        state.playingOscillators[pitch] = oscillator
        const volume = velocity / 0x80
        oscillator.noteOn(pitch, volume)

        break
      }
      case "noteOff": {
        const { pitch, channel } = e
        if (channel === RHYTHM_CHANNEL) {
          // ignore note off
          break
        }
        const state = this.getChannelState(channel)
        const oscillator = state.playingOscillators[pitch]
        oscillator?.noteOff()
        delete state.playingOscillators[pitch]
        break
      }
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
      }
      case "expression": {
        const state = this.getChannelState(e.channel)
        state.expression = e.value / 0x80
      }
      case "allSoundsOff": {
        const state = this.getChannelState(e.channel)
        for (const oscillator of Object.values(state.playingOscillators)) {
          oscillator?.noteOff()
        }
        state.playingOscillators = []
        break
      }
    }
  }

  private getChannelState(channel: number): ChannelState {
    const state = this.channels[channel]
    if (state !== undefined) {
      return state
    }
    const newState: ChannelState = {
      volume: 1,
      bank: 0,
      instrument: 0,
      pitchBend: 0,
      pitchBendSensitivity: 12,
      playingOscillators: [],
      expression: 1,
    }
    this.channels[channel] = newState
    return newState
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0][0]
    const buffer = new Float32Array(output.length)

    this.eventBuffer = this.eventBuffer.filter((e) => {
      if (e.receivedFrame + e.delayTime <= currentFrame) {
        this.handleDelayableEvent(e)
        return false
      }
      return true
    })

    Object.values(this.channels).forEach((state) => {
      Object.values(state.playingOscillators).forEach((oscillator) => {
        oscillator.speed = Math.pow(2, state.pitchBend / 12)
        oscillator.volume = state.volume * state.expression
        oscillator.process(buffer)
        addBuffer(buffer, output)
      })
    })

    // master volume
    const masterVolume = 0.3
    for (let i = 0; i < output.length; ++i) {
      output[i] *= masterVolume
    }

    return true
  }
}
