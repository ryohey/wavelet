export class LFO {
  // Hz
  frequency = 5
  private phase = 0

  getValue() {
    const phase = this.phase
    this.phase += (Math.PI * 2 * this.frequency) / sampleRate
    return Math.sin(phase)
  }
}
