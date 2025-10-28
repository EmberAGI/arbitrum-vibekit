/**
 * Integration tests for `agent chat` command
 * Tests client-only chat mode connecting to a running agent
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { chatCommand } from '../src/cli/commands/chat.js';

// Mock dependencies to avoid actual server connections and REPL interaction
vi.mock('../src/cli/chat/client.js', () => ({
  ChatClient: {
    fromUrl: vi.fn().mockResolvedValue({
      getBaseUrl: () => 'http://127.0.0.1:3000',
      sendMessage: vi.fn().mockImplementation(async function* () {
        yield {
          kind: 'artifact-update',
          data: {
            kind: 'artifact-update',
            artifact: {
              artifactId: 'text-1',
              name: 'text-response',
              parts: [{ kind: 'text', text: 'Mock response' }],
            },
          },
        };
        yield {
          kind: 'status-update',
          data: {
            kind: 'status-update',
            final: true,
          },
        };
      }),
    }),
  },
}));

vi.mock('../src/cli/chat/repl.js', () => ({
  ChatRepl: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(0), // Exit code 0
  })),
}));

const { mockStreamRenderer } = vi.hoisted(() => {
  const renderer = vi.fn().mockImplementation(() => ({
    processArtifactUpdate: vi.fn(),
    processStatusUpdate: vi.fn(),
    reset: vi.fn(),
  }));

  return { mockStreamRenderer: renderer };
});

vi.mock('../src/cli/chat/renderer.js', () => ({
  StreamRenderer: mockStreamRenderer,
}));

describe('agent chat command (integration)', () => {
  let tempDir: string;
  let originalLogLevel: string | undefined;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-chat-test-'));
    originalLogLevel = process.env['LOG_LEVEL'];
    originalExit = process.exit;

    // Prevent process.exit from terminating test
    process.exit = vi.fn() as typeof process.exit;

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (originalLogLevel !== undefined) {
      process.env['LOG_LEVEL'] = originalLogLevel;
    } else {
      delete process.env['LOG_LEVEL'];
    }
    process.exit = originalExit;
  });

  describe('connection behavior', () => {
    it('connects to agent at specified URL', async () => {
      // Given: agent URL option
      const url = 'http://localhost:8000';

      // When: running chat command
      await chatCommand({ url });

      // Then: should create client with specified URL
      const { ChatClient } = await import('../src/cli/chat/client.js');
      expect(ChatClient.fromUrl).toHaveBeenCalledWith(url);
    });

    it('uses default URL when not specified', async () => {
      // Given: no URL option
      // When: running chat command
      await chatCommand({});

      // Then: should use default URL
      const { ChatClient } = await import('../src/cli/chat/client.js');
      expect(ChatClient.fromUrl).toHaveBeenCalledWith('http://127.0.0.1:3000');
    });

    it('exits with code 1 on connection failure', async () => {
      // Given: chat command with client that fails to connect
      const { ChatClient } = await import('../src/cli/chat/client.js');
      (ChatClient.fromUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );

      // When: attempting to connect
      await chatCommand({ url: 'http://unreachable:9999' });

      // Then: should exit with error code
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('displays helpful message on connection failure', async () => {
      // Given: mock console output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { ChatClient } = await import('../src/cli/chat/client.js');
      (ChatClient.fromUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('fetch failed'),
      );

      // When: connection fails
      await chatCommand({ url: 'http://localhost:3000' });

      // Then: should display helpful error message
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('Failed to connect');
      expect(errorOutput).toContain('agent run');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('LOG_LEVEL configuration', () => {
    it('sets LOG_LEVEL to ERROR by default', async () => {
      // Given: no respectLogLevel flag
      delete process.env['LOG_LEVEL'];

      // When: running chat command
      await chatCommand({});

      // Then: LOG_LEVEL should be set to ERROR
      expect(process.env['LOG_LEVEL']).toBe('ERROR');
    });

    it('preserves existing LOG_LEVEL when respectLogLevel is true', async () => {
      // Given: existing LOG_LEVEL and respectLogLevel flag
      process.env['LOG_LEVEL'] = 'DEBUG';

      // When: running chat command with respectLogLevel
      await chatCommand({ respectLogLevel: true });

      // Then: LOG_LEVEL should remain DEBUG
      expect(process.env['LOG_LEVEL']).toBe('DEBUG');
    });

    it('overwrites LOG_LEVEL to ERROR when respectLogLevel is false', async () => {
      // Given: existing LOG_LEVEL
      process.env['LOG_LEVEL'] = 'INFO';

      // When: running chat command without respectLogLevel
      await chatCommand({ respectLogLevel: false });

      // Then: LOG_LEVEL should be forced to ERROR
      expect(process.env['LOG_LEVEL']).toBe('ERROR');
    });
  });

  describe('file logging configuration', () => {
    it('sets up file logging when logDir is provided', async () => {
      // Given: logDir option
      const logDir = join(tempDir, 'logs');

      // Mock Logger.setFileSink
      const { Logger } = await import('../src/utils/logger.js');
      const setFileSinkSpy = vi.spyOn(Logger, 'setFileSink').mockResolvedValue();
      const setConsoleEnabledSpy = vi.spyOn(Logger, 'setConsoleEnabled').mockImplementation(() => {});

      // When: running chat command with logDir
      await chatCommand({ logDir });

      // Then: should configure file sink
      expect(setFileSinkSpy).toHaveBeenCalledWith(logDir);

      // And should set structured logging
      expect(process.env['LOG_STRUCTURED']).toBe('true');

      // And should suppress console logs
      expect(setConsoleEnabledSpy).toHaveBeenCalledWith(false);

      setFileSinkSpy.mockRestore();
      setConsoleEnabledSpy.mockRestore();
    });

    it('continues without file logging if sink setup fails', async () => {
      // Given: logDir option and failing setFileSink
      const logDir = join(tempDir, 'invalid-logs');

      const { Logger } = await import('../src/utils/logger.js');
      const setFileSinkSpy = vi
        .spyOn(Logger, 'setFileSink')
        .mockRejectedValue(new Error('Permission denied'));

      // When: running chat command with failing logDir
      // Then: should not throw (gracefully continue)
      await expect(chatCommand({ logDir })).resolves.not.toThrow();

      setFileSinkSpy.mockRestore();
    });

    it('does not set up file logging when logDir is not provided', async () => {
      // Given: no logDir option
      const { Logger } = await import('../src/utils/logger.js');
      const setFileSinkSpy = vi.spyOn(Logger, 'setFileSink').mockResolvedValue();

      // When: running chat command without logDir
      await chatCommand({});

      // Then: should not configure file sink
      expect(setFileSinkSpy).not.toHaveBeenCalled();

      setFileSinkSpy.mockRestore();
    });

    it('creates daily JSONL log files when file logging is enabled', async () => {
      // Given: logDir option and real file sink (not mocked)
      const logDir = join(tempDir, 'logs');

      // When: running chat command with logDir (mock setup only, not full REPL)
      const { Logger } = await import('../src/utils/logger.js');
      await Logger.setFileSink(logDir);
      process.env['LOG_STRUCTURED'] = 'true';

      const log = Logger.getInstance('TEST');
      log.info('test message');

      // Give the stream time to flush
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should create JSONL file with today's date
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const logFilePath = join(logDir, `${today}.jsonl`);
      const logContent = readFileSync(logFilePath, 'utf-8');

      expect(logContent).toContain('test message');
      expect(logContent).toContain('"level":"INFO"');
    });
  });

  describe('renderer configuration', () => {
    it('creates renderer with verbose mode when specified', async () => {
      // Given: verbose option
      mockStreamRenderer.mockClear();

      // When: running chat command with verbose option
      await chatCommand({ verbose: true });

      // Then: renderer should receive verbose=true while keeping colors enabled
      expect(mockStreamRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: true,
          verbose: true,
        }),
      );
    });

    it('creates renderer with inline summary interval when specified', async () => {
      // Given: inlineSummaryInterval option
      const interval = 500;

      // When: running chat command with inline summary interval
      await chatCommand({ inlineSummaryInterval: interval });

      // Then: renderer should be created with specified interval
      expect(mockStreamRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineSummaryInterval: interval,
        }),
      );
    });

    it('enables colors by default', async () => {
      // Given: default options (no explicit color configuration)
      // When: running chat command
      await chatCommand({});

      // Then: renderer should be created with colors enabled
      expect(mockStreamRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: true,
        }),
      );
    });
  });

  describe('REPL integration', () => {
    it('starts REPL with created client and renderer', async () => {
      // Given: chat command setup
      const { ChatRepl } = await import('../src/cli/chat/repl.js');

      // When: running chat command
      await chatCommand({ url: 'http://localhost:3000' });

      // Then: ChatRepl should be instantiated
      expect(ChatRepl).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.anything(),
          renderer: expect.anything(),
          showConnectionInfo: false, // Already shown by chatCommand
        }),
      );

      // And REPL should be started
      const replInstance = (ChatRepl as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(replInstance.start).toHaveBeenCalled();
    });

    it('propagates REPL exit code to process.exit', async () => {
      // Given: REPL that returns specific exit code
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      (ChatRepl as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        start: vi.fn().mockResolvedValue(0),
      }));

      // When: running chat command
      await chatCommand({});

      // Then: should exit with REPL's exit code
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('exits with code 0 on successful completion', async () => {
      // Given: successful REPL completion
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      (ChatRepl as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        start: vi.fn().mockResolvedValue(0),
      }));

      // When: running chat command
      await chatCommand({});

      // Then: should exit with success code
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('error handling', () => {
    it('handles client initialization errors', async () => {
      // Given: client that fails during initialization
      const { ChatClient } = await import('../src/cli/chat/client.js');
      (ChatClient.fromUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Invalid URL'),
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // When: running chat command
      await chatCommand({ url: 'invalid-url' });

      // Then: should log error and exit with code 1
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed'));
      expect(process.exit).toHaveBeenCalledWith(1);

      consoleErrorSpy.mockRestore();
    });

    it('displays connection-specific error messages', async () => {
      // Given: ECONNREFUSED error
      const { ChatClient } = await import('../src/cli/chat/client.js');
      (ChatClient.fromUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('connect ECONNREFUSED'),
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // When: connection is refused
      await chatCommand({ url: 'http://localhost:9999' });

      // Then: should suggest starting agent with `agent run`
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('No agent is running');
      expect(errorOutput).toContain('agent run');

      consoleErrorSpy.mockRestore();
    });

    it('handles fetch-related connection errors', async () => {
      // Given: fetch error
      const { ChatClient } = await import('../src/cli/chat/client.js');
      (ChatClient.fromUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('fetch failed'),
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // When: fetch fails
      await chatCommand({ url: 'http://localhost:3000' });

      // Then: should display helpful message
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('agent run');

      consoleErrorSpy.mockRestore();
    });
  });
});
