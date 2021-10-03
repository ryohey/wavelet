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

function addTick(events: AnyEvent[], track: number): (AnyEvent & Tick)[] {
  let tick = 0
  return events.map((e) => {
    tick += e.deltaTime
    return { ...e, tick, track }
  })
}

const readInterval = 0.5
const lookAheadTime = 0.2

interface RPN {
  rpnMSB: ControllerEvent
  rpnLSB?: ControllerEvent
  dataMSB?: ControllerEvent
  dataLSB?: ControllerEvent
}

export const playMIDI = async (
  midi: MidiFile,
  sampleRate: number,
  postMessage: (e: SynthEvent) => void
) => {
  let rpnEvents: { [track: number]: RPN | undefined } = {}
  let tempo = 120

  const handleEvent = (e: AnyEvent & Tick, delayTime: number) => {
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
                rpnEvents[e.track] = {
                  rpnMSB: e,
                }
                break
              case 100:
                // RPN LSB
                const rpn = rpnEvents[e.track]
                if (rpn === undefined) {
                  console.warn(`invalid RPN`)
                  delete rpnEvents[e.track]
                } else {
                  rpn.rpnLSB = e
                }
                break
              case 6: {
                const rpn = rpnEvents[e.track]
                if (rpn === undefined || rpn.rpnLSB === undefined) {
                  console.warn(`invalid RPN`)
                  delete rpnEvents[e.track]
                } else {
                  rpn.dataMSB = e
                }
                break
              }
              case 38: {
                const rpn = rpnEvents[e.track]
                if (
                  rpn === undefined ||
                  rpn.rpnLSB === undefined ||
                  rpn.dataMSB === undefined
                ) {
                  console.warn(`invalid RPN`)
                  delete rpnEvents[e.track]
                } else {
                  rpn.dataLSB = e

                  // Data MSB
                  switch (rpn.rpnLSB.value) {
                    case 0:
                      // pitch bend sensitivity
                      postMessage({
                        type: "pitchBendSensitivity",
                        channel: e.channel,
                        value: rpn.dataMSB.value,
                        delayTime,
                      })
                      console.log(e)
                      break
                  }

                  delete rpnEvents[e.track]
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
              case 10:
                postMessage({
                  type: "pan",
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
              case 64:
                postMessage({
                  type: "hold",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                })
                break
              default:
                console.warn(`not supported controller event`, e)
                break
            }
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
    handleEvent(e, delayTime)
  }
}
