// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

class WavetableOscillator {
  constructor(sample) {
    this.sampleIndex = 0
    this.sample = sample
    this.isPlaying = false
  }

  play() {
    this.isPlaying = true
    this.sampleIndex = 0
  }

  stop() {
    this.isPlaying = false
  }

  process(output) {
    if (!this.isPlaying) {
      return
    }
    for (let i = 0; i < output.length; ++i) {
      output[i] = this.sample[this.sampleIndex++]
      if (this.sampleIndex >= this.sample.length) {
        this.sampleIndex = 0
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
    this.port.onmessage = (e) => {
      console.log(e.data)
      switch (e.data.type) {
        case "noteOn":
          this.currentOscillator = this.oscillators[e.data.pitch]
          this.currentOscillator?.play()
          break
        case "noteOff":
          this.currentOscillator?.stop()
          break
        case "loadSample":
          this.oscillators[e.data.pitch] = new WavetableOscillator(e.data.data)
          break
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs[0][0]
    this.currentOscillator?.process(output)
    return true
  }
}

registerProcessor("bypass-processor", BypassProcessor)
