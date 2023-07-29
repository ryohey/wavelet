import { SynthEvent } from "@ryohey/wavelet"
import { AnyEvent, MidiFile } from "midifile-ts"

interface Tick {
  tick: number
  track: number
}

function addTick(events: AnyEvent[], track: number): (AnyEvent & Tick)[] {
  let tick = 0
  return events.map((e) => {
    tick += e.deltaTime
    return { ...e, tick, track }
  })
}

const tickToMillisec = (tick: number, bpm: number, timebase: number) =>
  (tick / (timebase / 60) / bpm) * 1000

interface Keyframe {
  tick: number
  bpm: number
  timestamp: number
}

export const midiToSynthEvents = (
  midi: MidiFile,
  sampleRate: number
): SynthEvent[] => {
  const events = midi.tracks.flatMap(addTick).sort((a, b) => a.tick - b.tick)
  let keyframe: Keyframe = {
    tick: 0,
    bpm: 120,
    timestamp: 0,
  }

  const synthEvents: SynthEvent[] = []

  // channel イベントを MIDI Output に送信
  // Send Channel Event to MIDI OUTPUT
  for (const e of events) {
    const timestamp =
      tickToMillisec(
        e.tick - keyframe.tick,
        keyframe.bpm,
        midi.header.ticksPerBeat
      ) + keyframe.timestamp
    const delayTime = (timestamp * sampleRate) / 1000

    switch (e.type) {
      case "channel":
        synthEvents.push({
          type: "midi",
          midi: e,
          delayTime,
        })
      case "meta":
        switch (e.subtype) {
          case "setTempo":
            keyframe = {
              tick: e.tick,
              bpm: (60 * 1000000) / e.microsecondsPerBeat,
              timestamp,
            }
            break
        }
    }
  }

  return synthEvents
}
