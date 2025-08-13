type LogLevel = "error" | "warn" | "info" | "debug"

interface LoggerOptions {
  logLevel?: LogLevel
  enableTimestamp?: boolean
}

class Logger {
  private readonly logLevel: LogLevel
  private readonly logLevels: Record<LogLevel, number>
  private readonly enableTimestamp: boolean

  constructor(options: LoggerOptions = {}) {
    this.logLevel = options.logLevel || "info"
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    }
    this.enableTimestamp = options.enableTimestamp !== false
  }

  getTimestamp(): string {
    return new Date().toISOString()
  }

  formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.enableTimestamp ? `[${this.getTimestamp()}] ` : ""
    return `${timestamp}[${level.toUpperCase()}] ${message}`
  }

  shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] <= this.logLevels[this.logLevel]
  }

  error(message: string): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message))
    }
  }

  warn(message: string): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message))
    }
  }

  info(message: string): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message))
    }
  }

  debug(message: string): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message))
    }
  }

  logObject(level: LogLevel, label: string, obj: any): void {
    if (this.shouldLog(level)) {
      const message = `${label}: ${JSON.stringify(obj, null, 2)}`
      switch (level) {
        case "error":
          this.error(message)
          break
        case "warn":
          this.warn(message)
          break
        case "info":
          this.info(message)
          break
        case "debug":
          this.debug(message)
          break
        default:
          this.info(message)
      }
    }
  }
}

const logger = new Logger({ logLevel: (process.env.LOG_LEVEL as LogLevel) || "info" })

export default logger
