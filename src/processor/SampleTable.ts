import { SampleData } from "../SynthEvent"

type Sample = SampleData<Float32Array>

export type SampleTableItem = Sample & {
  velRange: [number, number]
}

export class SampleTable {
  private samples: {
    [bank: number]: {
      [instrument: number]: { [pitch: number]: SampleTableItem[] }
    }
  } = {}

  addSample(
    sample: Sample,
    bank: number,
    instrument: number,
    keyRange: [number, number],
    velRange: [number, number]
  ) {
    for (let i = keyRange[0]; i <= keyRange[1]; i++) {
      if (this.samples[bank] === undefined) {
        this.samples[bank] = {}
      }
      if (this.samples[bank][instrument] === undefined) {
        this.samples[bank][instrument] = {}
      }
      if (this.samples[bank][instrument][i] === undefined) {
        this.samples[bank][instrument][i] = []
      }
      this.samples[bank][instrument][i].push({ ...sample, velRange })
    }
  }

  getSamples(
    bank: number,
    instrument: number,
    pitch: number,
    velocity: number
  ): Sample[] {
    const samples = this.samples?.[bank]?.[instrument]?.[pitch]
    return (
      samples?.filter(
        (s) => velocity >= s.velRange[0] && velocity <= s.velRange[1]
      ) ?? []
    )
  }
}
