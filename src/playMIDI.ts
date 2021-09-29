import { AnyEvent, ControllerEvent, MidiFile } from "midifile-ts"
import { SynthEvent } from "./SynthEvent"

interface State {
  tempo: number
  readonly sampleRate: number
  readonly ticksPerBeat: number
}

async function* playMIDITrack(
  track: AnyEvent[],
  state: State,
  readInterval = 0.5,
  lookAheadTime = 0.2
): AsyncGenerator<SynthEvent> {
  const tickToSec = (tick: number) => {
    const beat = tick / state.ticksPerBeat
    return beat / (state.tempo / 60)
  }

  const tickToFrameTime = (tick: number) => {
    return state.sampleRate * tickToSec(tick)
  }

  const secToTick = (sec: number) => {
    const beat = sec * (state.tempo / 60)
    return beat * state.ticksPerBeat
  }

  let time = 0
  let lastTime = performance.now()
  let lastControllerEvent: ControllerEvent | null = null

  for await (const e of track) {
    time += e.deltaTime

    if (tickToSec(time) > readInterval + lookAheadTime) {
      await new Promise((resolve) => setTimeout(resolve, readInterval * 1000))
      const now = performance.now()
      time -= secToTick((now - lastTime) / 1000)
      lastTime = now
    }

    const delayTime = tickToFrameTime(time)

    switch (e.type) {
      case "channel":
        switch (e.subtype) {
          case "noteOn":
            yield {
              type: "noteOn",
              pitch: e.noteNumber,
              velocity: e.velocity,
              channel: e.channel,
              delayTime,
            }
            break
          case "noteOff":
            yield {
              type: "noteOff",
              pitch: e.noteNumber,
              channel: e.channel,
              delayTime,
            }
            break
          case "programChange":
            yield {
              type: "programChange",
              channel: e.channel,
              value: e.value,
              delayTime,
            }
            break
          case "pitchBend":
            yield {
              type: "pitchBend",
              channel: e.channel,
              value: e.value,
              delayTime,
            }
            break
          case "controller": {
            switch (e.controllerType) {
              case 101:
                break
              case 100:
                if (lastControllerEvent?.controllerType !== 101) {
                  console.warn(`invalid RPN`)
                }
                break
              case 6: {
                switch (lastControllerEvent?.controllerType) {
                  case 0:
                    // pitch bend sensitivity
                    yield {
                      type: "pitchBendSensitivity",
                      channel: e.channel,
                      value: e.value,
                      delayTime,
                    }
                    console.log(e)
                    break
                }
                break
              }
              case 7:
                yield {
                  type: "mainVolume",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                }
                break
              case 11:
                yield {
                  type: "expression",
                  channel: e.channel,
                  value: e.value,
                  delayTime,
                }
                break
              case 120:
                yield {
                  type: "allSoundsOff",
                  channel: e.channel,
                  delayTime,
                }
                break
              default:
                console.warn(`not supported controller event`, e)
                break
            }
            lastControllerEvent = e
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
            state.tempo = (60 * 1000000) / e.microsecondsPerBeat
            break
          default:
            console.warn(`not supported meta event`, e)
            break
        }
    }
  }
}

export const playMIDI = (
  midi: MidiFile,
  sampleRate: number,
  postMessage: (e: SynthEvent) => void
) => {
  const state: State = {
    tempo: 120,
    sampleRate,
    ticksPerBeat: midi.header.ticksPerBeat,
  }

  midi.tracks.forEach(async (t) => {
    for await (const event of playMIDITrack(t, state)) {
      postMessage(event)
    }
  })
}
