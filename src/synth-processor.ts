import { DelayableEvent, SynthEvent } from "./SynthEvent"

interface SampleLoop {
  start: number
  end: number
}

interface Sample {
  buffer: Float32Array
  pitch: number
  loop: SampleLoop | null
  sampleStart: number
  sampleEnd: number
}

class WavetableOscillator {
  private sample: Sample
  private sampleIndex = 0
  private isPlaying = false
  private isLooping = false
  private baseSpeed = 1
  speed = 1

  constructor(sample: Sample) {
    this.sample = sample
  }

  noteOn(pitch: number) {
    this.isPlaying = true
    this.isLooping = this.sample.loop !== null
    this.sampleIndex = this.sample.sampleStart
    this.baseSpeed = 1 + (pitch - this.sample.pitch) / 12
  }

  noteOff() {
    // finishing the sustain loop
    this.isLooping = false
  }

  process(output: Float32Array) {
    if (!this.isPlaying) {
      return
    }

    const speed = this.baseSpeed * this.speed

    for (let i = 0; i < output.length; ++i) {
      if (this.isPlaying) {
        const index = Math.floor(this.sampleIndex)
        output[i] = this.sample.buffer[index]
      } else {
        // finish sample
        output[i] = 0
      }

      this.sampleIndex += speed

      if (this.sample.loop !== null) {
        if (this.sampleIndex >= this.sample.loop.end && this.isLooping) {
          this.sampleIndex = this.sample.loop.start
        } else if (this.sampleIndex >= this.sample.sampleEnd) {
          this.isPlaying = false
        }
      }
    }
  }
}

interface AmplitudeEnvelopeParameter {
  attackTime: number
  decayTime: number
  sustainLevel: number
  releaseTime: number
}

class AmplitudeEnvelope {
  private parameter: AmplitudeEnvelopeParameter
  private time = 0
  private noteOffTime: number | null = null

  constructor(parameter: AmplitudeEnvelopeParameter) {
    this.parameter = parameter
  }

  noteOn() {
    this.time = 0
    this.noteOffTime = null
  }

  noteOff() {
    this.noteOffTime = this.time
  }

  getAmplitude(deltaTime: number): number {
    const time = this.time + deltaTime
    const { attackTime, decayTime, sustainLevel, releaseTime } = this.parameter

    // Release
    if (this.noteOffTime) {
      const relativeTime = time - this.noteOffTime
      if (relativeTime < releaseTime) {
        const ratio = relativeTime / releaseTime
        return sustainLevel * (1 - ratio)
      }
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
}

class GainFilter {
  private envelope: AmplitudeEnvelope

  // 0 to 1
  velocity: number = 1

  // 0 to 1
  volume: number = 1

  constructor(envelope: AmplitudeEnvelope) {
    this.envelope = envelope
  }

  process(input: Float32Array, output: Float32Array) {
    const volume = this.velocity * this.volume
    for (let i = 0; i < output.length; ++i) {
      const gain = this.envelope.getAmplitude(i)
      output[i] = input[i] * gain * volume
    }
    this.envelope.advance(output.length)
  }
}

class NoteOscillator {
  private wave: WavetableOscillator
  private envelope: AmplitudeEnvelope
  private gain: GainFilter

  constructor(sample: Sample, envelope: AmplitudeEnvelopeParameter) {
    this.wave = new WavetableOscillator(sample)
    this.envelope = new AmplitudeEnvelope(envelope)
    this.gain = new GainFilter(this.envelope)
  }

  // velocity: 0 to 1
  noteOn(pitch: number, velocity: number) {
    this.wave.noteOn(pitch)
    this.envelope.noteOn()
    this.gain.velocity = velocity
  }

  noteOff() {
    this.wave.noteOff()
    this.envelope.noteOff()
  }

  process(output: Float32Array) {
    this.wave.process(output)
    this.gain.process(output, output)
  }

  set speed(value: number) {
    this.wave.speed = value
  }

  set volume(value: number) {
    this.gain.volume = value
  }
}

class Logger {
  enabled = true

  log(...args: any) {
    if (this.enabled) {
      console.log(...args)
    }
  }

  warn(...args: any) {
    if (this.enabled) {
      console.warn(...args)
    }
  }

  error(...args: any) {
    if (this.enabled) {
      console.error(...args)
    }
  }
}

const logger = new Logger()

interface ChannelState {
  speed: number
  volume: number
  instrument: number
  playingOscillators: { [key: number]: NoteOscillator }
}

const RHYTHM_CHANNEL = 9
const RHYTHM_INSTRUMENT = 128

type DelayedEvent = DelayableEvent & { receivedFrame: number }

class SynthProcessor extends AudioWorkletProcessor {
  private samples: { [instrument: number]: { [pitch: number]: Sample } } = {}
  private eventBuffer: DelayedEvent[] = []
  private channels: { [key: number]: ChannelState } = {}

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<SynthEvent>) => {
      logger.log(e.data)
      switch (e.data.type) {
        case "loadSample":
          const { instrument, pitch, keyRange } = e.data
          const data = new Float32Array(e.data.data)
          logger.log(`sample length ${data.length}`)
          const sample: Sample = {
            buffer: data,
            pitch,
            sampleStart: 0,
            sampleEnd: data.length,
            loop: null,
          }

          for (let i = keyRange[0]; i < keyRange[1]; i++) {
            if (this.samples[instrument] === undefined) {
              this.samples[instrument] = {}
            }
            this.samples[instrument][i] = sample
          }
          break
      }
      if ("delayTime" in e.data) {
        // handle in process
        this.eventBuffer.push({ ...e.data, receivedFrame: currentFrame })
      }
    }
  }

  getOscillator(channel: number, pitch: number): NoteOscillator | null {
    const state = this.getChannel(channel)

    // Play drums for CH.10
    const instrument =
      channel === RHYTHM_CHANNEL ? RHYTHM_INSTRUMENT : state.instrument

    if (this.samples[instrument] === undefined) {
      return null
    }
    const sample = this.samples[instrument][pitch]
    if (sample === undefined) {
      return null
    }
    const envelope: AmplitudeEnvelopeParameter = {
      attackTime: 0,
      decayTime: 0,
      sustainLevel: 1,
      releaseTime: 1000,
    }
    return new NoteOscillator(sample, envelope)
  }

  handleDelayableEvent(e: DelayableEvent) {
    logger.log("handle delayable event", e)
    switch (e.type) {
      case "noteOn": {
        const { pitch, velocity, channel } = e
        const state = this.getChannel(channel)
        const oscillator = this.getOscillator(channel, pitch)
        if (oscillator === null) {
          logger.warn(
            `There is no sample for noteNumber ${pitch} in instrument ${state.instrument}`
          )
        } else {
          const state = this.getChannel(channel)
          state.playingOscillators[pitch] = oscillator
          const volume = velocity / 0x80
          oscillator.noteOn(pitch, volume)
        }
        break
      }
      case "noteOff": {
        const { pitch, channel } = e
        if (channel === RHYTHM_CHANNEL) {
          // ignore note off
          break
        }
        const state = this.getChannel(channel)
        const oscillator = state.playingOscillators[pitch]
        oscillator?.noteOff()
        delete state.playingOscillators[pitch]
        break
      }
      case "pitchBend": {
        const state = this.getChannel(e.channel)
        state.speed = e.value
        break
      }
      case "volume": {
        const state = this.getChannel(e.channel)
        state.volume = e.value / 0x80
        break
      }
      case "programChange": {
        const state = this.getChannel(e.channel)
        state.instrument = e.value
        break
      }
    }
  }

  private getChannel(channel: number): ChannelState {
    const state = this.channels[channel]
    if (state !== undefined) {
      return state
    }
    const newState: ChannelState = {
      speed: 1,
      volume: 1,
      instrument: 0,
      playingOscillators: [],
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
        oscillator.speed = state.speed
        oscillator.volume = state.volume
        oscillator.process(buffer)
        addBuffer(buffer, output)
      })
    })

    return true
  }
}

const addBuffer = (buffer: Float32Array, toBuffer: Float32Array) => {
  for (let i = 0; i < buffer.length; i++) {
    toBuffer[i] += buffer[i]
    const level = toBuffer[i]
    if (level > 1) {
      logger.warn(`clipping level: ${level}`)
    }
  }
}

registerProcessor("synth-processor", SynthProcessor)
