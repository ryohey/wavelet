import { ControllerEvent, MIDIControlEvents } from "midifile-ts"
import { ImmediateEvent, MIDIEventBody } from "../SynthEvent"
import { DistributiveOmit } from "../types"
import { SynthProcessorCore } from "./SynthProcessorCore"
import { logger } from "./logger"

type RPNControllerEvent = DistributiveOmit<ControllerEvent, "deltaTime">

interface RPN {
  rpnMSB?: RPNControllerEvent
  rpnLSB?: RPNControllerEvent
  dataMSB?: RPNControllerEvent
  dataLSB?: RPNControllerEvent
}

export class SynthEventHandler {
  private rpnEvents: { [channel: number]: RPN | undefined } = {}
  private bankSelectMSB: { [channel: number]: number | undefined } = {}

  constructor(private readonly processor: SynthProcessorCore) {}

  handleImmediateEvent(e: ImmediateEvent) {
    switch (e.type) {
      case "sampleParameter":
        this.processor.addSampleParameter(e.parameter, e.range)
        break
      case "loadSample":
        this.processor.addSample(e.data, e.sampleID)
        break
    }
  }

  handleDelayableEvent(e: MIDIEventBody) {
    logger.log("handle delayable event", e)

    switch (e.type) {
      case "channel": {
        switch (e.subtype) {
          case "noteOn":
            this.processor.noteOn(e.channel, e.noteNumber, e.velocity)
            break
          case "noteOff":
            this.processor.noteOff(e.channel, e.noteNumber)
            break
          case "pitchBend":
            this.processor.pitchBend(e.channel, e.value)
            break
          case "programChange":
            this.processor.programChange(e.channel, e.value)
            break
          case "controller": {
            switch (e.controllerType) {
              case MIDIControlEvents.NONREG_PARM_NUM_MSB:
              case MIDIControlEvents.NONREG_PARM_NUM_LSB: // NRPN LSB
                // Delete the rpn for do not send NRPN data events
                delete this.rpnEvents[e.channel]
                break
              case MIDIControlEvents.REGIST_PARM_NUM_MSB: {
                if (e.value === 127) {
                  delete this.rpnEvents[e.channel]
                } else {
                  this.rpnEvents[e.channel] = {
                    ...this.rpnEvents[e.channel],
                    rpnMSB: e,
                  }
                }
                break
              }
              case MIDIControlEvents.REGIST_PARM_NUM_LSB: {
                if (e.value === 127) {
                  delete this.rpnEvents[e.channel]
                } else {
                  this.rpnEvents[e.channel] = {
                    ...this.rpnEvents[e.channel],
                    rpnLSB: e,
                  }
                }
                break
              }
              case MIDIControlEvents.MSB_DATA_ENTRY: {
                const rpn = {
                  ...this.rpnEvents[e.channel],
                  dataMSB: e,
                }
                this.rpnEvents[e.channel] = rpn

                // In case of pitch bend sensitivity,
                // send without waiting for Data LSB event
                if (rpn.rpnLSB?.value === 0) {
                  this.processor.setPitchBendSensitivity(
                    e.channel,
                    rpn.dataMSB.value
                  )
                }
                break
              }
              case MIDIControlEvents.LSB_DATA_ENTRY: {
                this.rpnEvents[e.channel] = {
                  ...this.rpnEvents[e.channel],
                  dataLSB: e,
                }
                // TODO: Send other RPN events
                break
              }
              case MIDIControlEvents.MSB_MAIN_VOLUME:
                this.processor.setMainVolume(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_EXPRESSION:
                this.processor.expression(e.channel, e.value)
                break
              case MIDIControlEvents.ALL_SOUNDS_OFF:
                this.processor.allSoundsOff(e.channel)
                break
              case MIDIControlEvents.ALL_NOTES_OFF:
                this.processor.allNotesOff(e.channel)
                break
              case MIDIControlEvents.SUSTAIN:
                this.processor.hold(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_PAN:
                this.processor.setPan(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_MODWHEEL:
                this.processor.modulation(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_BANK:
                this.bankSelectMSB[e.channel] = e.value
                break
              case MIDIControlEvents.LSB_BANK: {
                const msb = this.bankSelectMSB[e.channel]
                if (msb !== undefined) {
                  const bank = (msb << 7) + e.value
                  this.processor.bankSelect(e.channel, bank)
                }
                break
              }
              case MIDIControlEvents.RESET_CONTROLLERS:
                this.processor.resetChannel(e.channel)
                break
            }
            break
          }
        }
        break
      }
    }
  }
}
