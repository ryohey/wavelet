import {
  ImmediateEvent,
  MIDIEvent,
  MIDIEventBody,
  SynthEvent,
} from "../SynthEvent"
import { insertSorted } from "./insertSorted"
import { logger } from "./logger"

type DelayedEvent = MIDIEvent & {
  scheduledFrame: number
  sequenceNumber: number
}

export class SynthEventScheduler {
  private scheduledEvents: DelayedEvent[] = []
  private currentEvents: DelayedEvent[] = []

  constructor(
    private readonly getCurrentFrame: () => number,
    private readonly onImmediateEvent: (e: ImmediateEvent) => void,
    private readonly onDelayableEvent: (e: MIDIEventBody) => void
  ) {}

  private get currentFrame(): number {
    return this.getCurrentFrame()
  }

  addEvent(e: SynthEvent & { sequenceNumber: number }) {
    logger.log(e)

    if ("delayTime" in e) {
      // handle in process
      insertSorted(
        this.scheduledEvents,
        {
          ...e,
          scheduledFrame: this.currentFrame + e.delayTime,
        },
        "scheduledFrame"
      )
    } else {
      this.onImmediateEvent(e)
    }
  }

  processScheduledEvents() {
    if (this.scheduledEvents.length === 0) {
      return
    }

    while (true) {
      const e = this.scheduledEvents[0]
      if (e === undefined || e.scheduledFrame > this.currentFrame) {
        // scheduledEvents are sorted by scheduledFrame,
        // so we can break early instead of iterating through all scheduledEvents,
        break
      }
      this.scheduledEvents.shift()
      this.currentEvents.push(e)
    }

    this.currentEvents.sort(sortEvents)

    while (true) {
      const e = this.currentEvents.shift()
      if (e === undefined) {
        break
      }
      this.onDelayableEvent(e.midi)
    }
  }

  removeScheduledEvents(channel: number) {
    this.scheduledEvents = this.scheduledEvents.filter(
      (e) => e.midi.channel !== channel
    )
    this.currentEvents = this.currentEvents.filter(
      (e) => e.midi.channel !== channel
    )
  }
}

function sortEvents<
  T extends { scheduledFrame: number; sequenceNumber: number }
>(a: T, b: T): number {
  // First, compare by scheduledFrame.
  if (a.scheduledFrame < b.scheduledFrame) {
    return -1
  } else if (a.scheduledFrame > b.scheduledFrame) {
    return 1
  }

  // If scheduledFrame is the same, compare by sequenceNumber.
  if (a.sequenceNumber < b.sequenceNumber) {
    return -1
  } else if (a.sequenceNumber > b.sequenceNumber) {
    return 1
  }

  // If both fields are the same.
  return 0
}
