/**
 * CLI Command: agent run
 * Runs the agent server with optional dev mode (hot reload)
 */

import { resolve } from 'node:path';
import process from 'node:process';

import { createA2AServer } from '../../a2a/server.js';
import { initFromConfigWorkspace } from '../../config/runtime/init.js';
import type { HotReloadEvent } from '../../config/runtime/init.js';
import { serviceConfig } from '../../config.js';
import { cliOutput } from '../output.js';

function summarizeHotReload(updated: HotReloadEvent['updated']): string[] {
  const summary: string[] = [];

  if (updated.prompt) {
    summary.push('prompt');
  }
  if (updated.agentCard) {
    summary.push('agent-card');
  }
  if (updated.models) {
    summary.push('models');
  }

  if (updated.mcp) {
    const { started, stopped, restarted } = updated.mcp;
    if (started.length > 0) {
      summary.push(`mcp started: ${started.join(', ')}`);
    }
    if (stopped.length > 0) {
      summary.push(`mcp stopped: ${stopped.join(', ')}`);
    }
    if (restarted.length > 0) {
      summary.push(`mcp restarted: ${restarted.join(', ')}`);
    }
  }

  if (updated.workflows) {
    const { added, removed, reloaded } = updated.workflows;
    if (added.length > 0) {
      summary.push(`workflows added: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
      summary.push(`workflows removed: ${removed.join(', ')}`);
    }
    if (reloaded.length > 0) {
      summary.push(`workflows reloaded: ${reloaded.join(', ')}`);
    }
  }

  if (summary.length === 0) {
    summary.push('no-op');
  }

  return summary;
}

export interface RunOptions {
  configDir?: string;
  dev?: boolean;
  port?: number;
  host?: string;
  attach?: boolean;
  chat?: boolean; // Alias for attach
  logDir?: string; // Optional file logging directory when attaching chat
}

export async function runCommand(options: RunOptions = {}): Promise<void> {
  const configDir = resolve(process.cwd(), options.configDir ?? 'config');
  const dev = options.dev ?? false;
  const shouldAttach = options.attach ?? options.chat ?? false;

  cliOutput.print(`Starting agent server from \`${configDir}\``);
  if (dev) {
    cliOutput.info('Development mode enabled (hot reload active)');
  }
  if (shouldAttach) {
    cliOutput.info('Chat mode will be enabled after server starts');
  }

  // Initialize config workspace
  const agentConfigHandle = await initFromConfigWorkspace({
    root: configDir,
    dev,
  });
  agentConfigHandle.onHotReload((event) => {
    const updates = summarizeHotReload(event.updated);
    cliOutput.info(`Hot reload: ${updates.join(', ')}`);
  });

  // Create server with service and agent config
  const server = await createA2AServer({
    serviceConfig,
    agentConfig: agentConfigHandle,
  });

  const addressInfo = server.address();
  let serverUrl = '';
  if (addressInfo && typeof addressInfo !== 'string') {
    const host = addressInfo.address === '::' ? 'localhost' : addressInfo.address;
    serverUrl = `http://${host}:${addressInfo.port}`;

    cliOutput.blank();
    cliOutput.success(`Server running at \`${serverUrl}\``);
    cliOutput.success(`Agent card: \`${serverUrl}/.well-known/agent-card.json\``);
    cliOutput.success(`A2A endpoint: \`${serverUrl}/a2a\``);

    if (shouldAttach) {
      cliOutput.blank();
      cliOutput.info('Entering chat mode...');
    }
  }

  // Setup graceful shutdown
  const shutdown = async (): Promise<void> => {
    cliOutput.blank();
    cliOutput.print('Shutting down server...');
    await agentConfigHandle.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    cliOutput.success('Server shutdown complete');
  };

  // If attach mode, enter chat then shutdown
  if (shouldAttach) {
    try {
      // Dynamic import to avoid circular dependencies
      const { ChatClient } = await import('../chat/client.js');
      const { StreamRenderer } = await import('../chat/renderer.js');
      const { ChatRepl } = await import('../chat/repl.js');
      const { setDefaultLogLevel } = await import('../chat/utils.js');
      const { Logger } = await import('../../utils/logger.js');

      // Set default log level to ERROR in chat mode
      setDefaultLogLevel('ERROR');

      // Setup file logging if requested
      if (options.logDir) {
        try {
          await Logger.setFileSink(options.logDir);
          if ((process.env['LOG_STRUCTURED'] ?? 'false').toLowerCase() !== 'true') {
            process.env['LOG_STRUCTURED'] = 'true';
          }
        } catch {
          // ignore sink failures
        }
      }

      // Create chat client
      const client = await ChatClient.fromUrl(serverUrl);

      // Create renderer
      const renderer = new StreamRenderer({
        colors: true,
        verbose: false,
      });

      // Create and start REPL with shutdown callback
      const repl = new ChatRepl({
        client,
        renderer,
        showConnectionInfo: false, // Already shown above
        onExit: async () => {
          await shutdown();
        },
      });

      const exitCode = await repl.start();
      process.exit(exitCode);
    } catch (error) {
      cliOutput.error('Failed to start chat mode');
      if (error instanceof Error) {
        cliOutput.error(error.message);
      }
      await shutdown();
      process.exit(1);
    }
  } else {
    // Non-interactive mode: setup signal handlers and wait
    const handleSignal = (_signal: NodeJS.Signals): void => {
      void shutdown()
        .catch((error) => {
          cliOutput.error('Error during shutdown');
          if (error instanceof Error) {
            cliOutput.error(error.message);
          }
        })
        .finally(() => {
          process.exit(0);
        });
    };

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    // Keep process alive
    await new Promise(() => {
      // Wait indefinitely
    });
  }
}
