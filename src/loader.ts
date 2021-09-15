const keys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

// 0: C-1 ~ 127: G9
export const getKeyName = (pitch: number) => {
  const oct = Math.floor(pitch / 12) - 1
  return `${keys[pitch % 12]}${oct}`
}

// C-1: 0
export const getPitch = (keyName: string) => {
  const octStr = keyName.replaceAll(/[A-Gb]/gm, "")
  const oct = parseInt(octStr)
  const keyStr = keyName.replace(octStr, "")
  const key = keys.indexOf(keyStr)
  return oct * 12 + key
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

export const getSampleJSUrl = (baseUrl: string, instrument: string) => {
  return `${baseUrl}${instrument}-mp3.js`
}
