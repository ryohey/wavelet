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
  volume: number = 1

  constructor(envelope: AmplitudeEnvelope) {
    this.envelope = envelope
  }

  process(input: Float32Array, output: Float32Array) {
    for (let i = 0; i < output.length; ++i) {
      const gain = this.envelope.getAmplitude(i)
      output[i] = input[i] * gain * this.volume
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

  // volume: 0 to 1
  noteOn(volume: number) {
    this.wave.noteOn()
    this.envelope.noteOn()
    this.gain.volume = volume
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
}

class SynthProcessor extends AudioWorkletProcessor {
  private oscillators: { [key: number]: NoteOscillator } = {}
  private playingOscillators: { [key: number]: NoteOscillator } = {}
  private speed = 1

  constructor() {
    super()
    this.port.onmessage = (e) => {
      console.log(e.data)
      switch (e.data.type) {
        case "loadSample":
          console.log(`sample length ${e.data.data.length}`)
          const sample: Sample = {
            buffer: e.data.data,
            sampleStart: 0,
            sampleEnd: e.data.data.length,
            isOneShot: false,
            loopStart: e.data.data.length * 0.1,
            loopEnd: e.data.data.length * 0.999,
          }
          const envelope: AmplitudeEnvelopeParameter = {
            attackTime: 0,
            decayTime: 0,
            sustainLevel: 1,
            releaseTime: 0,
          }
          this.oscillators[e.data.pitch] = new NoteOscillator(sample, envelope)
          break
        case "noteOn": {
          const { pitch, velocity } = e.data
          const oscillator = this.oscillators[pitch]
          if (oscillator === undefined) {
            console.warn(`There is no sample for ${pitch}`)
          } else {
            this.playingOscillators[pitch] = oscillator
            const volume = velocity / 0x80
            oscillator.noteOn(volume)
          }
          console.log(
            "playingOscillators count",
            Object.values(this.playingOscillators).length
          )
          break
        }
        case "noteOff": {
          const { pitch } = e.data
          const oscillator = this.playingOscillators[pitch]
          oscillator?.noteOff()
          delete this.playingOscillators[pitch]
          break
        }
        case "pitchBend":
          this.speed = e.data.value
          break
      }
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0][0]
    const buffer = new Float32Array(output.length)

    Object.values(this.playingOscillators).forEach((oscillator) => {
      oscillator.speed = this.speed
      oscillator.process(buffer)
      addBuffer(buffer, output)
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
