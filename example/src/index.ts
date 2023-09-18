import {
  AudioData,
  audioDataToAudioBuffer,
  CancelMessage,
  getSamplesFromSoundFont,
  OutMessage,
  renderAudio,
  StartMessage,
  SynthEvent,
} from "@ryohey/wavelet"
import { deserialize, MidiFile, read, Stream } from "midifile-ts"
import { encode } from "wav-encoder"
import { MIDIPlayer } from "./MIDIPlayer"
import { midiToSynthEvents } from "./midiToSynthEvents"

const soundFontUrl = "soundfonts/A320U.sf2"

const Sleep = (time: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, time))

const waitForAnimationFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

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
        sample,
        [sample.sample.buffer] // transfer instead of copy
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
  const stopButton = document.getElementById("button-stop")!
  const exampleButton = document.getElementById("button-example")!
  const exportButton = document.getElementById("button-export")!
  const exportPanel = document.getElementById("export-panel")!
  const benchmarkButton = document.getElementById("button-benchmark")!
  const workerBenchmarkButton = document.getElementById(
    "button-benchmark-worker"
  )!

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

  exampleButton.addEventListener("click", async () => {
    const midiData = await (await fetch("/midi/example.mid")).arrayBuffer()
    midi = read(midiData)
    playMIDI(midi)
  })

  playButton.addEventListener("click", () => {
    context.resume()
    midiPlayer?.resume()
  })

  pauseButton.addEventListener("click", () => {
    midiPlayer?.pause()
  })

  stopButton.addEventListener("click", () => {
    midiPlayer?.stop()
  })

  const exportAudio = async (midi: MidiFile, type: "worker" | "mainthread") => {
    if (soundFontData === null) {
      return
    }
    const samples = getSamplesFromSoundFont(
      new Uint8Array(soundFontData),
      context
    )
    const sampleRate = 44100
    const events = midiToSynthEvents(midi, sampleRate)

    const progress = document.createElement("progress")
    progress.value = 0
    exportPanel.appendChild(progress)

    const exportOnMainThread = async () => {
      const cancelButton = document.createElement("button")
      cancelButton.textContent = "cancel"
      let cancel = false
      cancelButton.onclick = () => (cancel = true)
      exportPanel.appendChild(cancelButton)

      const result = await renderAudio(samples, events, {
        sampleRate,
        bufferSize: 256,
        cancel: () => cancel,
        waitForEventLoop: waitForAnimationFrame,
        onProgress: (numFrames, totalFrames) =>
          (progress.value = numFrames / totalFrames),
      })

      cancelButton.remove()

      return result
    }

    const exportOnWorker = () =>
      new Promise<AudioData>((resolve) => {
        if (soundFontData === null) {
          return
        }
        const worker = new Worker("/js/rendererWorker.js")
        const samples = getSamplesFromSoundFont(
          new Uint8Array(soundFontData),
          context
        )
        const sampleRate = 44100
        const events = midiToSynthEvents(midi, sampleRate)
        const message: StartMessage = {
          type: "start",
          samples,
          events,
          sampleRate,
          bufferSize: 128,
        }
        worker.postMessage(message)

        const cancelButton = document.createElement("button")
        cancelButton.textContent = "cancel"
        cancelButton.onclick = () => {
          const message: CancelMessage = {
            type: "cancel",
          }
          worker.postMessage(message)
        }
        exportPanel.appendChild(cancelButton)

        worker.onmessage = async (e: MessageEvent<OutMessage>) => {
          switch (e.data.type) {
            case "progress": {
              progress.value = e.data.numBytes / e.data.totalBytes
              break
            }
            case "complete": {
              progress.remove()
              cancelButton.remove()
              resolve(e.data.audioData)
              break
            }
          }
        }
      })

    let audioData: AudioData

    switch (type) {
      case "mainthread":
        audioData = await exportOnMainThread()
        break
      case "worker":
        audioData = await exportOnWorker()
        break
    }

    progress.remove()

    const audioBuffer = audioDataToAudioBuffer(audioData)

    const wavData = await encode({
      sampleRate: audioBuffer.sampleRate,
      channelData: [
        audioBuffer.getChannelData(0),
        audioBuffer.getChannelData(1),
      ],
    })

    const blob = new Blob([wavData], { type: "audio/wav" })
    const audio = new Audio()
    const url = window.URL.createObjectURL(blob)
    audio.src = url
    audio.controls = true
    exportPanel.appendChild(audio)

    return audioData
  }

  exportButton.addEventListener("click", async () => {
    if (midi === null || soundFontData === null) {
      return
    }
    await exportAudio(midi, "worker")
  })

  const benchmark = async (type: "mainthread" | "worker") => {
    if (soundFontData === null) {
      console.error("SoundFont is not loaded")
      return
    }
    const midiData = await (await fetch("/midi/song.mid")).arrayBuffer()
    const midi = read(midiData)

    exportPanel.innerHTML += "<p>Benchmark test started.</p>"
    const startTime = performance.now()

    const result = await exportAudio(midi, type)

    if (result === undefined) {
      return
    }

    const endTime = performance.now()
    const songLength = result.length / result.sampleRate
    const processTime = endTime - startTime
    exportPanel.innerHTML += `
      <p>Benchmark test completed.</p>
      <ul>
        <li>${
          result.rightData.byteLength + result.leftData.byteLength
        } bytes</li>
        <li>${result.length} frames</li>
        <li>${songLength} seconds</li>
        <li>Take ${processTime} milliseconds</li>
        <li>x${songLength / (processTime / 1000)} speed</li>
      </ul>
    `
  }

  benchmarkButton.addEventListener("click", async () => {
    benchmark("mainthread")
  })

  workerBenchmarkButton.addEventListener("click", async () => {
    benchmark("worker")
  })
}

main().catch((e) => {
  console.error(e)
})
