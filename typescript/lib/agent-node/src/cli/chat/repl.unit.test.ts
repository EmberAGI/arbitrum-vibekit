import type { Interface as ReadlineInterface } from 'node:readline';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ChatClient } from './client.js';
import type { StreamRenderer } from './renderer.js';
import { ChatRepl, isTTYSupported } from './repl.js';

// Mock readline module at top level
vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
}));

// Mock dependencies
const mockClient: ChatClient = {
  sendMessage: vi.fn(),
  getContextId: vi.fn(),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
  resetContext: vi.fn(),
} as unknown as ChatClient;

const mockRenderer: StreamRenderer = {
  processArtifactUpdate: vi.fn(),
  processStatusUpdate: vi.fn(),
  reset: vi.fn(),
} as unknown as StreamRenderer;

describe('ChatRepl', () => {
  let originalIsTTY: boolean | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('TTY detection', () => {
    it('returns error exit code when stdin is not a TTY', async () => {
      // Given: non-TTY environment (CI/Docker)
      process.stdin.isTTY = false;

      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
      });

      // When: starting REPL
      const exitCode = await repl.start();

      // Then: should return error exit code
      expect(exitCode).toBe(1);

      // And should print helpful error message
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toContain('TTY');
      expect(errorMessage).toContain('agent run');
    });

    it('proceeds when stdin is a TTY', async () => {
      // Given: TTY environment
      process.stdin.isTTY = true;

      // Mock readline interface
      const mockRl = {
        on: vi.fn(),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      // Trigger immediate close to exit REPL
      mockRl.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'close') {
          setImmediate(callback);
        }
        return mockRl;
      });

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      // When: starting REPL
      const exitCode = await repl.start();

      // Then: should return success exit code
      expect(exitCode).toBe(0);

      // And should not print TTY error
      const errorCalls = consoleErrorSpy.mock.calls.filter((call) =>
        String(call[0]).includes('TTY'),
      );
      expect(errorCalls).toHaveLength(0);
    });
  });

  describe('REPL initialization', () => {
    beforeEach(() => {
      process.stdin.isTTY = true;
    });

    it('displays connection info by default', async () => {
      // Given: REPL with default showConnectionInfo
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
      });

      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'close') setImmediate(callback);
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: starting REPL
      await repl.start();

      // Then: should display connection info
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), 'http://localhost:3000');
    });

    it('hides connection info when showConnectionInfo is false', async () => {
      // Given: REPL with showConnectionInfo=false
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'close') setImmediate(callback);
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: starting REPL
      await repl.start();

      // Then: should not display connection info
      const connectionCalls = consoleLogSpy.mock.calls.filter((call) =>
        String(call).includes('Connected to agent'),
      );
      expect(connectionCalls).toHaveLength(0);
    });

    it('displays initial prompt', async () => {
      // Given: REPL instance
      process.stdin.isTTY = true;
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'close') setImmediate(callback);
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: starting REPL
      await repl.start();

      // Then: should call prompt
      expect(mockRl.prompt).toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      process.stdin.isTTY = true;
    });

    it('skips empty input and re-prompts', async () => {
      // Given: REPL with readline mock
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      let lineCallback: ((line: string) => void) | undefined;
      const mockRl = {
        on: vi.fn((event: string, callback: (line: string) => void) => {
          if (event === 'line') {
            lineCallback = callback;
          } else if (event === 'close') {
            setImmediate(callback as () => void);
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: starting REPL and submitting empty line
      const startPromise = repl.start();
      await new Promise((resolve) => setImmediate(resolve)); // Let REPL initialize

      if (lineCallback) {
        lineCallback('   '); // Empty/whitespace input
      }

      await new Promise((resolve) => setImmediate(resolve));

      // Then: should not call sendMessage
      expect(mockClient.sendMessage).not.toHaveBeenCalled();

      // And should re-prompt
      expect(mockRl.prompt).toHaveBeenCalledTimes(2); // Initial + after empty

      repl.stop();
      await startPromise;
    });

    it('sends non-empty messages and processes stream', async () => {
      // Given: REPL with mocked client and stream
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      // Mock stream response
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          data: {
            kind: 'artifact-update',
            artifact: {
              artifactId: 'text-1',
              name: 'text-response',
              parts: [{ kind: 'text', text: 'Response' }],
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
      }

      (mockClient.sendMessage as ReturnType<typeof vi.fn>).mockReturnValue(mockStream());

      let lineCallback: ((line: string) => void) | undefined;
      const mockRl = {
        on: vi.fn((event: string, callback: (line: string) => void) => {
          if (event === 'line') {
            lineCallback = callback;
          } else if (event === 'close') {
            // Don't auto-close
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: starting REPL and submitting message
      const startPromise = repl.start();
      await new Promise((resolve) => setImmediate(resolve));

      if (lineCallback) {
        lineCallback('Hello agent');
      }

      await new Promise((resolve) => setTimeout(resolve, 10)); // Allow async processing

      // Then: should send message
      expect(mockClient.sendMessage).toHaveBeenCalledWith('Hello agent');

      // And should reset renderer before processing
      expect(mockRenderer.reset).toHaveBeenCalled();

      // And should process artifact and status updates
      expect(mockRenderer.processArtifactUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'artifact-update',
          artifact: expect.objectContaining({
            artifactId: 'text-1',
          }),
        }),
      );
      expect(mockRenderer.processStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'status-update',
          final: true,
        }),
      );

      // And should prompt after response
      expect(mockRl.prompt.mock.calls.length).toBeGreaterThanOrEqual(2);

      repl.stop();
      await startPromise;
    });

    it('handles errors during message processing', async () => {
      // Given: REPL with client that throws error
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      (mockClient.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Network error');
      });

      let lineCallback: ((line: string) => void) | undefined;
      const mockRl = {
        on: vi.fn((event: string, callback: (line: string) => void) => {
          if (event === 'line') {
            lineCallback = callback;
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: submitting message that causes error
      const startPromise = repl.start();
      await new Promise((resolve) => setImmediate(resolve));

      if (lineCallback) {
        lineCallback('Trigger error');
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Then: should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.any(Error));

      // And should continue prompting (not crash)
      expect(mockRl.prompt.mock.calls.length).toBeGreaterThan(0);

      repl.stop();
      await startPromise;
    });
  });

  describe('exit handling', () => {
    beforeEach(() => {
      process.stdin.isTTY = true;
    });

    it('calls onExit callback when REPL closes normally', async () => {
      // Given: REPL with onExit callback
      const onExitSpy = vi.fn();
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
        onExit: onExitSpy,
      });

      let _closeCallback: (() => void) | undefined;
      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'close') {
            _closeCallback = callback;
            setImmediate(callback);
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: REPL closes
      await repl.start();

      // Then: onExit should be called
      expect(onExitSpy).toHaveBeenCalled();
    });

    it('returns exit code 0 on normal close', async () => {
      // Given: REPL instance
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'close') {
            setImmediate(callback);
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: REPL closes normally
      const exitCode = await repl.start();

      // Then: should return success exit code
      expect(exitCode).toBe(0);
    });

    it('handles SIGINT signal', async () => {
      // Given: REPL instance
      const onExitSpy = vi.fn();
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
        onExit: onExitSpy,
      });

      let sigintCallback: (() => void) | undefined;
      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'SIGINT') {
            sigintCallback = callback;
          } else if (event === 'close') {
            setImmediate(callback);
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: receiving SIGINT
      const startPromise = repl.start();
      await new Promise((resolve) => setImmediate(resolve));

      if (sigintCallback) {
        sigintCallback();
      }

      await new Promise((resolve) => setImmediate(resolve));

      // Then: should close readline
      expect(mockRl.close).toHaveBeenCalled();

      await startPromise;
    });

    it('prevents duplicate exit handling', async () => {
      // Given: REPL instance
      const onExitSpy = vi.fn();
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
        onExit: onExitSpy,
      });

      let sigintCallback: (() => void) | undefined;
      let closeCallback: (() => void) | undefined;
      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'SIGINT') {
            sigintCallback = callback;
          } else if (event === 'close') {
            closeCallback = callback;
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: receiving both SIGINT and close events
      const startPromise = repl.start();
      await new Promise((resolve) => setImmediate(resolve));

      if (sigintCallback) {
        sigintCallback();
      }
      if (closeCallback) {
        closeCallback();
      }

      await new Promise((resolve) => setImmediate(resolve));

      // Then: onExit should only be called once
      expect(onExitSpy).toHaveBeenCalledTimes(1);

      await startPromise;
    });

    it('handles async onExit callback errors gracefully', async () => {
      // Given: REPL with onExit that throws
      const onExitSpy = vi.fn().mockRejectedValue(new Error('Exit error'));
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
        onExit: onExitSpy,
      });

      const mockRl = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'close') {
            setImmediate(callback);
          }
          return mockRl;
        }),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // When: REPL exits with error in onExit
      const exitCode = await repl.start();

      // Then: should log error but still complete
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.any(Error));

      // And should still return success exit code (error in cleanup, not REPL itself)
      expect(exitCode).toBe(0);
    });
  });

  describe('stop method', () => {
    it('closes readline interface when called', async () => {
      // Given: running REPL
      process.stdin.isTTY = true;
      const repl = new ChatRepl({
        client: mockClient,
        renderer: mockRenderer,
        showConnectionInfo: false,
      });

      const mockRl = {
        on: vi.fn(() => mockRl),
        close: vi.fn(),
        prompt: vi.fn(),
      };

      const { createInterface } = await import('node:readline');
      (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(
        mockRl as unknown as ReadlineInterface,
      );

      // Start but don't wait for completion
      const startPromise = repl.start();
      await new Promise((resolve) => setImmediate(resolve));

      // When: calling stop
      repl.stop();

      // Then: should close readline
      expect(mockRl.close).toHaveBeenCalled();

      await startPromise;
    });
  });

  describe('isTTYSupported helper', () => {
    it('returns true when stdin.isTTY is true', () => {
      // Given: TTY environment
      process.stdin.isTTY = true;

      // When: checking TTY support
      const result = isTTYSupported();

      // Then: should return true
      expect(result).toBe(true);
    });

    it('returns false when stdin.isTTY is false', () => {
      // Given: non-TTY environment
      process.stdin.isTTY = false;

      // When: checking TTY support
      const result = isTTYSupported();

      // Then: should return false
      expect(result).toBe(false);
    });

    it('returns false when stdin.isTTY is undefined', () => {
      // Given: undefined TTY (non-interactive)
      process.stdin.isTTY = undefined;

      // When: checking TTY support
      const result = isTTYSupported();

      // Then: should return false
      expect(result).toBe(false);
    });
  });
});
