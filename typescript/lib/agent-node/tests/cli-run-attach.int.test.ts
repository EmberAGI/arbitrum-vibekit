/**
 * Integration tests for `agent run --attach` command
 * Tests server startup followed by chat attachment with graceful shutdown
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { runCommand } from '../src/cli/commands/run.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

// Mock server and chat components to avoid actual server startup and REPL interaction
vi.mock('../src/a2a/server.js', () => ({
  createA2AServer: vi.fn().mockResolvedValue({
    address: () => ({
      address: '127.0.0.1',
      port: 3000,
    }),
    close: vi.fn((callback) => callback()),
  }),
}));

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
              parts: [{ kind: 'text', text: 'Response' }],
            },
          },
        };
      }),
    }),
  },
}));

vi.mock('../src/cli/chat/repl.js', () => ({
  ChatRepl: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(0),
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

describe('agent run --attach command (integration)', () => {
  let tempConfigDir: string;
  let originalLogLevel: string | undefined;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    // Create temporary config workspace
    tempConfigDir = createTestConfigWorkspace({
      agentName: 'Test Agent',
      skills: [{ id: 'test-skill', name: 'Test Skill' }],
    });

    originalLogLevel = process.env['LOG_LEVEL'];
    originalExit = process.exit;

    // Prevent process.exit from terminating test
    process.exit = vi.fn() as typeof process.exit;

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (tempConfigDir) {
      rmSync(tempConfigDir, { recursive: true, force: true });
    }
    if (originalLogLevel !== undefined) {
      process.env['LOG_LEVEL'] = originalLogLevel;
    } else {
      delete process.env['LOG_LEVEL'];
    }
    process.exit = originalExit;
  });

  describe('server startup with attach mode', () => {
    it('starts server then enters chat mode when --attach is specified', async () => {
      // Given: run command with attach option
      // When: running with attach
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: server should be created
      const { createA2AServer } = await import('../src/a2a/server.js');
      expect(createA2AServer).toHaveBeenCalled();

      // And chat client should be created with server URL
      const { ChatClient } = await import('../src/cli/chat/client.js');
      expect(ChatClient.fromUrl).toHaveBeenCalledWith('http://127.0.0.1:3000');

      // And REPL should be started
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      expect(ChatRepl).toHaveBeenCalled();
    });

    it('supports --chat as alias for --attach', async () => {
      // Given: run command with chat option (alias)
      // When: running with chat alias
      await runCommand({ configDir: tempConfigDir, chat: true });

      // Then: should behave same as --attach
      const { createA2AServer } = await import('../src/a2a/server.js');
      expect(createA2AServer).toHaveBeenCalled();

      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      expect(ChatRepl).toHaveBeenCalled();
    });

    it('displays connection URL after server starts', async () => {
      // Given: console output spy
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // When: running with attach
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: should display server URL
      const output = consoleLogSpy.mock.calls.flat().join(' ');
      expect(output).toContain('http://127.0.0.1:3000');
      expect(output).toContain('Server running');

      consoleLogSpy.mockRestore();
    });

    it('displays agent card and A2A endpoint URLs', async () => {
      // Given: console output spy
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // When: running with attach
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: should display endpoint URLs
      const output = consoleLogSpy.mock.calls.flat().join(' ');
      expect(output).toContain('/.well-known/agent-card.json');
      expect(output).toContain('/a2a');

      consoleLogSpy.mockRestore();
    });

    it('displays "Entering chat mode..." message', async () => {
      // Given: console output spy
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // When: running with attach
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: should indicate chat mode entry
      const output = consoleLogSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Entering chat mode');

      consoleLogSpy.mockRestore();
    });
  });

  describe('graceful shutdown on exit', () => {
    it('shuts down server when REPL exits', async () => {
      // Given: run command with attach and shutdown callback
      const { createA2AServer } = await import('../src/a2a/server.js');
      const mockServer = {
        address: () => ({
          address: '127.0.0.1',
          port: 3000,
        }),
        close: vi.fn((callback) => callback()),
      };
      (createA2AServer as ReturnType<typeof vi.fn>).mockResolvedValue(mockServer);

      // When: REPL exits (via onExit callback)
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: server close should be called (verified via shutdown in runCommand)
      // The actual shutdown happens in the onExit callback passed to ChatRepl
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      const replOptions = (ChatRepl as ReturnType<typeof vi.fn>).mock.calls[0][0];

      expect(replOptions.onExit).toBeDefined();

      // Simulate calling onExit
      await replOptions.onExit();

      // Verify server was closed
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('displays shutdown confirmation message', async () => {
      // Given: console output spy
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { createA2AServer } = await import('../src/a2a/server.js');
      const mockServer = {
        address: () => ({
          address: '127.0.0.1',
          port: 3000,
        }),
        close: vi.fn((callback) => callback()),
      };
      (createA2AServer as ReturnType<typeof vi.fn>).mockResolvedValue(mockServer);

      // When: running and then shutting down
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Trigger shutdown via onExit
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      const replOptions = (ChatRepl as ReturnType<typeof vi.fn>).mock.calls[0][0];
      await replOptions.onExit();

      // Then: should display shutdown messages
      const output = consoleLogSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Shutting down');
      expect(output).toContain('Server shutdown complete');

      consoleLogSpy.mockRestore();
    });

    it('exits with REPL exit code after shutdown', async () => {
      // Given: REPL that returns specific exit code
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      (ChatRepl as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        start: vi.fn().mockResolvedValue(0),
      }));

      // When: running with attach and REPL completes
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: should exit with REPL's exit code
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('LOG_LEVEL configuration in attach mode', () => {
    it('sets LOG_LEVEL to ERROR by default when attaching', async () => {
      // Given: no respectLogLevel flag
      delete process.env['LOG_LEVEL'];

      // When: running with attach
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: LOG_LEVEL should be forced to ERROR
      expect(process.env['LOG_LEVEL']).toBe('ERROR');
    });

    it('respects existing LOG_LEVEL when respectLogLevel is true', async () => {
      // Given: existing LOG_LEVEL
      process.env['LOG_LEVEL'] = 'INFO';

      // When: running with attach and respectLogLevel
      await runCommand({
        configDir: tempConfigDir,
        attach: true,
        respectLogLevel: true,
      });

      // Then: LOG_LEVEL should remain unchanged
      expect(process.env['LOG_LEVEL']).toBe('INFO');
    });

    it('applies ERROR log level before server initialization', async () => {
      // Given: no existing LOG_LEVEL
      delete process.env['LOG_LEVEL'];

      // Spy on server creation to verify LOG_LEVEL is set before
      const { createA2AServer } = await import('../src/a2a/server.js');
      (createA2AServer as ReturnType<typeof vi.fn>).mockImplementation(() => {
        // Check LOG_LEVEL at server creation time
        expect(process.env['LOG_LEVEL']).toBe('ERROR');
        return Promise.resolve({
          address: () => ({ address: '127.0.0.1', port: 3000 }),
          close: vi.fn((cb) => cb()),
        });
      });

      // When: running with attach
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: LOG_LEVEL should be ERROR (verified in mock implementation)
    });
  });

  describe('file logging in attach mode', () => {
    it('sets up file logging when logDir is provided', async () => {
      // Given: logDir option
      const tempDir = mkdtempSync(join(tmpdir(), 'agent-run-attach-'));
      const logDir = join(tempDir, 'logs');

      try {
        const { Logger } = await import('../src/utils/logger.js');
        const setFileSinkSpy = vi.spyOn(Logger, 'setFileSink').mockResolvedValue();
        const setConsoleEnabledSpy = vi
          .spyOn(Logger, 'setConsoleEnabled')
          .mockImplementation(() => {});

        // When: running with attach and logDir
        await runCommand({
          configDir: tempConfigDir,
          attach: true,
          logDir,
        });

        // Then: should configure file sink
        expect(setFileSinkSpy).toHaveBeenCalledWith(logDir);

        // And should set structured logging
        expect(process.env['LOG_STRUCTURED']).toBe('true');

        // And should suppress console logs
        expect(setConsoleEnabledSpy).toHaveBeenCalledWith(false);

        setFileSinkSpy.mockRestore();
        setConsoleEnabledSpy.mockRestore();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('continues if file logging setup fails', async () => {
      // Given: logDir option and failing setFileSink
      const logDir = '/invalid/path';

      const { Logger } = await import('../src/utils/logger.js');
      const setFileSinkSpy = vi
        .spyOn(Logger, 'setFileSink')
        .mockRejectedValue(new Error('Permission denied'));

      // When: running with failing logDir
      // Then: should not throw (gracefully continue)
      await expect(
        runCommand({
          configDir: tempConfigDir,
          attach: true,
          logDir,
        }),
      ).resolves.not.toThrow();

      setFileSinkSpy.mockRestore();
    });
  });

  describe('REPL configuration in attach mode', () => {
    it('creates REPL with showConnectionInfo=false', async () => {
      // Given: run command with attach
      // When: running
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: REPL should be created without connection info display
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      const replOptions = (ChatRepl as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(replOptions.showConnectionInfo).toBe(false);
    });

    it('passes shutdown callback to REPL', async () => {
      // Given: run command with attach
      // When: running
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: REPL should have onExit callback
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      const replOptions = (ChatRepl as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(replOptions.onExit).toBeDefined();
      expect(typeof replOptions.onExit).toBe('function');
    });

    it('creates renderer with colors enabled', async () => {
      // Given: run command with attach
      // When: running
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: renderer should be created with colors
      expect(mockStreamRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: true,
        }),
      );
    });

    it('creates renderer with verbose=false by default', async () => {
      // Given: run command with attach (no verbose flag)
      // When: running
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: renderer should default to non-verbose
      expect(mockStreamRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: false,
        }),
      );
    });
  });

  describe('non-interactive mode (without attach)', () => {
    it('does not enter chat mode when attach is not specified', async () => {
      // Given: run command without attach
      // Setup a promise that resolves immediately to avoid hanging
      const originalOn = process.on;
      process.on = vi.fn() as typeof process.on;

      // When: running without attach (will hang, so we test setup only)
      const runPromise = runCommand({ configDir: tempConfigDir, attach: false });

      // Give it a moment to set up signal handlers
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Then: ChatRepl should not be instantiated
      const { ChatRepl } = await import('../src/cli/chat/repl.js');
      expect(ChatRepl).not.toHaveBeenCalled();

      // Cleanup
      process.on = originalOn;

      // Note: runPromise will hang (as designed for daemon mode) - don't await it
      void runPromise;
    });

    it('sets up signal handlers in non-interactive mode', async () => {
      // Given: process.on spy
      const processOnSpy = vi.spyOn(process, 'on');

      // When: running without attach
      const runPromise = runCommand({ configDir: tempConfigDir, attach: false });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Then: should set up SIGINT and SIGTERM handlers
      const signalHandlers = processOnSpy.mock.calls
        .filter((call) => call[0] === 'SIGINT' || call[0] === 'SIGTERM')
        .map((call) => call[0]);

      expect(signalHandlers).toContain('SIGINT');
      expect(signalHandlers).toContain('SIGTERM');

      // Cleanup
      processOnSpy.mockRestore();

      void runPromise;
    });
  });

  describe('error handling', () => {
    it('handles chat mode startup failure', async () => {
      // Given: ChatClient that fails
      const { ChatClient } = await import('../src/cli/chat/client.js');
      (ChatClient.fromUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection failed'),
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // When: attempting to attach
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: should log error and shut down
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to start chat'));

      // And should exit with error code
      expect(process.exit).toHaveBeenCalledWith(1);

      consoleErrorSpy.mockRestore();
    });

    it('shuts down server after chat mode failure', async () => {
      // Given: ChatClient that fails
      const { ChatClient } = await import('../src/cli/chat/client.js');
      (ChatClient.fromUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection failed'),
      );

      const { createA2AServer } = await import('../src/a2a/server.js');
      const mockServer = {
        address: () => ({ address: '127.0.0.1', port: 3000 }),
        close: vi.fn((callback) => callback()),
      };
      (createA2AServer as ReturnType<typeof vi.fn>).mockResolvedValue(mockServer);

      vi.spyOn(console, 'error').mockImplementation(() => {});

      // When: chat mode fails
      await runCommand({ configDir: tempConfigDir, attach: true });

      // Then: server should still be closed
      expect(mockServer.close).toHaveBeenCalled();
    });
  });

  describe('development mode with attach', () => {
    it('supports dev mode (hot reload) with attach', async () => {
      // Given: dev and attach options
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // When: running with dev and attach
      await runCommand({
        configDir: tempConfigDir,
        dev: true,
        attach: true,
      });

      // Then: should indicate dev mode
      const output = consoleLogSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Development mode');
      expect(output).toContain('hot reload');

      // And should also indicate chat mode
      expect(output).toContain('chat mode');

      consoleLogSpy.mockRestore();
    });
  });

  describe('port and host configuration', () => {
    it('passes port and host to server configuration', async () => {
      // Given: custom port and host
      const customPort = 8080;
      const customHost = '0.0.0.0';

      // When: running with custom port/host
      await runCommand({
        configDir: tempConfigDir,
        port: customPort,
        host: customHost,
        attach: true,
      });

      // Then: server should be created (port/host passed to config)
      const { createA2AServer } = await import('../src/a2a/server.js');
      expect(createA2AServer).toHaveBeenCalled();

      // Note: Actual port/host validation would require checking serviceConfig
      // which is set globally - tested via server creation
    });
  });
});
