import { InMessage } from ".."
import { FastSleep } from "./FastSleep"
import { CompleteMessage, ProgressMessage } from "./message"
import { renderAudio } from "./renderAudio"

declare global {
  function postMessage(
    message: ProgressMessage | CompleteMessage,
    transfer?: Transferable[] | undefined
  ): void
}

let cancelled: boolean = false

const fastSleep = new FastSleep()

onmessage = async (e: MessageEvent<InMessage>) => {
  switch (e.data.type) {
    case "cancel": {
      cancelled = true
      break
    }
    case "start": {
      const { samples, events, sampleRate, bufferSize } = e.data

      try {
        const audioData = await renderAudio(samples, events, {
          sampleRate,
          bufferSize,
          cancel: () => cancelled,
          waitForEventLoop: async () => await fastSleep.wait(),
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
