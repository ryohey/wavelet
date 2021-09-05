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
      console.log(e.data)
      this.isEnabled = e.data === "noteOn"
    }
  }

  process(inputs, outputs) {
    if (!this.isEnabled) {
      return true
    }
    // By default, the node has single input and output.
    const input = inputs[0]
    const output = outputs[0]

    for (let channel = 0; channel < output.length; ++channel) {
      output[channel].set(input[channel])
    }

    return true
  }
}

registerProcessor("bypass-processor", BypassProcessor)
