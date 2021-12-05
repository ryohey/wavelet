import { LoadSampleEvent, SoundFontSample } from ".."

export const sampleToSynthEvent = (
  sample: SoundFontSample
): LoadSampleEvent => ({
  type: "loadSample",
  sample,
  bank: sample.bank,
  instrument: sample.instrument,
  keyRange: sample.keyRange,
  velRange: sample.velRange,
})
