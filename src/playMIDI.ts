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
  rpnMSB?: ControllerEvent
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
              case 98: // NRPN MSB
              case 98: // NRPN LSB
                // Delete the rpn for do not send NRPN data events
                delete rpnEvents[e.track]
                break
              case 101: {
                // RPN MSB
                if (e.value === 127) {
                  delete rpnEvents[e.track]
                } else {
                  rpnEvents[e.track] = {
                    ...rpnEvents[e.track],
                    rpnMSB: e,
                  }
                }
                break
              }
              case 100: {
                // RPN LSB
                if (e.value === 127) {
                  delete rpnEvents[e.track]
                } else {
                  rpnEvents[e.track] = {
                    ...rpnEvents[e.track],
                    rpnLSB: e,
                  }
                }
                break
              }
              case 6: {
                // Data MSB
                const rpn = {
                  ...rpnEvents[e.track],
                  dataMSB: e,
                }
                rpnEvents[e.track] = rpn

                // In case of pitch bend sensitivity,
                // send without waiting for Data LSB event
                if (rpn.rpnLSB?.value === 0) {
                  postMessage({
                    type: "pitchBendSensitivity",
                    channel: e.channel,
                    value: rpn.dataMSB.value,
                    delayTime,
                  })
                }
                break
              }
              case 38: {
                // Data LSB
                rpnEvents[e.track] = {
                  ...rpnEvents[e.track],
                  dataLSB: e,
                }
                // TODO: Send other RPN events
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
