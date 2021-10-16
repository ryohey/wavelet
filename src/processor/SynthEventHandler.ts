import { DelayableEvent, SynthEvent } from "../SynthEvent"
import { logger } from "./logger"
import { SynthProcessor } from "./SynthProcessor"

type DelayedEvent = DelayableEvent & { receivedFrame: number }

export class SynthEventHandler {
  private processor: SynthProcessor
  private scheduledEvents: DelayedEvent[] = []

  constructor(processor: SynthProcessor) {
    this.processor = processor
  }

  addEvent(e: SynthEvent) {
    logger.log(e)

    if ("delayTime" in e) {
      // handle in process
      this.scheduledEvents.push({ ...e, receivedFrame: currentFrame })
    } else {
      this.handleImmediateEvent(e)
    }
  }

  processScheduledEvents() {
    this.scheduledEvents = this.scheduledEvents.filter((e) => {
      if (e.receivedFrame + e.delayTime <= currentFrame) {
        this.handleDelayableEvent(e)
        return false
      }
      return true
    })
  }

  handleImmediateEvent(e: SynthEvent) {
    switch (e.type) {
      case "loadSample":
        this.processor.loadSample(
          e.sample,
          e.bank,
          e.instrument,
          e.keyRange,
          e.velRange
        )
        break
      case "clearScheduledEvents":
        this.scheduledEvents = []
        break
    }
  }

  handleDelayableEvent(e: DelayableEvent) {
    logger.log("handle delayable event", e)
    switch (e.type) {
      case "noteOn":
        this.processor.noteOn(e.channel, e.pitch, e.velocity)
        break
      case "noteOff":
        this.processor.noteOff(e.channel, e.pitch)
        break
      case "pitchBend":
        this.processor.pitchBend(e.channel, e.value)
        break
      case "volume":
        this.processor.setVolume(e.channel, e.value)
        break
      case "programChange":
        this.processor.programChange(e.channel, e.value)
        break
      case "pitchBendSensitivity":
        this.processor.setPitchBendSensitivity(e.channel, e.value)
        break
      case "mainVolume":
        this.processor.setMainVolume(e.channel, e.value)
        break
      case "expression":
        this.processor.expression(e.channel, e.value)
        break
      case "allSoundsOff":
        this.processor.allSoundsOff(e.channel)
        break
      case "hold":
        this.processor.hold(e.channel, e.value)
        break
      case "pan":
        this.processor.setPan(e.channel, e.value)
        break
      case "bankSelect":
        this.processor.bankSelect(e.channel, e.value)
        break
      case "modulation":
        this.processor.modulation(e.channel, e.value)
        break
    }
  }
}
