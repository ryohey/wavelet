import { SynthEvent } from "@ryohey/wavelet"
import {
  AnyEvent,
  ControllerEvent,
  MIDIControlEvents,
  MidiFile,
} from "midifile-ts"

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

interface RPN {
  rpnMSB?: ControllerEvent
  rpnLSB?: ControllerEvent
  dataMSB?: ControllerEvent
  dataLSB?: ControllerEvent
}

export async function* playMIDI(midi: MidiFile, sampleRate: number) {
  let rpnEvents: { [channel: number]: RPN | undefined } = {}
  let tempo = 120
  let bankSelectMSB: { [channel: number]: number | undefined } = {}

  const handleEvent = (
    e: AnyEvent & Tick,
    delayTime: number
  ): SynthEvent | null => {
    switch (e.type) {
      case "channel":
        switch (e.subtype) {
          case "noteOn":
            return {
              type: "noteOn",
              pitch: e.noteNumber,
              velocity: e.velocity,
              channel: e.channel,
              delayTime,
            }
          case "noteOff":
            return {
              type: "noteOff",
              pitch: e.noteNumber,
              channel: e.channel,
              delayTime,
            }
          case "programChange":
            return {
              type: "programChange",
              channel: e.channel,
              value: e.value,
              delayTime,
            }
          case "pitchBend":
            return {
              type: "pitchBend",
              channel: e.channel,
              value: e.value,
              delayTime,
            }
          case "controller": {
            switch (e.controllerType) {
              case MIDIControlEvents.NONREG_PARM_NUM_MSB:
              case MIDIControlEvents.NONREG_PARM_NUM_LSB: // NRPN LSB
                // Delete the rpn for do not send NRPN data events
                delete rpnEvents[e.channel]
                break
              case MIDIControlEvents.REGIST_PARM_NUM_MSB: {
                if (e.value === 127) {
                  delete rpnEvents[e.channel]
                } else {
                  rpnEvents[e.channel] = {
                    ...rpnEvents[e.channel],
                    rpnMSB: e,
                  }
                }
                break
              }
              case MIDIControlEvents.REGIST_PARM_NUM_LSB: {
                if (e.value === 127) {
                  delete rpnEvents[e.channel]
                } else {
                  rpnEvents[e.channel] = {
                    ...rpnEvents[e.channel],
                    rpnLSB: e,
                  }
                }
                break
              }
              case MIDIControlEvents.MSB_DATA_ENTRY: {
                const rpn = {
                  ...rpnEvents[e.channel],
                  dataMSB: e,
                }
                rpnEvents[e.channel] = rpn

                // In case of pitch bend sensitivity,
                // send without waiting for Data LSB event
                if (rpn.rpnLSB?.value === 0) {
                  return {
                    type: "pitchBendSensitivity",
                    channel: e.channel,
                    value: rpn.dataMSB.value,
                    delayTime,
                  }
                }
                break
              }
              case MIDIControlEvents.LSB_DATA_ENTRY: {
                rpnEvents[e.channel] = {
                  ...rpnEvents[e.channel],
                  dataLSB: e,
                }
                // TODO: Send other RPN events
                break
              }
              case MIDIControlEvents.MSB_MAIN_VOLUME:
                return {
                  type: "mainVolume",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                }
              case MIDIControlEvents.MSB_PAN:
                return {
                  type: "pan",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                }
              case MIDIControlEvents.MSB_EXPRESSION:
                return {
                  type: "expression",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                }
              case MIDIControlEvents.ALL_SOUNDS_OFF:
                return {
                  type: "allSoundsOff",
                  channel: e.channel,
                  delayTime,
                }
              case MIDIControlEvents.SUSTAIN:
                return {
                  type: "hold",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                }
              case MIDIControlEvents.MSB_BANK:
                bankSelectMSB[e.channel] = e.value
                break
              case MIDIControlEvents.LSB_BANK: {
                const msb = bankSelectMSB[e.channel]
                if (msb !== undefined) {
                  const bank = (msb << 7) + e.value
                  return {
                    type: "bankSelect",
                    channel: e.channel,
                    value: bank,
                    delayTime,
                  }
                }
                break
              }
              case MIDIControlEvents.MSB_MODWHEEL:
                return {
                  type: "modulation",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                }
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
