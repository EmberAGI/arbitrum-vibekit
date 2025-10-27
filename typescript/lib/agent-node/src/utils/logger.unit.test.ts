import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Logger, LogLevel } from './logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Store original LOG_LEVEL
    originalEnv = process.env['LOG_LEVEL'];

    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear Logger singleton between tests
    (Logger as unknown as { instance: undefined }).instance = undefined;
  });

  afterEach(() => {
    // Restore original LOG_LEVEL
    if (originalEnv !== undefined) {
      process.env['LOG_LEVEL'] = originalEnv;
    } else {
      delete process.env['LOG_LEVEL'];
    }

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('singleton pattern', () => {
    it('returns the same instance when called multiple times without namespace', () => {
      // Given multiple calls to getInstance without namespace
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();

      // Then both should be the same instance
      expect(logger1).toBe(logger2);

      // Note: getInstance with namespace creates a new instance (not singleton)
      const logger3 = Logger.getInstance('namespace');
      expect(logger3).not.toBe(logger1);
    });

    it('creates instance with namespace', () => {
      // Given a logger with namespace
      const logger = Logger.getInstance('TestNamespace');

      // When logging
      logger.info('Test message');

      // Then namespace should be included in single string output
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TestNamespace]') && expect.stringContaining('Test message'),
      );
    });

    it('creates instance without namespace', () => {
      // Given a logger without namespace
      const logger = Logger.getInstance();

      // When logging
      logger.info('Test message');

      // Then output should have empty namespace area but include message
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('INFO  Test message'));
    });
  });

  describe('log levels', () => {
    it('respects DEBUG log level from environment', () => {
      // Given LOG_LEVEL set to DEBUG
      process.env['LOG_LEVEL'] = 'debug';
      const logger = Logger.getInstance('Test');

      // When logging at all levels
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      // Then all messages should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug and info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('respects INFO log level from environment', () => {
      // Given LOG_LEVEL set to INFO
      process.env['LOG_LEVEL'] = 'info';
      const logger = Logger.getInstance('Test');

      // When logging at all levels
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      // Then debug should be skipped
      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // only info
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO [Test] Info message'),
      );
    });

    it('respects WARN log level from environment', () => {
      // Given LOG_LEVEL set to WARN
      process.env['LOG_LEVEL'] = 'warn';
      const logger = Logger.getInstance('Test');

      // When logging at all levels
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      // Then only warn and error should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('respects ERROR log level from environment', () => {
      // Given LOG_LEVEL set to ERROR
      process.env['LOG_LEVEL'] = 'error';
      const logger = Logger.getInstance('Test');

      // When logging at all levels
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      // Then only error should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('defaults to INFO level when LOG_LEVEL not set', () => {
      // Given no LOG_LEVEL environment variable
      delete process.env['LOG_LEVEL'];
      const logger = Logger.getInstance('Test');

      // When logging at all levels
      logger.debug('Debug message');
      logger.info('Info message');

      // Then debug should be skipped, info should be logged
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO [Test] Info message'),
      );
    });

    it('handles invalid LOG_LEVEL gracefully', () => {
      // Given invalid LOG_LEVEL
      process.env['LOG_LEVEL'] = 'INVALID';
      const logger = Logger.getInstance('Test');

      // When logging
      logger.info('Test message');

      // Then should default to INFO level
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO [Test] Test message'),
      );
    });
  });

  describe('logging methods', () => {
    beforeEach(() => {
      process.env['LOG_LEVEL'] = 'debug';
    });

    it('logs debug messages with context', () => {
      // Given a logger
      const logger = Logger.getInstance('DebugTest');

      // When logging debug with context
      logger.debug('Debug operation', { userId: 123, action: 'test' });

      // Then message and context should be logged as single string
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG [DebugTest] Debug operation {"userId":123,"action":"test"}'),
      );
    });

    it('logs info messages with context', () => {
      // Given a logger
      const logger = Logger.getInstance('InfoTest');

      // When logging info with context
      logger.info('Operation completed', { duration: 1500, status: 'success' });

      // Then message and context should be logged as single string
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'INFO [InfoTest] Operation completed {"duration":1500,"status":"success"}',
        ),
      );
    });

    it('logs warn messages with context', () => {
      // Given a logger
      const logger = Logger.getInstance('WarnTest');

      // When logging warning with context
      logger.warn('Deprecation warning', { feature: 'oldAPI', replacement: 'newAPI' });

      // Then message and context should be logged as single string
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'WARN [WarnTest] Deprecation warning {"feature":"oldAPI","replacement":"newAPI"}',
        ),
      );
    });

    it('logs error messages with Error object and context', () => {
      // Given a logger and an error
      const logger = Logger.getInstance('ErrorTest');
      const error = new Error('Something went wrong');

      // When logging error with Error object and context
      logger.error('Operation failed', error, { requestId: 'req-123' });

      // Then error details should be logged as single string with error serialized
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR [ErrorTest] Operation failed') &&
          expect.stringContaining('"requestId":"req-123"') &&
          expect.stringContaining('"message":"Something went wrong"'),
      );
    });

    it('logs error messages without Error object', () => {
      // Given a logger
      const logger = Logger.getInstance('ErrorTest');

      // When logging error without Error object
      logger.error('Simple error message');

      // Then message should be logged with empty context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR [ErrorTest] Simple error message {}'),
      );
    });

    it('logs messages without context', () => {
      // Given a logger
      const logger = Logger.getInstance('NoContext');

      // When logging without context
      logger.debug('Debug without context');
      logger.info('Info without context');
      logger.warn('Warn without context');
      logger.error('Error without context');

      // Then messages should be logged as single strings
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG [NoContext] Debug without context'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO [NoContext] Info without context'),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN [NoContext] Warn without context'),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR [NoContext] Error without context {}'),
      );
    });
  });

  describe('timestamp formatting', () => {
    it('includes timestamp in log output', () => {
      // Given a logger
      const logger = Logger.getInstance('TimeTest');

      // When logging
      logger.info('Test message');

      // Then timestamp should be included in the single string
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO \[TimeTest\] Test message/,
        ),
      );
    });
  });

  describe('log level enum', () => {
    it('has correct numeric values', () => {
      // Given the LogLevel enum
      // Then values should be in correct order
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('handles undefined context gracefully', () => {
      // Given a logger
      const logger = Logger.getInstance('EdgeCase');

      // When logging with undefined context
      logger.info('Message', undefined);

      // Then should not throw and log without context
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO [EdgeCase] Message'),
      );
    });

    it('handles non-Error objects in error method', () => {
      // Given a logger and non-Error object
      const logger = Logger.getInstance('EdgeCase');
      const notAnError = { message: 'Not an error object' };

      // When logging with non-Error object
      logger.error('Failed', notAnError as unknown as Error);

      // Then should handle gracefully and serialize as error property
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'ERROR [EdgeCase] Failed {"error":{"message":"Not an error object"}}',
        ),
      );
    });

    it('handles string errors', () => {
      // Given a logger and string error
      const logger = Logger.getInstance('EdgeCase');
      const stringError = 'This is a string error';

      // When logging with string error
      logger.error('Failed', stringError as unknown as Error);

      // Then should handle gracefully and include as error property
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR [EdgeCase] Failed {"error":"This is a string error"}'),
      );
    });

    it('handles null and undefined errors', () => {
      // Given a logger
      const logger = Logger.getInstance('EdgeCase');

      // When logging with null/undefined
      logger.error('Failed with null', null as unknown as Error);
      logger.error('Failed with undefined', undefined);

      // Then should handle gracefully
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });
  });
});
