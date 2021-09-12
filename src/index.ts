import { MidiFile, read } from "midifile-ts"

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

  const getSampleUrls = () => {
    const baseUrl = "/midi-js-soundfonts/MusyngKite/clarinet-mp3/"
    const ext = ".mp3"
    const keys = [
      "C",
      "Db",
      "D",
      "Eb",
      "E",
      "F",
      "Gb",
      "G",
      "Ab",
      "A",
      "Bb",
      "B",
    ]
    return [1, 2, 3, 4, 5, 6, 7].flatMap((oct) =>
      keys.map((key) => `${baseUrl}${key}${oct}${ext}`)
    )
  }

  const createKeyButton = (pitch: number) => {
    const elm = document.createElement("button")
    elm.textContent = pitch.toString()
    elm.onpointerdown = () => {
      noteOn(pitch)
    }
    elm.onpointerup = () => {
      noteOff(pitch)
    }

    const keyContainer = document.getElementById("keys")
    keyContainer?.appendChild(elm)
  }

  const loadSample = async (url: string, pitch: number) => {
    const req = await fetch(url)
    const audioData = await req.arrayBuffer()
    console.log(`loaded sample for pitch ${pitch} from ${url}`)
    context.decodeAudioData(audioData, (buffer) => {
      const data = buffer.getChannelData(0)
      synth.port.postMessage({ type: "loadSample", pitch, data })
    })
  }

  const noteOn = (
    pitch: number,
    velocity = 100,
    channel = 0,
    delayTime = 0
  ) => {
    context.resume()
    synth.port.postMessage({
      type: "noteOn",
      pitch,
      velocity,
      delayTime,
      channel,
    })
  }

  const noteOff = (pitch: number, channel = 0, delayTime = 0) => {
    synth.port.postMessage({
      type: "noteOff",
      pitch,
      delayTime,
      channel,
    })
  }

  const pitchBend = (value: number, channel = 0, delayTime = 0) => {
    synth.port.postMessage({
      type: "pitchBend",
      value,
      delayTime,
      channel,
    })
  }

  const volume = (value: number, channel = 0, delayTime = 0) => {
    synth.port.postMessage({
      type: "volume",
      value,
      delayTime,
      channel,
    })
  }

  await setup()

  let pitch = 0
  for await (let url of getSampleUrls()) {
    await loadSample(url, pitch++)
    createKeyButton(pitch)
  }

  document.getElementById("button-bend-0")?.addEventListener("click", () => {
    pitchBend(1)
  })

  document.getElementById("button-bend-1")?.addEventListener("click", () => {
    pitchBend(1.1)
  })

  document.getElementById("button-bend-5")?.addEventListener("click", () => {
    pitchBend(1.5)
  })

  document.getElementById("button-bend-20")?.addEventListener("click", () => {
    pitchBend(2)
  })

  document.getElementById("button-resume")?.addEventListener("click", () => {
    context.resume()
  })

  const playMIDI = (midi: MidiFile) => {
    const tempo = 120 // beatPerMinutes

    const tickToFrameTime = (tick: number) => {
      const beat = tick / midi.header.ticksPerBeat
      const sec = beat / (tempo / 60)
      return context.sampleRate * sec
    }

    midi.tracks.forEach((events) => {
      let time = 0
      events.forEach((e) => {
        time += e.deltaTime
        const delayTime = tickToFrameTime(time)
        if (e.type === "channel") {
          switch (e.subtype) {
            case "noteOn":
              noteOn(e.noteNumber, e.velocity, e.channel, delayTime)
              break
            case "noteOff":
              noteOff(e.noteNumber, e.channel, delayTime)
              break
          }
        }
      })
    })
  }

  document.getElementById("open")?.addEventListener("change", (e) => {
    const reader = new FileReader()
    reader.onload = () => {
      const midi = read(reader.result as ArrayBuffer)
      playMIDI(midi)
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
        switch (event.data[0] & 0xf0) {
          case 0x90:
            noteOn(event.data[1], event.data[2])
            break
          case 0x80:
            noteOff(event.data[1])
            break
          case 0xb0:
            switch (event.data[1]) {
              case 0x07:
                volume(event.data[2])
                break
            }
        }

        const bytesStr = Array.from(event.data as Int8Array)
          .map((d) => "0x" + d.toString(16))
          .join(" ")
        console.log("MIDI Event: ", bytesStr)
      }
    })
  } catch (e) {
    console.error(e)
  }
}

main().catch((e) => {
  console.error(e)
})
