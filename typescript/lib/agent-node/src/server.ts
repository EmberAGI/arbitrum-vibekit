import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { createA2AServer } from './a2a/server.js';
import { initFromConfigWorkspace, type AgentConfigHandle } from './config/runtime/init.js';
import { serviceConfig } from './config.js';
import { Logger } from './utils/logger.js';

async function main(): Promise<void> {
  const logger = Logger.getInstance('Server');

  // Check for config workspace
  const configRoot = resolve(process.cwd(), 'config');
  const manifestPath = resolve(configRoot, 'agent.manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      'Config workspace not found at ./config. Run "pnpm agent init" to scaffold the configuration workspace before starting the server.',
    );
  }

  logger.info('Using config workspace from ./config');

  const agentConfigHandle: AgentConfigHandle = await initFromConfigWorkspace({
    root: configRoot,
    dev: process.env['NODE_ENV'] === 'development',
  });

  const server = await createA2AServer({
    serviceConfig,
    agentConfig: agentConfigHandle,
  });

  const addressInfo = server.address();
  if (addressInfo && typeof addressInfo !== 'string') {
    logger.info(`A2A server listening on http://${addressInfo.address}:${addressInfo.port}`);
  }

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down server...');
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
  };

  const handleSignal = (_signal: NodeJS.Signals): void => {
    void shutdown()
      .catch((error) => {
        logger.error('Error during server shutdown', error);
      })
      .finally(() => {
        process.exit(0);
      });
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
}

void main().catch((error) => {
  const logger = Logger.getInstance('Server');
  logger.error('Failed to start A2A server', error);
  process.exit(1);
});
