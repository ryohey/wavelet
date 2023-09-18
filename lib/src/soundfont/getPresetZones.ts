import { GeneratorParams } from "@ryohey/sf2parser"
import { GeneratorList } from "@ryohey/sf2parser/bin/Structs"

export function getPresetZones(generators: GeneratorList[]) {
  let instrumentsGlobal: Partial<GeneratorParams> = {}
  const instruments: (Partial<GeneratorParams> & { instrument: number })[] = []
  let params: Partial<GeneratorParams> = {}
  let zoneCount = 0

  for (const gen of generators) {
    const type = gen.type

    if (type === undefined) {
      continue
    }

    // keyRange or velRange must be the first of zone
    if (type === "keyRange" || type === "velRange") {
      if (zoneCount === 1 && instruments.length === 0) {
        // treat previous zone as global zone if it is the first zone and not ended with instrument
        instrumentsGlobal = params
      }
      params = {}
      zoneCount++
    }

    // instrument must be the last of zone
    if (type === "instrument") {
      instruments.push({ ...params, instrument: gen.value as number })
    }

    params[type] = gen.value
  }

  return { instruments, instrumentsGlobal }
}
