// 0: C-1 ~ 127: G9
const getKeyName = (pitch: number) => {
  const keys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
  const oct = Math.floor(pitch / 12) - 1
  return `${keys[pitch % 12]}${oct}`
}

export const getSampleUrl = (
  baseUrl: string,
  instrument: string,
  pitch: number
) => {
  const ext = ".mp3"
  const key = getKeyName(pitch)
  return `${baseUrl}${instrument}-mp3/${key}${ext}`
}
