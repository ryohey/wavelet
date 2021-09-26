export class Logger {
  enabled = true

  log(...args: any) {
    if (this.enabled) {
      console.log(...args)
    }
  }

  warn(...args: any) {
    if (this.enabled) {
      console.warn(...args)
    }
  }

  error(...args: any) {
    if (this.enabled) {
      console.error(...args)
    }
  }
}

export const logger = new Logger()
logger.enabled = false
