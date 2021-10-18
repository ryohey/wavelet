import { getSamplesFromSoundFont, SynthEvent } from "@ryohey/wavelet"
import { deserialize, MidiFile, read, Stream } from "midifile-ts"
import { MIDIPlayer } from "./MIDIPlayer"

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

  const fileInput = document.getElementById("open")!
  const playButton = document.getElementById("button-play")!
  const pauseButton = document.getElementById("button-pause")!
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
      const midi = read(reader.result as ArrayBuffer)
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
}

main().catch((e) => {
  console.error(e)
})
