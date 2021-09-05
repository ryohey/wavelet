// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * A simple bypass node demo.
 *
 * @class BypassProcessor
 * @extends AudioWorkletProcessor
 */
class BypassProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isEnabled = false
    this.samples = {} // {pitch number: buffer}
    this.pitch = 0
    this.port.onmessage = (e) => {
      console.log(e.data)
      switch (e.data.type) {
        case "noteOn":
          this.isEnabled = true
          this.sampleIndex = 0
          this.pitch = e.data.pitch
          break
        case "noteOff":
          this.isEnabled = false
          break
        case "loadSample":
          this.samples[e.data.pitch] = e.data.data
          this.sampleIndex = 0
          break
      }
    }
  }

  process(inputs, outputs) {
    if (!this.isEnabled) {
      return true
    }
    const sample = this.samples[this.pitch]
    const output = outputs[0][0]

    for (let i = 0; i < output.length; ++i) {
      output[i] = sample[this.sampleIndex++]
      if (this.sampleIndex >= sample.length) {
        this.sampleIndex = 0
      }
    }

    return true
  }
}

registerProcessor("bypass-processor", BypassProcessor)
