import { read } from "midifile-ts"
import { loadMIDIjsInstruments } from "./MIDI.js/loader"
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

  const postSynthMessage = (
    e: SynthEvent.SynthEvent,
    transfer?: Transferable[]
  ) => {
    synth.port.postMessage(e, transfer ?? [])
  }

  const loadMIDIjsSoundFont = async () => {
    const url = "/midi-js-soundfonts-with-drums/FluidR3_GM/"
    const instruments = await loadMIDIjsInstruments(
      url,
      context,
      (progress) => {
        const progressElm = document.getElementById(
          "progress"
        ) as HTMLProgressElement
        progressElm.value = progress
      }
    )
    instruments.forEach((instrument) => {
      instrument.samples.forEach((sample) => {
        postSynthMessage(
          {
            type: "loadSample",
            pitch: sample.pitch,
            instrument: instrument.instrument,
            data: sample.buffer,
            keyRange: [sample.pitch, sample.pitch + 1],
          },
          [sample.buffer] // transfer instead of copy)
        )
      })
    })
  }

  const setupMIDIInput = async () => {
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
  }

  await setup()

  loadMIDIjsSoundFont().catch((e) => console.error(e))
  setupMIDIInput().catch((e) => console.error(e))

  document.getElementById("button-resume")?.addEventListener("click", () => {
    context.resume()
  })

  document.getElementById("open")?.addEventListener("change", (e) => {
    context.resume()
    const reader = new FileReader()
    reader.onload = () => {
      const midi = read(reader.result as ArrayBuffer)
      playMIDI(midi, context.sampleRate, postSynthMessage)
    }
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    reader.readAsArrayBuffer(file!)
  })
}

main().catch((e) => {
  console.error(e)
})
