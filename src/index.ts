import { read } from "midifile-ts"
import { loadMIDIjsInstruments } from "./MIDI.js/loader"
import { midiMessageToSynthEvent } from "./midiMessageToSynthEvent"
import { playMIDI } from "./playMIDI"
import * as SynthEvent from "./SynthEvent"
import { loadWaveletSamples } from "./wavelet/loader"

class MatrixCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private valueToColor: (value: number) => string

  readonly matrix = Array.from({ length: 128 }, () =>
    Array.from({ length: 128 }, () => 0)
  )

  constructor(
    canvas: HTMLCanvasElement,
    valueToColor: (value: number) => string
  ) {
    this.canvas = canvas
    this.valueToColor = valueToColor
    const ctx = canvas.getContext("2d")
    if (ctx === null) {
      throw new Error("Failed to getContext")
    }
    this.ctx = ctx
  }

  draw() {
    const { canvas, ctx, matrix } = this
    const scale = window.devicePixelRatio
    const width = canvas.width * scale
    const height = canvas.height * scale
    const cellWidth = width / matrix[0].length
    const cellHeight = (height * scale) / matrix.length
    ctx.clearRect(0, 0, width, height)
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        ctx.fillStyle = this.valueToColor(value)
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight)
      })
    })
  }
}

const loadStateCanvas = new MatrixCanvas(
  document.getElementById("load-canvas") as HTMLCanvasElement,
  (value) => `rgba(0, 255, 0, ${value / 3})`
)

const noteCanvas = new MatrixCanvas(
  document.getElementById("note-canvas") as HTMLCanvasElement,
  (value) => `rgba(0, 0, 255, ${value / 127})`
)

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

  const loadWaveletSound = async () => {
    const url = "soundfonts/A320U/A320U.txt"

    for await (const sample of loadWaveletSamples(url, context, (progress) => {
      const progressElm = document.getElementById(
        "progress"
      ) as HTMLProgressElement
      progressElm.value = progress
    })) {
      if (sample.bank !== 0) {
        console.log("ignore", sample)
        continue
      }
      postSynthMessage(
        {
          type: "loadSample",
          pitch: sample.pitch,
          instrument: sample.instrument,
          data: sample.buffer,
          keyRange: sample.keyRange,
        },
        [sample.buffer] // transfer instead of copy)
      )

      for (
        let pitch = sample.keyRange[0];
        pitch <= sample.keyRange[1];
        pitch++
      ) {
        loadStateCanvas.matrix[sample.instrument][pitch]++
      }

      loadStateCanvas.draw()
    }
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
          drawMidiMessage(e)
        }
      }
    })
  }

  const drawMidiMessage = (e: SynthEvent.SynthEvent) => {
    switch (e.type) {
      case "noteOn":
        noteCanvas.matrix[e.channel][e.pitch] = 127
        break
      case "noteOff":
        // noteCanvas.matrix[e.channel][e.pitch] = 0
        break
    }
    noteCanvas.draw()
  }

  await setup()

  // loadMIDIjsSoundFont().catch((e) => console.error(e))
  loadWaveletSound().catch((e) => console.error(e))
  setupMIDIInput().catch((e) => console.error(e))

  document.getElementById("button-resume")?.addEventListener("click", () => {
    context.resume()
  })

  document.getElementById("open")?.addEventListener("change", (e) => {
    context.resume()
    const reader = new FileReader()
    reader.onload = () => {
      const midi = read(reader.result as ArrayBuffer)
      playMIDI(midi, context.sampleRate, (e: SynthEvent.SynthEvent) => {
        postSynthMessage(e)
        drawMidiMessage(e)
      })
    }
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    reader.readAsArrayBuffer(file!)
  })
}

main().catch((e) => {
  console.error(e)
})
