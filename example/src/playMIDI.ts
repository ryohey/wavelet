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

const readInterval = 0.1
const lookAheadTime = 0.05

export async function* playMIDI(midi: MidiFile, sampleRate: number) {
  let tempo = 120

  const handleEvent = (
    e: AnyEvent & Tick,
    delayTime: number
  ): SynthEvent | null => {
    switch (e.type) {
      case "channel":
        return {
          type: "midi",
          midi: e,
          delayTime,
        }
      case "meta":
        switch (e.subtype) {
          case "setTempo":
            tempo = (60 * 1000000) / e.microsecondsPerBeat
            break
          default:
            console.warn(`not supported meta event`, e)
            break
        }
    }
    return null
  }

  const tickedEvents = midi.tracks
    .flatMap(addTick)
    .sort((a, b) => a.tick - b.tick)

  let waitTime = 0
  let lastEventTick = 0
  let lastEventTime = 0
  let lastWaitTime = performance.now()

  const tickToSec = (tick: number) => {
    const beat = tick / midi.header.ticksPerBeat
    return beat / (tempo / 60)
  }

  while (true) {
    const e = tickedEvents.shift()

    if (e === undefined) {
      break
    }

    const deltaTick = e.tick - lastEventTick
    lastEventTick = e.tick
    const timeInSec = tickToSec(deltaTick) + lastEventTime
    lastEventTime = timeInSec

    if (timeInSec - lastWaitTime / 1000 > readInterval + lookAheadTime) {
      await new Promise((resolve) => setTimeout(resolve, readInterval * 1000))
      const now = performance.now()
      waitTime += (now - lastWaitTime) / 1000
      lastWaitTime = now
    }

    const delayTime = (timeInSec - waitTime) * sampleRate
    const synthEvent = handleEvent(e, delayTime)
    if (synthEvent !== null) {
      yield synthEvent
    }
  }
}
