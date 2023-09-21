import { ImmediateEvent, MIDIEventBody } from "../SynthEvent"
import { SynthEventScheduler } from "./SynthEventScheduler"

describe("SynthEventScheduler", () => {
  it("should schedules events", () => {
    let currentFrame = 0
    let onImmediateEvent = jest.fn((_e: ImmediateEvent) => {})
    let onDelayableEvent = jest.fn((_e: MIDIEventBody) => {})
    const scheduler = new SynthEventScheduler(
      () => currentFrame,
      (e) => onImmediateEvent(e),
      (e) => onDelayableEvent(e)
    )
    scheduler.addEvent({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "noteOn",
        channel: 1,
        noteNumber: 60,
        velocity: 100,
      },
      delayTime: 10,
    })
    scheduler.addEvent({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "noteOff",
        channel: 1,
        noteNumber: 60,
        velocity: 0,
      },
      delayTime: 100,
    })
    scheduler.addEvent({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "noteOn",
        channel: 1,
        noteNumber: 60,
        velocity: 100,
      },
      delayTime: 101, // This event should be ignored in first process
    })
    currentFrame = 100
    scheduler.processScheduledEvents()
    expect(onDelayableEvent.mock.calls.length).toBe(2)
    expect(onDelayableEvent.mock.calls[0][0].subtype).toBe("noteOn")
    expect(onDelayableEvent.mock.calls[1][0].subtype).toBe("noteOff")
  })
})
