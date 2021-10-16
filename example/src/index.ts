import { getSamplesFromSoundFont, SynthEvent } from "@ryohey/wavelet"
import { deserialize, read, Stream } from "midifile-ts"
import { playMIDI } from "./playMIDI"

const main = async () => {
  const context = new AudioContext()
  let synth: AudioWorkletNode

  const setup = async () => {
    try {
      await context.audioWorklet.addModule("js/processor.js")
    } catch (e) {
      console.error("Failed to add AudioWorklet module", e)
    }
    synth = new AudioWorkletNode(context, "synth-processor", {
      numberOfInputs: 0,
      outputChannelCount: [2],
    } as any)
    synth.connect(context.destination)
  }

  const postSynthMessage = (e: SynthEvent, transfer?: Transferable[]) => {
    synth.port.postMessage(e, transfer ?? [])
  }

  const loadSoundFont = async () => {
    const url = "soundfonts/A320U.sf2"

    const data = await (await fetch(url)).arrayBuffer()
    const parsed = getSamplesFromSoundFont(new Uint8Array(data), context)

    for (const sample of parsed) {
      postSynthMessage(
        {
          type: "loadSample",
          sample,
          bank: sample.bank,
          instrument: sample.instrument,
          keyRange: sample.keyRange,
          velRange: sample.velRange,
        },
        [sample.buffer] // transfer instead of copy)
      )
    }
  }

  const setupMIDIInput = async () => {
    const midiAccess = await (navigator as any).requestMIDIAccess({
      sysex: false,
    })

    midiAccess.inputs.forEach((entry: any) => {
      entry.onmidimessage = (event: any) => {
        const e = deserialize(new Stream(event.data), 0, () => {})
        postSynthMessage({ type: "midi", midi: e, delayTime: 0 })
      }
    })
  }

  await setup()

  loadSoundFont().catch((e) => console.error(e))
  setupMIDIInput().catch((e) => console.error(e))

  document.getElementById("button-resume")?.addEventListener("click", () => {
    context.resume()
  })

  document.getElementById("open")?.addEventListener("change", (e) => {
    context.resume()
    const reader = new FileReader()
    reader.onload = async () => {
      const midi = read(reader.result as ArrayBuffer)
      for await (const e of playMIDI(midi, context.sampleRate)) {
        postSynthMessage(e)
      }
    }
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    reader.readAsArrayBuffer(file!)
  })

  document.getElementById("button-test")?.addEventListener("click", () => {
    context.resume()

    const channel = 0

    postSynthMessage({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "programChange",
        value: 0,
        channel,
      },
      delayTime: 0,
    })

    const step = context.sampleRate * 5
    let time = 0
    for (let noteNumber = 12 * 3; noteNumber < 128; noteNumber++) {
      postSynthMessage({
        type: "midi",
        midi: {
          type: "channel",
          subtype: "noteOn",
          noteNumber,
          velocity: 127,
          channel,
        },
        delayTime: time * step,
      })
      postSynthMessage({
        type: "midi",
        midi: {
          type: "channel",
          subtype: "noteOff",
          noteNumber,
          velocity: 0,
          channel,
        },
        delayTime: (time + 1) * step,
      })
      time++
    }
  })

  {
    const programSelect = document.getElementById(
      "program-select"
    ) as HTMLSelectElement
    for (let i = 0; i < 128; i++) {
      const option = document.createElement("option")
      option.value = i.toString()
      option.text = i.toString()
      programSelect.appendChild(option)
    }
    programSelect.addEventListener("change", (e) => {
      const value = parseInt(programSelect.value)
      postSynthMessage({
        type: "midi",
        midi: {
          type: "channel",
          subtype: "programChange",
          value,
          channel: 0,
        },
        delayTime: 0,
      })
    })
  }
}

main().catch((e) => {
  console.error(e)
})
