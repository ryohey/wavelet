import { SampleData } from "../SynthEvent"

type Sample = SampleData<Float32Array>

export type SampleTableItem = Sample & {
  velRange: [number, number]
}

export class SampleTable {
  private samples: {
    [instrument: number]: { [pitch: number]: SampleTableItem[] }
  } = {}

  addSample(
    sample: Sample,
    instrument: number,
    keyRange: [number, number],
    velRange: [number, number]
  ) {
    for (let i = keyRange[0]; i <= keyRange[1]; i++) {
      if (this.samples[instrument] === undefined) {
        this.samples[instrument] = {}
      }
      if (this.samples[instrument][i] === undefined) {
        this.samples[instrument][i] = []
      }
      this.samples[instrument][i].push({ ...sample, velRange })
    }
  }

  getSample(
    instrument: number,
    pitch: number,
    velocity: number
  ): Sample | null {
    if (this.samples[instrument] === undefined) {
      return null
    }
    const samples = this.samples[instrument][pitch]
    if (samples === undefined) {
      return null
    }
    return (
      samples.find(
        (s) => velocity >= s.velRange[0] && velocity <= s.velRange[1]
      ) ?? null
    )
  }
}
