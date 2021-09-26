import { read } from "midifile-ts"
import { loadMIDIjsInstruments } from "./MIDI.js/loader"
import { midiMessageToSynthEvent } from "./midiMessageToSynthEvent"
import { playMIDI } from "./playMIDI"
import { loadSoundFontSamples } from "./soundfont/loader"
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
      await context.audioWorklet.addModule("js/processor.js")
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
            sample: {
              name: "",
              pitch: sample.pitch,
              buffer: sample.buffer,
              loop: null,
              sampleStart: 0,
              sampleEnd: sample.buffer.byteLength,
              sampleRate: context.sampleRate,
              scaleTuning: 1,
              amplitudeEnvelope: {
                attackTime: 0,
                decayTime: 0,
                sustainLevel: 1,
                releaseTime: 0,
              },
            },
            bank: 0,
            instrument: instrument.instrument,
            keyRange: [sample.pitch, sample.pitch + 1],
            velRange: [0, 127],
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
      postSynthMessage(
        {
          type: "loadSample",
          sample,
          bank: sample.bank,
          instrument: sample.instrument,
          keyRange: sample.keyRange,
          velRange: [0, 127],
        },
        [sample.buffer] // transfer instead of copy)
      )

      if (false) {
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
  }

  const loadSoundFont = async () => {
    const url = "soundfonts/A320U.sf2"
    for await (const sample of loadSoundFontSamples(
      url,
      context,
      (progress) => {
        const progressElm = document.getElementById(
          "progress"
        ) as HTMLProgressElement
        progressElm.value = progress
      }
    )) {
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

      if (false) {
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
  }

  const channelInput = document.getElementById(
    "channel-input"
  ) as HTMLInputElement

  const setupMIDIInput = async () => {
    const midiAccess = await (navigator as any).requestMIDIAccess({
      sysex: false,
    })

    midiAccess.inputs.forEach((entry: any) => {
      entry.onmidimessage = (event: any) => {
        const channel = parseInt(channelInput.value)
        const e = midiMessageToSynthEvent(event.data, channel)
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
        noteCanvas.matrix[e.channel][e.pitch] = 50
        break
      case "noteOff":
        // noteCanvas.matrix[e.channel][e.pitch] = 0
        break
    }
    noteCanvas.draw()
  }

  await setup()

  // loadMIDIjsSoundFont().catch((e) => console.error(e))
  // loadWaveletSound().catch((e) => console.error(e))
  loadSoundFont().catch((e) => console.error(e))
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
        // drawMidiMessage(e)
      })
    }
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    reader.readAsArrayBuffer(file!)
  })

  document.getElementById("button-test")?.addEventListener("click", () => {
    context.resume()

    const channel = 9

    postSynthMessage({
      type: "programChange",
      value: 0,
      channel,
      delayTime: 0,
    })

    const step = context.sampleRate * 0.5
    let time = 0
    for (let pitch = 12 * 3; pitch < 128; pitch++) {
      postSynthMessage({
        type: "noteOn",
        pitch,
        velocity: 127,
        channel,
        delayTime: time * step,
      })
      postSynthMessage({
        type: "noteOff",
        pitch,
        channel,
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
        type: "programChange",
        value,
        channel: 0,
        delayTime: 0,
      })
    })
  }
}

main().catch((e) => {
  console.error(e)
})
