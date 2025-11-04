/**
 * Integration tests for default `agent` command (smart-start behavior)
 * Tests: attach if reachable, else start+attach
 */

import { rmSync } from 'node:fs';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type * as ChatUtils from '../src/cli/chat/utils.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

// Mock components
vi.mock('../src/cli/chat/utils.js', async () => {
  const actual = await vi.importActual<typeof ChatUtils>('../src/cli/chat/utils.js');
  return {
    ...actual,
    isAgentReachable: vi.fn(),
  };
});

vi.mock('../src/cli/commands/chat.js', () => ({
  chatCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/cli/commands/run.js', () => ({
  runCommand: vi.fn().mockResolvedValue(undefined),
}));

describe('agent default command (smart-start integration)', () => {
  let tempConfigDir: string;
  let originalExit: typeof process.exit;
  let originalArgv: string[];

  beforeEach(() => {
    tempConfigDir = createTestConfigWorkspace({
      agentName: 'Test Agent',
      skills: [{ id: 'test-skill', name: 'Test Skill' }],
    });

    originalExit = process.exit;
    originalArgv = process.argv.slice();

    // Prevent process.exit from terminating test
    process.exit = vi.fn() as typeof process.exit;

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (tempConfigDir) {
      rmSync(tempConfigDir, { recursive: true, force: true });
    }
    process.exit = originalExit;
    process.argv = originalArgv;
  });

  describe('smart-start when agent is reachable', () => {
    it('attaches to existing agent via chat command when reachable', async () => {
      // Given: agent is reachable at default URL
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running default command (no subcommand)
      process.argv = ['node', 'agent'];
      await import('../src/cli/index.js');

      // Give CLI time to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should call chatCommand (client-only mode)
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://127.0.0.1:3000',
        }),
      );

      // And should NOT call runCommand
      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).not.toHaveBeenCalled();
    });

    it('uses custom URL when --url flag is provided', async () => {
      // Given: agent is reachable at custom URL
      const customUrl = 'http://localhost:8000';
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running with custom URL
      process.argv = ['node', 'agent', '--url', customUrl];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should check reachability at custom URL
      expect(isAgentReachable).toHaveBeenCalledWith(customUrl);

      // And should connect to custom URL
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          url: customUrl,
        }),
      );
    });

    it('passes verbose flag to chat command when specified', async () => {
      // Given: agent is reachable and verbose flag
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running with verbose flag
      process.argv = ['node', 'agent', '--verbose'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should pass verbose to chatCommand
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: true,
        }),
      );
    });

    it('passes log-dir flag to chat command when specified', async () => {
      // Given: agent is reachable and log-dir flag
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running with log-dir flag
      process.argv = ['node', 'agent', '--log-dir', '/tmp/logs'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should pass logDir to chatCommand
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          logDir: '/tmp/logs',
        }),
      );
    });

    it('passes inline-summary interval to chat command when specified', async () => {
      // Given: agent is reachable and inline-summary flag
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running with inline-summary interval
      process.argv = ['node', 'agent', '--inline-summary', '500'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should pass inlineSummaryInterval to chatCommand
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineSummaryInterval: 500,
        }),
      );
    });

    it('passes respect-log-level flag to chat command when specified', async () => {
      // Given: agent is reachable and respect-log-level flag
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running with respect-log-level flag
      process.argv = ['node', 'agent', '--respect-log-level'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should pass respectLogLevel to chatCommand
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          respectLogLevel: true,
        }),
      );
    });
  });

  describe('smart-start when agent is not reachable', () => {
    it('starts local server then attaches when agent not reachable', async () => {
      // Given: agent is not reachable at default URL
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running default command
      process.argv = ['node', 'agent'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should call runCommand with attach=true
      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          attach: true,
        }),
      );

      // And should NOT call chatCommand
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).not.toHaveBeenCalled();
    });

    it('checks reachability at default URL when no --url flag', async () => {
      // Given: no URL flag
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running default command
      process.argv = ['node', 'agent'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should check default URL
      expect(isAgentReachable).toHaveBeenCalledWith('http://127.0.0.1:3000');
    });

    it('checks reachability at custom URL when --url flag provided', async () => {
      // Given: custom URL flag
      const customUrl = 'http://localhost:9000';
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running with custom URL
      process.argv = ['node', 'agent', '--url', customUrl];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should check custom URL
      expect(isAgentReachable).toHaveBeenCalledWith(customUrl);
    });

    it('passes config-dir to runCommand when specified', async () => {
      // Given: agent not reachable and config-dir flag
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running with config-dir
      process.argv = ['node', 'agent', '--config-dir', '/custom/config'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should pass configDir to runCommand
      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          configDir: '/custom/config',
        }),
      );
    });

    it('passes dev flag to runCommand when specified', async () => {
      // Given: agent not reachable and dev flag
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running with dev flag
      process.argv = ['node', 'agent', '--dev'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should pass dev to runCommand
      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          dev: true,
        }),
      );
    });

    it('passes port and host to runCommand when specified', async () => {
      // Given: agent not reachable with port and host flags
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running with port and host
      process.argv = ['node', 'agent', '--port', '8080', '--host', '0.0.0.0'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should pass port and host to runCommand
      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 8080,
          host: '0.0.0.0',
        }),
      );
    });

    it('always sets attach=true when starting server', async () => {
      // Given: agent not reachable
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running default command
      process.argv = ['node', 'agent'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: attach should always be true for start+attach behavior
      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          attach: true,
        }),
      );
    });
  });

  describe('reachability check behavior', () => {
    it('performs reachability check with reasonable timeout', async () => {
      // Given: isAgentReachable mock
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockImplementation(async (_url: string) => {
        // Simulate checking with timeout
        await new Promise((resolve) => setTimeout(resolve, 100));
        return false;
      });

      // When: running default command
      process.argv = ['node', 'agent'];
      const startTime = Date.now();
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 150));

      const elapsed = Date.now() - startTime;

      // Then: should complete check within reasonable time (with timeout)
      expect(elapsed).toBeLessThan(5000); // Should not hang indefinitely
      expect(isAgentReachable).toHaveBeenCalled();
    });

    it('handles reachability check errors gracefully', async () => {
      // Given: isAgentReachable that throws
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // When: reachability check fails
      process.argv = ['node', 'agent'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should handle error (log and potentially fallback)
      // Exact behavior depends on implementation - test that it doesn't crash
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('decision tree verification', () => {
    it('follows attach-only path when agent is reachable', async () => {
      // Given: reachable agent
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running default command
      process.argv = ['node', 'agent'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should only call chatCommand
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      const { runCommand } = await import('../src/cli/commands/run.js');

      expect(chatCommand).toHaveBeenCalled();
      expect(runCommand).not.toHaveBeenCalled();
    });

    it('follows start+attach path when agent is not reachable', async () => {
      // Given: unreachable agent
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running default command
      process.argv = ['node', 'agent'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should only call runCommand with attach
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      const { runCommand } = await import('../src/cli/commands/run.js');

      expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ attach: true }));
      expect(chatCommand).not.toHaveBeenCalled();
    });
  });

  describe('distinction from explicit commands', () => {
    it('is different from explicit "agent chat" (which never starts server)', async () => {
      // Given: unreachable agent
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      // When: running explicit "agent chat" command
      process.argv = ['node', 'agent', 'chat'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should NOT check reachability or call runCommand
      expect(isAgentReachable).not.toHaveBeenCalled();

      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).not.toHaveBeenCalled();

      // And SHOULD call chatCommand directly
      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).toHaveBeenCalled();
    });

    it('is different from "agent run --attach" (which always starts server)', async () => {
      // Given: reachable agent
      const { isAgentReachable } = await import('../src/cli/chat/utils.js');
      (isAgentReachable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // When: running "agent run --attach"
      process.argv = ['node', 'agent', 'run', '--attach'];
      await import('../src/cli/index.js');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: should NOT check reachability or call chatCommand
      expect(isAgentReachable).not.toHaveBeenCalled();

      const { chatCommand } = await import('../src/cli/commands/chat.js');
      expect(chatCommand).not.toHaveBeenCalled();

      // And SHOULD call runCommand with attach
      const { runCommand } = await import('../src/cli/commands/run.js');
      expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ attach: true }));
    });
  });
});
