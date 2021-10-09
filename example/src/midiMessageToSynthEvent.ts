import { SynthEvent } from "@ryohey/wavelet"

export const midiMessageToSynthEvent = (
  data: Uint8Array,
  channel: number
): SynthEvent | null => {
  switch (data[0] & 0xf0) {
    case 0x90:
      return {
        type: "noteOn",
        pitch: data[1],
        velocity: data[2],
        channel,
        delayTime: 0,
      }
    case 0x80:
      return {
        type: "noteOff",
        pitch: data[1],
        channel,
        delayTime: 0,
      }
    case 0xb0:
      switch (data[1]) {
        case 0x07:
          return {
            type: "volume",
            value: data[2],
            channel,
            delayTime: 0,
          }
      }
  }

  // log
  const bytesStr = Array.from(data)
    .map((d) => "0x" + d.toString(16))
    .join(" ")
  console.log("MIDI Event: ", bytesStr)

  return null
}
