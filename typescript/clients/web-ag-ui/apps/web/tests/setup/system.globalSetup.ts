import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';

type Cleanup = () => Promise<void> | void;
type Child = ReturnType<typeof spawn>;

function killProcessTree(child: Child, signal: NodeJS.Signals): void {
  // `pnpm dev` frequently spawns a child node process. Use a new process group and kill
  // the group so we don't leave stray processes holding the Vitest runner open.
  const pid = child.pid;
  if (!pid) {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    // Fallback: best-effort direct kill.
  }
  child.kill(signal);
}

function resolveBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

function resolvePnpmInvocation(): { command: string; prefixArgs: string[] } {
  const execPath = process.env.npm_execpath;
  const nodePath = process.env.npm_node_execpath;
  if (execPath && nodePath && execPath.endsWith('.js')) {
    return { command: nodePath, prefixArgs: [execPath] };
  }
  return { command: 'pnpm', prefixArgs: [] };
}

function resolveForgeRoot(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const marker = `${path.sep}worktrees${path.sep}`;
  const index = currentFilePath.lastIndexOf(marker);
  if (index < 0) {
    return process.cwd();
  }
  return currentFilePath.slice(0, index);
}

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    const key = normalized.slice(0, idx).trim();
    if (!key) continue;
    let value = normalized.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFileIfPresent(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // best-effort: env files are optional
  }
}

function loadAgentTestEnv(): void {
  // E2E tests run from apps/web, but the Allora configuration belongs to the agent.
  // Load agent-gmx-allora `.env.test`/`.env.test.example` as a fallback (without overriding
  // any already-provided environment variables).
  const agentDir = path.resolve(process.cwd(), '..', 'agent-gmx-allora');
  loadEnvFileIfPresent(path.join(agentDir, '.env.test'));
  loadEnvFileIfPresent(path.join(agentDir, '.env.test.example'));
}

function resolveOnchainActionsDir(): string {
  const override = process.env['ONCHAIN_ACTIONS_WORKTREE_DIR'];
  if (override && override.trim().length > 0) {
    return override.trim();
  }

  const worktreesDir = path.join(resolveForgeRoot(), 'worktrees');
  try {
    const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('onchain-actions-'))
      .map((entry) => path.join(worktreesDir, entry.name))
      .filter((dir) => {
        return (
          fs.existsSync(path.join(dir, 'package.json')) &&
          fs.existsSync(path.join(dir, 'compose.dev.db.yaml'))
        );
      });

    if (candidates.length === 1) {
      return candidates[0]!;
    }
    if (candidates.length > 1) {
      throw new Error(
        `Multiple onchain-actions worktrees found. Set ONCHAIN_ACTIONS_WORKTREE_DIR explicitly.\n` +
          candidates.map((value) => `- ${value}`).join('\n'),
      );
    }
  } catch {
    // fall through to error below
  }

  throw new Error(
    `Unable to locate an onchain-actions worktree.\n` +
      `Set ONCHAIN_ACTIONS_WORKTREE_DIR to an existing worktree directory (e.g. .../worktrees/onchain-actions-XXX).`,
  );
}

function resolvePnpmBin(): string {
  const home = process.env['HOME'];
  const toolBases = home
    ? [
        path.join(home, 'Library', 'pnpm', '.tools', 'pnpm'),
        path.join(home, '.local', 'share', 'pnpm', '.tools', 'pnpm'),
      ]
    : [];

  const toolCandidates: string[] = [];
  for (const base of toolBases) {
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const bin = path.join(base, entry.name, 'bin', 'pnpm');
        if (fs.existsSync(bin)) {
          toolCandidates.push(bin);
        }
      }
    } catch {
      // ignore
    }
  }

  const candidates = [
    process.env['PNPM_BINARY'],
    ...toolCandidates,
    '/usr/local/bin/pnpm',
    '/opt/homebrew/bin/pnpm',
    'pnpm',
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  let best: { bin: string; major: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) {
      continue;
    }
    try {
      const version = execFileSync(candidate, ['-v'], { encoding: 'utf8' }).trim();
      const major = Number(version.split('.')[0] ?? NaN);
      if (!Number.isFinite(major)) {
        continue;
      }
      if (!best || major > best.major) {
        best = { bin: candidate, major };
      }
      // Prefer pnpm v10+ immediately.
      if (major >= 10) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return best?.bin ?? 'pnpm';
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to resolve an ephemeral port.')));
        return;
      }
      const port = address.port;
      server.close((closeErr) => (closeErr ? reject(closeErr) : resolve(port)));
    });
  });
}

async function waitForHttp(params: {
  url: string;
  timeoutMs: number;
  child?: Child;
  childOutput?: string[];
  predicate?: (res: Response) => boolean;
}): Promise<void> {
  const start = Date.now();
  const predicate = params.predicate ?? ((res) => res.status >= 200);

  while (Date.now() - start < params.timeoutMs) {
    if (params.child && params.child.exitCode !== null) {
      const logs = params.childOutput?.slice(-80).join('\n') ?? '';
      throw new Error(
        `Server process exited before becoming ready (code=${params.child.exitCode}).` +
          (logs ? `\nLast logs:\n${logs}` : ''),
      );
    }

    try {
      const res = await fetch(params.url);
      if (predicate(res)) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  const logs = params.childOutput?.slice(-80).join('\n') ?? '';
  throw new Error(`Timed out waiting for ${params.url}` + (logs ? `\nLast logs:\n${logs}` : ''));
}

function spawnProcess(params: {
  cwd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}): { child: Child; output: string[]; cleanup: Cleanup } {
  const pnpm = resolvePnpmInvocation();
  const child = spawn(pnpm.command, [...pnpm.prefixArgs, ...params.args], {
    cwd: params.cwd,
    env: { ...process.env, ...params.env },
    detached: true,
    stdio: 'pipe',
  });

  const output: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));

  const cleanup: Cleanup = async () => {
    if (child.exitCode !== null) return;
    killProcessTree(child, 'SIGTERM');
    await new Promise((r) => setTimeout(r, 2_000));
    if (child.exitCode === null) {
      killProcessTree(child, 'SIGKILL');
    }
  };

  return { child, output, cleanup };
}

async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
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

async function runCommandAndWait(cmd: string, args: string[], cwd: string): Promise<void> {
  const child = spawn(cmd, args, {
    cwd,
    env: process.env,
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

async function dockerCompose(dir: string, args: string[]): Promise<void> {
  await runCommandAndWait('docker', ['compose', ...args], dir);
}

async function startOnchainActions(): Promise<{ baseUrl: string; cleanup: Cleanup }> {
  const ONCHAIN_ACTIONS_DIR = resolveOnchainActionsDir();
  const MEMGRAPH_COMPOSE_FILE =
    process.env['ONCHAIN_ACTIONS_MEMGRAPH_COMPOSE_FILE'] ??
    path.join(ONCHAIN_ACTIONS_DIR, 'compose.dev.db.yaml');

  const ONCHAIN_ACTIONS_PORT = 50051;
  const baseUrl = `http://127.0.0.1:${ONCHAIN_ACTIONS_PORT}`;
  const HEALTH_URL = `${baseUrl}/health`;
  const MARKETS_URL = `${baseUrl}/perpetuals/markets?chainIds=42161`;

  // Ensure tests target the local server started by this setup.
  process.env['ONCHAIN_ACTIONS_BASE_URL'] = baseUrl;

  await dockerCompose(ONCHAIN_ACTIONS_DIR, ['-f', MEMGRAPH_COMPOSE_FILE, 'up', '-d', 'memgraph']);
  await waitForTcpPort({ host: '127.0.0.1', port: 7687, timeoutMs: 30_000 });

  const pnpmBin = resolvePnpmBin();
  try {
    const version = execFileSync(pnpmBin, ['-v'], { encoding: 'utf8' }).trim();
    console.log('[web-e2e] pnpm for onchain-actions', { pnpmBin, version });
    if (!version.startsWith('10.')) {
      console.warn('[web-e2e] pnpm version for onchain-actions is not v10+', { pnpmBin, version });
    }
  } catch (error) {
    console.warn('[web-e2e] Unable to read pnpm version for onchain-actions', {
      pnpmBin,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const server = spawn(pnpmBin, ['dev'], {
    cwd: ONCHAIN_ACTIONS_DIR,
    env: {
      ...process.env,
      PORT: String(ONCHAIN_ACTIONS_PORT),
      MEMGRAPH_HOST: 'localhost',
      MEMGRAPH_BOLT_PORT: '7687',
      MEMGRAPH_LAB_PORT: '7444',
      TEST_ENV: 'mock',
      SKIP_FIRST_IMPORT: 'false',
      ENABLE_CONTRACT_SNIPER: 'false',
      PRE_FETCH_GMX_MARKET_QUERY: 'false',
      GMX_SKIP_SIMULATION: 'true',
      COINGECKO_API_KEY: process.env['COINGECKO_API_KEY'] ?? '',
      COINGECKO_USE_PRO: process.env['COINGECKO_USE_PRO'] ?? 'false',
      SQUID_INTEGRATOR_ID: process.env['SQUID_INTEGRATOR_ID'] ?? 'test',
      DUNE_API_KEY: process.env['DUNE_API_KEY'] ?? 'test',
      BIRDEYE_API_KEY: process.env['BIRDEYE_API_KEY'] ?? '',
      PENDLE_CHAIN_IDS: process.env['PENDLE_CHAIN_IDS'] ?? '42161',
      ALGEBRA_CHAIN_IDS: process.env['ALGEBRA_CHAIN_IDS'] ?? '42161',
      GMX_CHAIN_IDS: process.env['GMX_CHAIN_IDS'] ?? '42161',
      SERVICE_WALLET_PRIVATE_KEY: process.env['SERVICE_WALLET_PRIVATE_KEY'] ?? `0x${'1'.repeat(64)}`,
      DUST_CHAIN_ID: process.env['DUST_CHAIN_ID'] ?? '1',
      DUST_CHAIN_RECEIVER_ADDRESS:
        process.env['DUST_CHAIN_RECEIVER_ADDRESS'] ?? '0x0000000000000000000000000000000000000000',
    },
    detached: true,
    stdio: 'inherit',
  });

  let exitError: Error | undefined;
  server.once('exit', (code, signal) => {
    if (code === 0) return;
    exitError = new Error(
      `onchain-actions exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
    );
  });
  server.once('error', (error) => {
    exitError = error instanceof Error ? error : new Error(String(error));
  });

  await waitForHttpOk(HEALTH_URL, 60_000);
  if (exitError) throw exitError;

  // onchain-actions performs a fairly heavy initial import (and may be rate-limited by CoinGecko),
  // so give it enough time to hydrate the GMX markets list before running UI/system E2E tests.
  await waitForNonEmptyMarkets(MARKETS_URL, 240_000);
  if (exitError) throw exitError;

  return {
    baseUrl,
    cleanup: async () => {
      if (server.exitCode === null) {
        killProcessTree(server, 'SIGTERM');
        for (let i = 0; i < 20; i += 1) {
          if (server.exitCode !== null) break;
          await delay(100);
        }
        if (server.exitCode === null) {
          killProcessTree(server, 'SIGKILL');
        }
      }
      await dockerCompose(ONCHAIN_ACTIONS_DIR, ['-f', MEMGRAPH_COMPOSE_FILE, 'down', '--remove-orphans']);
    },
  };
}

async function startMockAlloraServer(): Promise<{
  baseUrl: string;
  cleanup: Cleanup;
}> {
  const counters: Record<string, number> = {};
  const stableWindowRequests = 3;

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end('Missing URL');
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    const match = url.pathname.match(/^\/v2\/allora\/consumer\/(.+)$/u);
    if (!match) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const topicId = url.searchParams.get('allora_topic_id') ?? '0';
    // Alternate between two extremes so UIs/tests can easily detect that they're
    // talking to the mock server and can observe changes across polling cycles.
    // BTC=14, ETH=2 (8h feed); any other topic returns a stable default.
    const combined = (() => {
      if (topicId !== '14' && topicId !== '2') {
        return '100';
      }
      const next = (counters[topicId] ?? 0) + 1;
      counters[topicId] = next;
      const phase = Math.floor((next - 1) / stableWindowRequests) % 2;
      return phase === 0 ? '1' : '100000';
    })();

    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: true,
        data: {
          inference_data: {
            topic_id: topicId,
            network_inference_normalized: combined,
          },
        },
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to resolve mock Allora server address.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    cleanup: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export default async function systemGlobalSetup(): Promise<Cleanup> {
  // 1) Start onchain-actions + memgraph.
  const onchain = await startOnchainActions();
  const onchainCleanup = onchain.cleanup;
  const onchainBaseUrl = onchain.baseUrl;

  // Load agent test env to pick up Allora configuration (e.g. ALLORA_API_BASE_URL).
  loadAgentTestEnv();

  // 2) Start mock Allora API and point the agent runtime at it.
  const shouldUseRealAllora = resolveBooleanEnv('WEB_E2E_USE_REAL_ALLORA', false);
  const mockAllora = shouldUseRealAllora ? undefined : await startMockAlloraServer();

  const alloraBaseUrl = shouldUseRealAllora
    ? process.env['ALLORA_API_BASE_URL'] ?? 'https://api.allora.network'
    : mockAllora!.baseUrl;

  process.env.ALLORA_API_BASE_URL = alloraBaseUrl;

  // 3) Start LangGraph runtime for agent-gmx-allora.
  const langgraphPort = await getFreePort();
  const langgraphBaseUrl = `http://127.0.0.1:${langgraphPort}`;
  process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL = langgraphBaseUrl;
  process.env.WEB_E2E_LANGGRAPH_BASE_URL = langgraphBaseUrl;

  const langgraph = spawnProcess({
    cwd: process.cwd(), // apps/web
    args: [
      'exec',
      'langgraphjs',
      'dev',
      '--port',
      String(langgraphPort),
      '--host',
      '127.0.0.1',
      '--no-browser',
      '--config',
      '../agent-gmx-allora',
    ],
    env: {
      ...process.env,
      DELEGATIONS_BYPASS: 'true',
      GMX_ALLORA_MODE: 'debug',
      ONCHAIN_ACTIONS_BASE_URL: onchainBaseUrl,
      ALLORA_API_BASE_URL: alloraBaseUrl,
    },
  });

  // Server returns 404 on unknown thread state, but that still proves it's accepting connections.
  await waitForHttp({
    url: `${langgraphBaseUrl}/threads/00000000-0000-0000-0000-000000000000/state`,
    timeoutMs: 60_000,
    child: langgraph.child,
    childOutput: langgraph.output,
    predicate: (res) => res.status === 404,
  });

  // 4) Start the web app server.
  const webPort = await getFreePort();
  const webBaseUrl = `http://127.0.0.1:${webPort}`;
  process.env.WEB_E2E_BASE_URL = webBaseUrl;

  // If a previous dev server crashed, it can leave a stale lock file behind.
  try {
    const lockPath = path.join(process.cwd(), '.next', 'dev', 'lock');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // ignore
  }

  const web = spawnProcess({
    cwd: process.cwd(), // apps/web
    args: ['dev', '-p', String(webPort), '-H', '127.0.0.1'],
    env: {
      ...process.env,
      LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL: langgraphBaseUrl,
      // Keep other agents from failing if the UI touches them.
      LANGGRAPH_DEPLOYMENT_URL: langgraphBaseUrl,
      LANGGRAPH_PENDLE_DEPLOYMENT_URL: langgraphBaseUrl,
    },
  });

  await waitForHttp({
    url: `${webBaseUrl}/hire-agents`,
    timeoutMs: 120_000,
    child: web.child,
    childOutput: web.output,
    predicate: (res) => res.status === 200,
  });

  console.log('[web-e2e] services ready', {
    webBaseUrl,
    langgraphBaseUrl,
    onchainActionsBaseUrl: onchainBaseUrl,
    alloraMockBaseUrl: shouldUseRealAllora ? undefined : alloraBaseUrl,
  });

  return async () => {
    await web.cleanup();
    await langgraph.cleanup();
    await mockAllora?.cleanup();
    await onchainCleanup();
  };
}
