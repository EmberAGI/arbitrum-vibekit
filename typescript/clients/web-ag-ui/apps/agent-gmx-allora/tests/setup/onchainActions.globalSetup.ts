import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Cleanup = () => Promise<void> | void;

function resolveForgeRoot(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const marker = `${path.sep}worktrees${path.sep}`;
  const index = currentFilePath.lastIndexOf(marker);
  if (index < 0) {
    return process.cwd();
  }
  return currentFilePath.slice(0, index);
}

function resolveOnchainActionsDir(): string {
  const override = process.env['ONCHAIN_ACTIONS_WORKTREE_DIR'];
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  return path.join(resolveForgeRoot(), 'worktrees', 'onchain-actions-001');
}

const ONCHAIN_ACTIONS_DIR = resolveOnchainActionsDir();
const MEMGRAPH_COMPOSE_FILE =
  process.env['ONCHAIN_ACTIONS_MEMGRAPH_COMPOSE_FILE'] ??
  path.join(ONCHAIN_ACTIONS_DIR, 'compose.dev.db.yaml');
const ONCHAIN_ACTIONS_PORT = 50051;
const HEALTH_URL = `http://localhost:${ONCHAIN_ACTIONS_PORT}/health` as const;
const MARKETS_URL = `http://localhost:${ONCHAIN_ACTIONS_PORT}/perpetuals/markets?chainIds=42161` as const;

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Non-OK response: ${response.status}`);
    } catch (error: unknown) {
      lastError = error;
    }

    await delay(250);
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for ${url}: ${message}`);
}

async function waitForNonEmptyMarkets(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`Non-OK response: ${response.status}`);
        await delay(500);
        continue;
      }
      const payload = (await response.json()) as { markets?: unknown[] };
      const count = Array.isArray(payload.markets) ? payload.markets.length : 0;
      if (count > 0) {
        return;
      }
      lastError = new Error('Markets response was empty');
    } catch (error: unknown) {
      lastError = error;
    }

    await delay(1000);
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for non-empty markets from ${url}: ${message}`);
}

async function waitForTcpPort(params: { host: string; port: number; timeoutMs: number }): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host: params.host, port: params.port });
        socket.once('connect', () => {
          socket.end();
          resolve();
        });
        socket.once('error', reject);
      });
      return;
    } catch (error: unknown) {
      lastError = error;
    }

    await delay(250);
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for TCP ${params.host}:${params.port}: ${message}`);
}

async function runCommandAndWait(
  cmd: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  const child = spawn(cmd, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  });

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code ?? 'null'}`));
    });
  });
}

function spawnLongLivedCommand(
  cmd: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): { cleanup: Cleanup; getExitError: () => Error | undefined } {
  const child = spawn(cmd, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  });

  let exitError: Error | undefined;
  child.once('exit', (code, signal) => {
    if (code === 0) {
      return;
    }
    exitError = new Error(
      `${cmd} ${args.join(' ')} exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
    );
  });
  child.once('error', (error) => {
    exitError = error instanceof Error ? error : new Error(String(error));
  });

  return {
    getExitError: () => exitError,
    cleanup: async () => {
      if (child.exitCode !== null) {
        return;
      }
      child.kill('SIGTERM');

      // Give it a moment to shutdown cleanly.
      for (let i = 0; i < 20; i += 1) {
        if (child.exitCode !== null) {
          return;
        }
        await delay(100);
      }

      child.kill('SIGKILL');
    },
  };
}

async function dockerCompose(args: string[]): Promise<void> {
  // Use the plugin-style CLI ("docker compose") to match modern setups.
  await runCommandAndWait('docker', ['compose', ...args], {
    cwd: ONCHAIN_ACTIONS_DIR,
    env: process.env,
  });
}

export default async function onchainActionsGlobalSetup(): Promise<Cleanup> {
  // Ensure tests target the local server started by this global setup.
  process.env['ONCHAIN_ACTIONS_BASE_URL'] = `http://localhost:${ONCHAIN_ACTIONS_PORT}`;

  // Start Memgraph (required by onchain-actions container initialization).
  await dockerCompose(['-f', MEMGRAPH_COMPOSE_FILE, 'up', '-d', 'memgraph']);
  await waitForTcpPort({ host: '127.0.0.1', port: 7687, timeoutMs: 30_000 });

  // Start onchain-actions REST server.
  const onchainActionsEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(ONCHAIN_ACTIONS_PORT),
    MEMGRAPH_HOST: 'localhost',
    MEMGRAPH_BOLT_PORT: '7687',
    MEMGRAPH_LAB_PORT: '7444',
    TEST_ENV: 'mock',
    // Avoid heavy/long-running services and first-import loops during tests.
    SKIP_FIRST_IMPORT: 'false',
    ENABLE_CONTRACT_SNIPER: 'false',
    PRE_FETCH_GMX_MARKET_QUERY: 'false',
    GMX_SKIP_SIMULATION: 'true',
    // Minimal required settings for container init.
    COINGECKO_API_KEY: process.env['COINGECKO_API_KEY'] ?? '',
    COINGECKO_USE_PRO: process.env['COINGECKO_USE_PRO'] ?? 'false',
    SQUID_INTEGRATOR_ID: process.env['SQUID_INTEGRATOR_ID'] ?? 'test',
    DUNE_API_KEY: process.env['DUNE_API_KEY'] ?? 'test',
    BIRDEYE_API_KEY: process.env['BIRDEYE_API_KEY'] ?? '',
    PENDLE_CHAIN_IDS: process.env['PENDLE_CHAIN_IDS'] ?? '42161',
    ALGEBRA_CHAIN_IDS: process.env['ALGEBRA_CHAIN_IDS'] ?? '42161',
    GMX_CHAIN_IDS: process.env['GMX_CHAIN_IDS'] ?? '42161',
    SERVICE_WALLET_PRIVATE_KEY:
      process.env['SERVICE_WALLET_PRIVATE_KEY'] ?? `0x${'1'.repeat(64)}`,
    DUST_CHAIN_ID: process.env['DUST_CHAIN_ID'] ?? '1',
    DUST_CHAIN_RECEIVER_ADDRESS:
      process.env['DUST_CHAIN_RECEIVER_ADDRESS'] ??
      '0x0000000000000000000000000000000000000000',
  };

  const server = spawnLongLivedCommand('pnpm', ['dev'], {
    cwd: ONCHAIN_ACTIONS_DIR,
    env: onchainActionsEnv,
  });

  // Wait for server readiness.
  await waitForHttpOk(HEALTH_URL, 60_000);
  const earlyExit = server.getExitError();
  if (earlyExit) {
    throw earlyExit;
  }
  // Wait for plugin import to populate GMX perpetual markets.
  await waitForNonEmptyMarkets(MARKETS_URL, 120_000);
  const postImportExit = server.getExitError();
  if (postImportExit) {
    throw postImportExit;
  }

  return async () => {
    await server.cleanup();
    await dockerCompose(['-f', MEMGRAPH_COMPOSE_FILE, 'down', '--remove-orphans']);
  };
}
