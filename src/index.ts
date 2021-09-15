import { read } from "midifile-ts"
import { loadAllSamples } from "./loader"
import { midiMessageToSynthEvent } from "./midiMessageToSynthEvent"
import { playMIDI } from "./playMIDI"
import * as SynthEvent from "./SynthEvent"

const main = async () => {
  const context = new AudioContext()
  let synth: AudioWorkletNode

  const setup = async () => {
    try {
      await context.audioWorklet.addModule("js/synth-processor.js")
    } catch (e) {
      console.error("Failed to add AudioWorklet module", e)
    }
    synth = new AudioWorkletNode(context, "synth-processor")
    synth.connect(context.destination)
  }

  const postSynthMessage = (e: SynthEvent.SynthEvent) => {
    synth.port.postMessage(e)
  }

  await setup()

  loadAllSamples(context, postSynthMessage, (progress) => {
    const progressElm = document.getElementById(
      "progress"
    ) as HTMLProgressElement
    progressElm.value = progress
  })

  document.getElementById("button-resume")?.addEventListener("click", () => {
    context.resume()
  })

  document.getElementById("open")?.addEventListener("change", (e) => {
    const reader = new FileReader()
    reader.onload = () => {
      const midi = read(reader.result as ArrayBuffer)
      playMIDI(midi, context.sampleRate, postSynthMessage)
    }
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    reader.readAsArrayBuffer(file!)
  })

  try {
    const midiAccess = await (navigator as any).requestMIDIAccess({
      sysex: false,
    })

    midiAccess.inputs.forEach((entry: any) => {
      entry.onmidimessage = (event: any) => {
        const e = midiMessageToSynthEvent(event.data)
        if (e !== null) {
          postSynthMessage(e)
        }
      }
    })
  } catch (e) {
    console.error(e)
  }
}

main().catch((e) => {
  console.error(e)
})
