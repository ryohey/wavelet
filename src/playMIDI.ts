import { MidiFile } from "midifile-ts"
import { SynthEvent } from "./SynthEvent"

export const playMIDI = (
  midi: MidiFile,
  sampleRate: number,
  postMessage: (e: SynthEvent) => void
) => {
  let tempo = 120 // beatPerMinutes

  const tickToFrameTime = (tick: number) => {
    const beat = tick / midi.header.ticksPerBeat
    const sec = beat / (tempo / 60)
    return sampleRate * sec
  }

  midi.tracks.forEach((events) => {
    let time = 0
    events.forEach((e) => {
      time += e.deltaTime
      const delayTime = tickToFrameTime(time)
      switch (e.type) {
        case "channel":
          switch (e.subtype) {
            case "noteOn":
              postMessage({
                type: "noteOn",
                pitch: e.noteNumber,
                velocity: e.velocity,
                channel: e.channel,
                delayTime,
              })
              break
            case "noteOff":
              postMessage({
                type: "noteOff",
                pitch: e.noteNumber,
                channel: e.channel,
                delayTime,
              })
              break
            case "programChange":
              postMessage({
                type: "programChange",
                channel: e.channel,
                value: e.value,
                delayTime,
              })
              break
          }
        case "meta":
          switch (e.subtype) {
            case "setTempo":
              tempo = (60 * 1000000) / e.microsecondsPerBeat
              break
          }
      }
    })
  })
}
