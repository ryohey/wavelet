import { SynthMessage } from ".."
import { SynthProcessorCore } from "./SynthProcessorCore"

export class SynthProcessor extends AudioWorkletProcessor {
  private readonly synth = new SynthProcessorCore(
    sampleRate,
    () => currentFrame
  )

  constructor() {
    super()

    this.port.onmessage = (e: MessageEvent<SynthMessage>) => {
      this.synth.addEvent(e.data)
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    this.synth.process(outputs[0])
    return true
  }
}
