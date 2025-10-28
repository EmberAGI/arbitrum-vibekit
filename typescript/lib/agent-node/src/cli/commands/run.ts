/**
 * CLI Command: agent run
 * Runs the agent server with optional dev mode (hot reload)
 */

import process from 'node:process';

import { createA2AServer } from '../../a2a/server.js';
import { initFromConfigWorkspace } from '../../config/runtime/init.js';
import type { HotReloadEvent } from '../../config/runtime/init.js';
import { resolveConfigDirectory } from '../../config/runtime/config-dir.js';
import { serviceConfig } from '../../config.js';
import { cliOutput } from '../output.js';
import { Logger } from '../../utils/logger.js';

const NativePromise: PromiseConstructor = global.Promise;

async function withNativePromise<T>(fn: () => Promise<T>): Promise<T> {
  const currentPromise = global.Promise;
  if (currentPromise === NativePromise) {
    return fn();
  }

  global.Promise = NativePromise;
  try {
    return await fn();
  } finally {
    global.Promise = currentPromise;
  }
}

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
  respectLogLevel?: boolean; // Opt out of forcing ERROR in chat
}

export async function runCommand(options: RunOptions = {}): Promise<void> {
  const { configDir } = resolveConfigDirectory(options.configDir);
  const dev = options.dev ?? false;
  const shouldAttach = options.attach ?? options.chat ?? false;
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  const originalLogLevel = process.env['LOG_LEVEL'];

  cliOutput.print(`Starting agent server from \`${configDir}\``);
  if (dev) {
    cliOutput.info('Development mode enabled (hot reload active)');
  }
  if (shouldAttach) {
    cliOutput.info('Chat mode will be enabled after server starts');
  }

  // Preconfigure logging BEFORE server initialization when attaching chat
  if (shouldAttach) {
    if (options.logDir) {
      try {
        await Logger.setFileSink(options.logDir);
        process.env['LOG_STRUCTURED'] = 'true';
        // Suppress console logs for clean chat output (stdout reserved for stream)
        Logger.setConsoleEnabled(false);
      } catch {
        // Do not block server startup on logging preconfiguration failures
      }
    }

    if (!options.respectLogLevel) {
      // Force ERROR by default for console (suppressed if logDir set)
      process.env['LOG_LEVEL'] = 'ERROR';
    } else {
      // Ensure a default if none was provided in env
      const { setDefaultLogLevel } = await import('../chat/utils.js');
      setDefaultLogLevel('ERROR');
    }
  }

  // Initialize config workspace
  const agentConfigHandle = await withNativePromise(() =>
    initFromConfigWorkspace({
      root: configDir,
      dev,
    }),
  );
  agentConfigHandle.onHotReload((event) => {
    const updates = summarizeHotReload(event.updated);
    cliOutput.info(`Hot reload: ${updates.join(', ')}`);
  });

  if (shouldAttach && !options.respectLogLevel) {
    // Reassert enforced log level in case init mutated environment
    process.env['LOG_LEVEL'] = 'ERROR';
  }

  const temporarilyForceErrorLevel =
    !shouldAttach && process.env['LOG_LEVEL'] !== 'ERROR';
  if (temporarilyForceErrorLevel) {
    process.env['LOG_LEVEL'] = 'ERROR';
  }

  // Create server with service and agent config
  const server = await withNativePromise(() =>
    createA2AServer({
      serviceConfig,
      agentConfig: agentConfigHandle,
    }),
  );

  if (temporarilyForceErrorLevel) {
    if (originalLogLevel === undefined) {
      delete process.env['LOG_LEVEL'];
    } else {
      process.env['LOG_LEVEL'] = originalLogLevel;
    }
  }

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
    for (const signal of signals) {
      process.off(signal, handleSignal);
    }
  };

  function handleSignal(_signal: NodeJS.Signals): void {
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
  }

  // If attach mode, enter chat then shutdown
  if (shouldAttach) {
    try {
      // Dynamic import to avoid circular dependencies
      const { ChatClient } = await import('../chat/client.js');
      const { StreamRenderer } = await import('../chat/renderer.js');
      const { ChatRepl } = await import('../chat/repl.js');
      const { setDefaultLogLevel } = await import('../chat/utils.js');
      const { Logger } = await import('../../utils/logger.js');

      // Force ERROR by default unless user explicitly opts to respect env
      if (!options.respectLogLevel) {
        process.env['LOG_LEVEL'] = 'ERROR';
      } else {
        // Ensure default if none set
        setDefaultLogLevel('ERROR');
      }

      // Setup file logging if requested
      if (options.logDir) {
        try {
          await Logger.setFileSink(options.logDir);
          process.env['LOG_STRUCTURED'] = 'true';
          // Suppress console logs entirely for clean chat output
          Logger.setConsoleEnabled(false);
        } catch {
          // ignore sink failures
        }
      }

      // Create chat client
      const client = await ChatClient.fromUrl(serverUrl);

      // Create renderer
      const StreamRendererCtor =
        (StreamRenderer.prototype.constructor as typeof StreamRenderer | undefined) ??
        StreamRenderer;
      const renderer = new StreamRendererCtor({
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
    for (const signal of signals) {
      process.on(signal, handleSignal);
    }
    return;
  }
}
