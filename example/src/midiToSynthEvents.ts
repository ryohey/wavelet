import { SynthEvent } from "@ryohey/wavelet/src/SynthEvent"
import { AnyEvent, EndOfTrackEvent, MidiFile } from "midifile-ts"

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

export const isEndOfTrackEvent = (e: AnyEvent): e is EndOfTrackEvent =>
  "subtype" in e && e.subtype === "endOfTrack"

const tickToMillisec = (tick: number, bpm: number, timebase: number) =>
  (tick / (timebase / 60) / bpm) * 1000

export const midiToSynthEvents = (
  midi: MidiFile,
  sampleRate: number
): SynthEvent[] => {
  const events = midi.tracks.flatMap(addTick).sort((a, b) => a.tick - b.tick)

  const now = 0
  let bpm = 120

  const synthEvents: SynthEvent[] = []

  // channel イベントを MIDI Output に送信
  // Send Channel Event to MIDI OUTPUT
  for (const e of events) {
    const timestamp = tickToMillisec(e.tick, bpm, midi.header.ticksPerBeat)
    const delayTime = ((timestamp - now) / 1000) * sampleRate

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
            bpm = (60 * 1000000) / e.microsecondsPerBeat
            break
        }
    }
  }

  return synthEvents
}
