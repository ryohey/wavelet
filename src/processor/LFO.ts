export class LFO {
  // Hz
  frequency = 5
  private phase = 0

  getValue(bufferSize: number) {
    const phase = this.phase
    this.phase += ((Math.PI * 2 * this.frequency) / sampleRate) * bufferSize
    return Math.sin(phase)
  }
}
