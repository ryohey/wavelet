import {
  createGeneraterObject,
  getInstrumentGenerators,
  ParseResult,
} from "@ryohey/sf2parser"

export function getInstrumentZones(parsed: ParseResult, instrumentID: number) {
  const instrumentGenerators = getInstrumentGenerators(parsed, instrumentID)
  const zones = instrumentGenerators.map(createGeneraterObject)

  // If the first zone does not have sampleID, it is a global instrument zone.
  let globalZone: any | undefined
  const firstInstrumentZone = zones[0]
  if (firstInstrumentZone.sampleID === undefined) {
    globalZone = zones[0]
  }

  return {
    zones: zones.filter((zone) => zone.sampleID !== undefined),
    globalZone,
  }
}
