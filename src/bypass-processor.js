// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

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
    this.sampleIndex = this.loopEnd
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
        console.log("start loop")
      } else if (this.sampleIndex >= this.sampleEnd) {
        this.isPlaying = false
        console.log("finish")
      }
    }
  }
}

/**
 * A simple bypass node demo.
 *
 * @class BypassProcessor
 * @extends AudioWorkletProcessor
 */
class BypassProcessor extends AudioWorkletProcessor {
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

registerProcessor("bypass-processor", BypassProcessor)
