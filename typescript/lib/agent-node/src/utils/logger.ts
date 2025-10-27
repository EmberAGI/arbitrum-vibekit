/**
 * Centralized logging service for the application
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * LogContext per PRD requirements
 * Supports both free-form context and PRD-required fields
 */
export interface LogContext {
  traceId?: string;
  spanId?: string;
  skillId?: string;
  tool?: string;
  event?: string;
  [key: string]: unknown;
}

// ANSI color codes
const LAVENDER = '\x1b[38;5;105m'; // LightSlateBlue - light blue-purple (rgb 135,135,255)
const RESET = '\x1b[0m';

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private namespace?: string;
  private structured: boolean;

  private constructor(namespace?: string) {
    this.namespace = namespace;
    // Get log level directly from environment to avoid circular dependency with config
    const envLogLevel = (process.env['LOG_LEVEL'] || 'info').toUpperCase();
    this.logLevel =
      envLogLevel && LogLevel[envLogLevel as keyof typeof LogLevel] !== undefined
        ? LogLevel[envLogLevel as keyof typeof LogLevel]
        : LogLevel.INFO;
    this.structured = (process.env['LOG_STRUCTURED'] || 'false').toLowerCase() === 'true';
  }

  static getInstance(namespace?: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    if (namespace) {
      return new Logger(namespace);
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    if (this.structured) {
      // PRD-compliant JSON Lines format
      // Required fields: timestamp, level, traceId, spanId, skillId, tool, event, message, context, error
      const entry = {
        timestamp,
        level,
        traceId: context?.traceId,
        spanId: context?.spanId,
        skillId: context?.skillId,
        tool: context?.tool,
        event: context?.event,
        message,
        ...(this.namespace ? { namespace: this.namespace } : {}),
        ...(context && typeof context === 'object'
          ? {
              context: Object.fromEntries(
                Object.entries(context).filter(
                  ([key]) =>
                    !['traceId', 'spanId', 'skillId', 'tool', 'event', 'error'].includes(key),
                ),
              ),
            }
          : {}),
        ...(context?.['error'] ? { error: context['error'] } : {}),
      };
      return JSON.stringify(entry);
    }
    const prefix = this.namespace ? `[${this.namespace}]` : '';
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `${timestamp} ${level} ${prefix} ${message}${contextStr}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, context));
    }
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorContext: LogContext = {
        ...context,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
      };

      console.error(this.formatMessage('ERROR', message, errorContext));
    }
  }

  /**
   * Creates a child logger with a specific namespace
   */
  child(namespace: string): Logger {
    const fullNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace;
    return new Logger(fullNamespace);
  }

  /**
   * Color a value string in lavender for better visibility
   */
  static colorValue(value: string | number | boolean): string {
    return `${LAVENDER}${value}${RESET}`;
  }

  /**
   * Enable or disable structured JSON logging at runtime
   */
  setStructured(enabled: boolean): void {
    this.structured = enabled;
  }
}

// Export a default logger instance
export const logger = Logger.getInstance();
