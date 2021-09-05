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
    this.port.onmessage = (e) => {
      console.log(e)
      if (typeof e.data === "string") {
        this.isEnabled = e.data === "noteOn"
        this.sampleIndex = 0
      } else {
        console.log("load sample")
        this.sample = e.data
        this.sampleIndex = 0
      }
    }
  }

  process(inputs, outputs) {
    if (!this.isEnabled) {
      return true
    }
    const output = outputs[0][0]

    for (let i = 0; i < output.length; ++i) {
      output[i] = this.sample[this.sampleIndex++]
      if (this.sampleIndex >= this.sample.length) {
        this.sampleIndex = 0
      }
    }

    return true
  }
}

registerProcessor("bypass-processor", BypassProcessor)
