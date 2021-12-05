declare module "audio-encoder" {
  function encode(
    audioBuffer: AudioBuffer,
    encoding: "WAV" | number,
    onProgress: (progress: number) => void,
    onComplete: (blob: Blob) => void
  )
}
