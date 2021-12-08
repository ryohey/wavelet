import { InMessage } from ".."
import { CompleteMessage, ProgressMessage } from "./message"
import { renderAudio } from "./renderAudio"

declare global {
  function postMessage(
    message: ProgressMessage | CompleteMessage,
    transfer?: Transferable[] | undefined
  ): void
}

let cancelled: boolean = false

// https://stackoverflow.com/a/61339321/1567777
const channel = new MessageChannel()

let promiseResolver: () => void

channel.port2.onmessage = () => {
  promiseResolver()
}

const fastSleep = async () => {
  const promise = new Promise<void>((resolve) => {
    promiseResolver = resolve
  })
  channel.port1.postMessage(null)
  await promise
}

onmessage = async (e: MessageEvent<InMessage>) => {
  switch (e.data.type) {
    case "cancel": {
      cancelled = true
      break
    }
    case "start": {
      const { samples, events, sampleRate } = e.data

      try {
        const audioData = await renderAudio(samples, events, {
          sampleRate,
          cancel: () => cancelled,
          waitForEventLoop: fastSleep,
          onProgress: (numBytes, totalBytes) =>
            postMessage({
              type: "progress",
              numBytes,
              totalBytes,
            }),
        })
        postMessage({ type: "complete", audioData }, [
          audioData.leftData,
          audioData.rightData,
        ])
      } catch (e) {
        console.error((e as Error).message)
      }
      close()
      break
    }
  }
}
