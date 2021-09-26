import { logger } from "./logger"

export const addBuffer = (buffer: Float32Array, toBuffer: Float32Array) => {
  for (let i = 0; i < buffer.length; i++) {
    toBuffer[i] += buffer[i]
    const level = toBuffer[i]
    if (level > 1) {
      logger.warn(`clipping level: ${level}`)
    }
  }
}
