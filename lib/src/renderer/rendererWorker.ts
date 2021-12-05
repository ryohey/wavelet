import { InMessage } from ".."
import { CompleteMessage, ProgressMessage } from "./message"
import { CancellationToken, renderAudio } from "./renderAudio"

declare global {
  function postMessage(
    message: ProgressMessage | CompleteMessage,
    transfer?: Transferable[] | undefined
  ): void
}

let cancel: CancellationToken | null = null

onmessage = async (e: MessageEvent<InMessage>) => {
  switch (e.data.type) {
    case "cancel": {
      if (cancel !== null) {
        cancel.cancelled = true
      }
      break
    }
    case "start": {
      if (cancel !== null) {
        throw new Error("rendering is already started.")
      }

      const { samples, events, sampleRate } = e.data

      cancel = {
        cancelled: false,
      }

      try {
        const audioData = await renderAudio(
          samples,
          events,
          sampleRate,
          (numBytes, totalBytes) =>
            postMessage({
              type: "progress",
              numBytes,
              totalBytes,
            }),
          cancel
        )
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
