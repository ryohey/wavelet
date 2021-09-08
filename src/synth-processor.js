class WavetableOscillator {
  constructor({
    sample,
    isOneShot,
    loopStart,
    loopEnd,
    sampleStart,
    sampleEnd,
  }) {
    this.sample = sample
    this.sampleStart = sampleStart ?? 0
    this.sampleEnd = sampleEnd ?? sample.length
    this.isOneShot = isOneShot
    this.loopStart = loopStart ?? 0
    this.loopEnd = loopEnd ?? sample.length
    this.sampleIndex = 0
    this.isPlaying = false
    this.isLooping = false
  }

  noteOn() {
    this.isPlaying = true
    this.isLooping = !this.isOneShot
    this.sampleIndex = this.sampleStart
  }

  noteOff() {
    // finishing the sustain loop
    this.isLooping = false
  }

  process(output, speed = 1) {
    if (!this.isPlaying) {
      return
    }

    for (let i = 0; i < output.length; ++i) {
      if (this.isPlaying) {
        const index = Math.floor(this.sampleIndex)
        output[i] = this.sample[index]
      } else {
        // finish sample
        output[i] = 0
      }

      this.sampleIndex += speed
      if (this.sampleIndex >= this.loopEnd && this.isLooping) {
        this.sampleIndex = this.loopStart
      } else if (this.sampleIndex >= this.sampleEnd) {
        this.isPlaying = false
      }
    }
  }
}

class AmplitudeEnvelope {
  constructor(attackTime, decayTime, sustainLevel, releaseTime) {
    this.attackTime = attackTime
    this.decayTime = decayTime
    this.sustainLevel = sustainLevel
    this.releaseTime = releaseTime
    this.isRelease = false
    this.time = 0
    this.noteOffTime = 0
  }

  noteOn() {
    this.time = 0
    this.isPlaying = true
  }

  noteOff() {
    this.isRelease = true
    this.noteOffTime = this.time
  }

  getAmplitude(deltaTime) {
    if (!this.isPlaying) {
      return 0
    }
    const time = this.time + deltaTime

    if (this.isRelease) {
      // Release
      return (
        this.sustainLevel * (1 - (time - this.noteOffTime) / this.releaseTime)
      )
    }

    if (time < this.attackTime) {
      // Attack
      return time / this.attackTime
    }

    if (time < this.attackTime + this.decayTime) {
      // Decay
      return (
        1 -
        ((1 - this.sustainLevel) * (time - this.attackTime)) / this.decayTime
      )
    }

    // Sustain
    return this.sustainLevel
  }
}

class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.oscillators = {} // {pitch number: WavetableOscillator}
    this.currentOscillator = null
    this.speed = 1
    this.port.onmessage = (e) => {
      console.log(e.data)
      switch (e.data.type) {
        case "loadSample":
          console.log(`sample length ${e.data.data.length}`)
          this.oscillators[e.data.pitch] = new WavetableOscillator({
            sample: e.data.data,
            isOneShot: false,
            loopStart: e.data.data.length * 0.1,
            loopEnd: e.data.data.length * 0.999,
          })
          break
        case "noteOn":
          this.currentOscillator = this.oscillators[e.data.pitch]
          this.currentOscillator?.noteOn()
          break
        case "noteOff":
          this.currentOscillator?.noteOff()
          break
        case "pitchBend":
          this.speed = e.data.value
          break
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs[0][0]
    this.currentOscillator?.process(output, this.speed)
    return true
  }
}

registerProcessor("synth-processor", SynthProcessor)
