// https://stackoverflow.com/a/61339321/1567777
export class FastSleep {
  private readonly channel = new MessageChannel()
  private promiseResolver: (() => void) | undefined

  constructor() {
    this.channel.port2.onmessage = () => {
      this.promiseResolver?.()
    }
  }

  async wait() {
    const promise = new Promise<void>((resolve) => {
      this.promiseResolver = resolve
    })
    this.channel.port1.postMessage(null)
    await promise
  }
}
