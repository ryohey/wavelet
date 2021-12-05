import { CompleteMessage, ProgressMessage, StartMessage } from "./message"
import { renderAudio } from "./renderAudio"

declare global {
  function postMessage(
    message: ProgressMessage | CompleteMessage,
    transfer?: Transferable[] | undefined
  ): void
}

onmessage = async (e: MessageEvent<StartMessage>) => {
  const { samples, events, sampleRate } = e.data
  const audioData = await renderAudio(
    samples,
    events,
    sampleRate,
    (numBytes, totalBytes) =>
      postMessage({
        type: "progress",
        numBytes,
        totalBytes,
      })
  )
  postMessage({ type: "complete", audioData }, [
    audioData.leftData,
    audioData.rightData,
  ])
}
