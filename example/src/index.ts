import {
  getSamplesFromSoundFont,
  renderAudio,
  SynthEvent,
} from "@ryohey/wavelet"
import { deserialize, MidiFile, read, Stream } from "midifile-ts"
import { MIDIPlayer } from "./MIDIPlayer"
import { midiToSynthEvents } from "./midiToSynthEvents"

const soundFontUrl = "soundfonts/A320U.sf2"

const main = async () => {
  const context = new AudioContext()
  let synth: AudioWorkletNode
  let soundFontData: ArrayBuffer | null = null

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
    soundFontData = await (await fetch(soundFontUrl)).arrayBuffer()
    const parsed = getSamplesFromSoundFont(
      new Uint8Array(soundFontData),
      context
    )

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
        if ("channel" in e) {
          postSynthMessage({ type: "midi", midi: e, delayTime: 0 })
        }
      }
    })
  }

  await setup()

  loadSoundFont().catch((e) => console.error(e))
  setupMIDIInput().catch((e) => console.error(e))

  const fileInput = document.getElementById("open")!
  const playButton = document.getElementById("button-play")!
  const pauseButton = document.getElementById("button-pause")!
  const exportButton = document.getElementById("button-export")!

  const seekbar = document.getElementById("seekbar")! as HTMLInputElement
  seekbar.setAttribute("max", "1")
  seekbar.setAttribute("step", "0.0001")
  seekbar.addEventListener("change", (e) => {
    midiPlayer?.seek(seekbar.valueAsNumber)
  })
  let isSeekbarDragging = false
  seekbar.addEventListener("mousedown", () => {
    isSeekbarDragging = true
  })
  seekbar.addEventListener("mouseup", () => {
    isSeekbarDragging = false
  })

  let midiPlayer: MIDIPlayer | null = null
  let midi: MidiFile | null = null

  const playMIDI = (midi: MidiFile) => {
    midiPlayer?.pause()
    context.resume()
    midiPlayer = new MIDIPlayer(midi, context.sampleRate, postSynthMessage)
    midiPlayer.onProgress = (progress) => {
      if (!isSeekbarDragging) {
        seekbar.valueAsNumber = progress
      }
    }
    midiPlayer?.resume()
  }

  fileInput.addEventListener("change", (e) => {
    context.resume()
    const reader = new FileReader()
    reader.onload = async () => {
      midi = read(reader.result as ArrayBuffer)
      playMIDI(midi)
    }
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    reader.readAsArrayBuffer(file!)
  })

  playButton.addEventListener("click", () => {
    context.resume()
    midiPlayer?.resume()
  })

  pauseButton.addEventListener("click", () => {
    midiPlayer?.pause()
  })

  exportButton.addEventListener("click", async () => {
    if (midi === null || soundFontData === null) {
      return
    }
    const events = midiToSynthEvents(midi, sampleRate)
    const audioBuffer = await renderAudio(soundFontData, context, events, 44100)
    const source = context.createBufferSource()
    source.buffer = audioBuffer
    source.connect(context.destination)
    source.start()
  })
}

main().catch((e) => {
  console.error(e)
})
