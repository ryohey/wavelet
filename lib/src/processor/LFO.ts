export class LFO {
  // Hz
  frequency = 5
  private phase = 0
  private readonly sampleRate: number

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  getValue(bufferSize: number) {
    const phase = this.phase
    this.phase +=
      ((Math.PI * 2 * this.frequency) / this.sampleRate) * bufferSize
    return Math.sin(phase)
  }
}
