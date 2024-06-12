import { SampleParameter, SampleRange } from "../SynthEvent"

export type SampleTableItem = SampleParameter & {
  velRange: [number, number]
}

export type Sample = SampleParameter & {
  buffer: Float32Array
}

export class SampleTable {
  private samples: {
    [sampleID: number]: Float32Array
  } = {}

  private sampleParameters: {
    [bank: number]: {
      [instrument: number]: { [pitch: number]: SampleTableItem[] }
    }
  } = {}

  addSample(data: Float32Array, sampleID: number) {
    this.samples[sampleID] = data
  }

  addSampleParameter(parameter: SampleParameter, range: SampleRange) {
    const { bank, instrument, keyRange, velRange } = range
    for (let i = keyRange[0]; i <= keyRange[1]; i++) {
      if (this.sampleParameters[bank] === undefined) {
        this.sampleParameters[bank] = {}
      }
      if (this.sampleParameters[bank][instrument] === undefined) {
        this.sampleParameters[bank][instrument] = {}
      }
      if (this.sampleParameters[bank][instrument][i] === undefined) {
        this.sampleParameters[bank][instrument][i] = []
      }
      this.sampleParameters[bank][instrument][i].push({
        ...parameter,
        velRange,
      })
    }
  }

  getSamples(
    bank: number,
    instrument: number,
    pitch: number,
    velocity: number
  ): Sample[] {
    const instrumentParameters =
      this.sampleParameters[bank]?.[instrument] ??
      this.sampleParameters[0]?.[instrument] ?? // fallback to bank 0
      null

    const parameters =
      instrumentParameters?.[pitch]?.filter(
        (s) => velocity >= s.velRange[0] && velocity <= s.velRange[1]
      ) ?? []

    const samples: Sample[] = []

    for (const parameter of parameters) {
      const buffer = this.samples[parameter.sampleID]
      if (buffer === undefined) {
        console.warn(`sample not found: ${parameter.sampleID}`)
        continue
      }
      samples.push({
        ...parameter,
        buffer,
      })
    }

    return samples
  }
}
