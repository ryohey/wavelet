import { AudioData } from "./message"

export const audioDataToAudioBuffer = (audioData: AudioData): AudioBuffer => {
  const audioBuffer = new AudioBuffer({
    length: audioData.length,
    sampleRate: audioData.sampleRate,
    numberOfChannels: 2,
  })
  audioBuffer.copyToChannel(new Float32Array(audioData.leftData), 0)
  audioBuffer.copyToChannel(new Float32Array(audioData.rightData), 1)
  return audioBuffer
}
