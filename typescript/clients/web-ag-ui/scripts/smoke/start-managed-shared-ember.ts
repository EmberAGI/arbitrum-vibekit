import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startManagedSharedEmberHarness } from './support/runtimePrep.js';

const DEFAULT_MANAGED_AGENT_ID = 'ember-lending';

function readString(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function main() {
  const specRoot = readString(process.env.EMBER_ORCHESTRATION_V1_SPEC_ROOT);
  if (specRoot === null) {
    throw new Error('EMBER_ORCHESTRATION_V1_SPEC_ROOT is required.');
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const vibekitRoot = path.resolve(scriptDir, '..', '..', '..', '..', '..');
  const host = readString(process.env.SHARED_EMBER_HOST) ?? '127.0.0.1';
  const port = Number.parseInt(readString(process.env.SHARED_EMBER_PORT) ?? '4010', 10);
  if (!Number.isInteger(port) || port < 0) {
    throw new Error(`Invalid SHARED_EMBER_PORT: ${process.env.SHARED_EMBER_PORT ?? ''}`);
  }

  const managedAgentId =
    readString(process.env.SHARED_EMBER_MANAGED_AGENT_ID) ?? DEFAULT_MANAGED_AGENT_ID;
  const server = await startManagedSharedEmberHarness({
    specRoot,
    vibekitRoot,
    managedAgentId,
    host,
    port,
  });

  console.log(`READY ${JSON.stringify({ baseUrl: server.baseUrl })}`);

  let closed = false;
  const closeServer = async (exitCode: number) => {
    if (closed) {
      return;
    }
    closed = true;
    await server.close();
    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    void closeServer(0);
  });
  process.on('SIGTERM', () => {
    void closeServer(0);
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
