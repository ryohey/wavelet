import { AnyEvent, ControllerEvent, MidiFile } from "midifile-ts"
import { SynthEvent } from "./SynthEvent"

interface State {
  tempo: number
  readonly sampleRate: number
  readonly ticksPerBeat: number
}

interface Tick {
  tick: number
  track: number
}

function addTick(track: AnyEvent[]): (AnyEvent & Tick)[] {
  let tick = 0
  return track.map((e, track) => {
    tick += e.deltaTime
    return { ...e, tick, track }
  })
}

const readInterval = 0.5
const lookAheadTime = 0.2

export const playMIDI = async (
  midi: MidiFile,
  sampleRate: number,
  postMessage: (e: SynthEvent) => void
) => {
  const tickedEvents = midi.tracks
    .flatMap(addTick)
    .sort((a, b) => b.tick - a.tick)

  let waitTime = 0
  let lastEventTick = 0
  let lastEventTime = 0
  let lastWaitTime = performance.now()
  let lastControllerEvents: { [track: number]: ControllerEvent | null } = {}
  let tempo = 120

  const tickToSec = (tick: number) => {
    const beat = tick / midi.header.ticksPerBeat
    return beat / (tempo / 60)
  }

  while (true) {
    const e = tickedEvents.pop()

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
          case "pitchBend":
            postMessage({
              type: "pitchBend",
              channel: e.channel,
              value: e.value,
              delayTime,
            })
            break
          case "controller": {
            switch (e.controllerType) {
              case 101:
                break
              case 100:
                if (lastControllerEvents[e.track]?.controllerType !== 101) {
                  console.warn(`invalid RPN`)
                }
                break
              case 6: {
                switch (lastControllerEvents[e.track]?.controllerType) {
                  case 0:
                    // pitch bend sensitivity
                    postMessage({
                      type: "pitchBendSensitivity",
                      channel: e.channel,
                      value: e.value,
                      delayTime,
                    })
                    console.log(e)
                    break
                }
                break
              }
              case 7:
                postMessage({
                  type: "mainVolume",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                })
                break
              case 11:
                postMessage({
                  type: "expression",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                })
                break
              case 120:
                postMessage({
                  type: "allSoundsOff",
                  channel: e.channel,
                  delayTime,
                })
                break
              default:
                console.warn(`not supported controller event`, e)
                break
            }
            lastControllerEvents[e.track] = e
            break
          }
          default:
            console.warn(`not supported channel event`, e)
            break
        }
        break
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
  }
}
