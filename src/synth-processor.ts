import { DelayableEvent, SynthEvent } from "./SynthEvent"

interface Sample {
  buffer: Float32Array
  isOneShot: boolean
  loopStart: number
  loopEnd: number
  sampleStart: number
  sampleEnd: number
}

class WavetableOscillator {
  private sample: Sample
  private sampleIndex = 0
  private isPlaying = false
  private isLooping = false
  speed = 1

  constructor(sample: Sample) {
    this.sample = sample
  }

  noteOn() {
    this.isPlaying = true
    this.isLooping = !this.sample.isOneShot
    this.sampleIndex = this.sample.sampleStart
  }

  noteOff() {
    // finishing the sustain loop
    this.isLooping = false
  }

  process(output: Float32Array) {
    if (!this.isPlaying) {
      return
    }

    for (let i = 0; i < output.length; ++i) {
      if (this.isPlaying) {
        const index = Math.floor(this.sampleIndex)
        output[i] = this.sample.buffer[index]
      } else {
        // finish sample
        output[i] = 0
      }

      this.sampleIndex += this.speed
      if (this.sampleIndex >= this.sample.loopEnd && this.isLooping) {
        this.sampleIndex = this.sample.loopStart
      } else if (this.sampleIndex >= this.sample.sampleEnd) {
        this.isPlaying = false
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
  noteOn(velocity: number) {
    this.wave.noteOn()
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

interface ChannelState {
  speed: number
  volume: number
  instrument: number
  playingOscillators: { [key: number]: NoteOscillator }
}

class SynthProcessor extends AudioWorkletProcessor {
  private samples: { [instrument: number]: { [pitch: number]: Sample } } = {}
  private eventBuffer: DelayableEvent[] = []
  private channels: { [key: number]: ChannelState } = {}

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<SynthEvent>) => {
      console.log(e.data)
      switch (e.data.type) {
        case "loadSample":
          const { data, instrument, pitch } = e.data
          console.log(`sample length ${data.length}`)
          const sample: Sample = {
            buffer: data,
            sampleStart: 0,
            sampleEnd: data.length,
            isOneShot: false,
            loopStart: data.length * 0.1,
            loopEnd: data.length * 0.999,
          }
          if (this.samples[instrument] === undefined) {
            this.samples[instrument] = {}
          }
          this.samples[instrument][pitch] = sample
          break
      }
      if ("delayTime" in e.data) {
        // handle in process
        this.eventBuffer.push(e.data)
      }
    }
  }

  getOscillator(channel: number, pitch: number): NoteOscillator | null {
    const state = this.getChannel(channel)

    // Play drums for CH.10
    const instrument = channel === 9 ? 128 : state.instrument

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
      releaseTime: 0,
    }
    return new NoteOscillator(sample, envelope)
  }

  handleDelayableEvent(e: DelayableEvent) {
    console.log("handle delayable event", e)
    switch (e.type) {
      case "noteOn": {
        const { pitch, velocity, channel } = e
        const state = this.getChannel(channel)
        const oscillator = this.getOscillator(channel, pitch)
        if (oscillator === null) {
          console.warn(
            `There is no sample for noteNumber ${pitch} in instrument ${state.instrument}`
          )
        } else {
          const state = this.getChannel(channel)
          state.playingOscillators[pitch] = oscillator
          const volume = velocity / 0x80
          oscillator.noteOn(volume)
        }
        break
      }
      case "noteOff": {
        const { pitch, channel } = e
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
      e.delayTime -= output.length
      if (e.delayTime <= 0) {
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
  }
}

registerProcessor("synth-processor", SynthProcessor)
