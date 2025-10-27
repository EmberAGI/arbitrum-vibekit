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
}

export async function runCommand(options: RunOptions = {}): Promise<void> {
  const configDir = resolve(process.cwd(), options.configDir ?? 'config');
  const dev = options.dev ?? false;

  cliOutput.print(`Starting agent server from \`${configDir}\``);
  if (dev) {
    cliOutput.info('Development mode enabled (hot reload active)');
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
  if (addressInfo && typeof addressInfo !== 'string') {
    cliOutput.blank();
    cliOutput.success(`Server running at \`http://${addressInfo.address}:${addressInfo.port}\``);
    cliOutput.success(
      `Agent card: \`http://${addressInfo.address}:${addressInfo.port}/.well-known/agent-card.json\``,
    );
    cliOutput.success(`A2A endpoint: \`http://${addressInfo.address}:${addressInfo.port}/a2a\``);
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
