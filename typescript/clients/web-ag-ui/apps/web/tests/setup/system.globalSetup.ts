import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import fs from 'node:fs';

type Cleanup = () => Promise<void> | void;
type Child = ReturnType<typeof spawn>;
type E2EProfile = 'mocked' | 'live';

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

function resolveE2EProfile(): E2EProfile {
  const raw = process.env['E2E_PROFILE'];
  if (!raw) {
    return 'mocked';
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'live' ? 'live' : 'mocked';
}

function resolvePnpmInvocation(): { command: string; prefixArgs: string[] } {
  const execPath = process.env.npm_execpath;
  const nodePath = process.env.npm_node_execpath;
  if (execPath && nodePath && execPath.endsWith('.js')) {
    return { command: nodePath, prefixArgs: [execPath] };
  }
  return { command: 'pnpm', prefixArgs: [] };
}

function resolveWebAppDir(): string {
  const isWebAppDir = (dir: string) => {
    return fs.existsSync(path.join(dir, 'next.config.mjs')) && fs.existsSync(path.join(dir, 'package.json'));
  };

  const candidates = [
    process.env['INIT_CWD'],
    process.cwd(),
    path.join(process.cwd(), 'web'),
    path.join(process.cwd(), 'apps', 'web'),
    path.join(process.cwd(), 'typescript', 'clients', 'web-ag-ui', 'apps', 'web'),
    path.resolve(process.cwd(), '..', 'apps', 'web'),
    path.resolve(process.cwd(), '..', '..', 'apps', 'web'),
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .map((value) => value.trim());

  for (const candidate of candidates) {
    if (isWebAppDir(candidate)) {
      return candidate;
    }
  }

  // Last resort: fall back to the current working directory.
  return process.cwd();
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
  const agentDir = path.resolve(resolveWebAppDir(), '..', 'agent-gmx-allora');
  loadEnvFileIfPresent(path.join(agentDir, '.env.test'));
  loadEnvFileIfPresent(path.join(agentDir, '.env.test.example'));
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

async function waitForWebApiRoute(params: {
  baseUrl: string;
  timeoutMs: number;
  child?: Child;
  childOutput?: string[];
}): Promise<void> {
  const start = Date.now();
  const url = `${params.baseUrl}/api/agents/sync`;

  while (Date.now() - start < params.timeoutMs) {
    if (params.child && params.child.exitCode !== null) {
      const logs = params.childOutput?.slice(-80).join('\n') ?? '';
      throw new Error(
        `Server process exited before becoming ready (code=${params.child.exitCode}).` +
          (logs ? `\nLast logs:\n${logs}` : ''),
      );
    }

    try {
      // A POST with an invalid payload should yield a 400 if the route is registered.
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 400) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  const logs = params.childOutput?.slice(-80).join('\n') ?? '';
  throw new Error(`Timed out waiting for ${url}` + (logs ? `\nLast logs:\n${logs}` : ''));
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

function normalizeOnchainActionsApiUrl(value: string): string {
  const trimmed = value.trim();
  const noTrailingSlash = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  if (noTrailingSlash.endsWith('/openapi.json')) {
    return noTrailingSlash.slice(0, -'/openapi.json'.length);
  }
  return noTrailingSlash;
}

export default async function systemGlobalSetup(): Promise<Cleanup> {
  const webAppDir = resolveWebAppDir();
  const profile = resolveE2EProfile();
  process.env['E2E_PROFILE'] = profile;

  const cleanups: Cleanup[] = [];

  try {
    // 1) Resolve onchain-actions API URL.
    //
    // Web E2E never boots onchain-actions. In `mocked`, the agent process uses
    // MSW handlers to intercept onchain-actions HTTP calls. In `live`, you must
    // provide a running onchain-actions instance via ONCHAIN_ACTIONS_API_URL.
    loadAgentTestEnv();

    const configuredOnchainActionsUrl = process.env['ONCHAIN_ACTIONS_API_URL'];
    const onchainApiUrl = configuredOnchainActionsUrl
      ? normalizeOnchainActionsApiUrl(configuredOnchainActionsUrl)
      : profile === 'mocked'
        ? 'http://127.0.0.1:50051'
        : (() => {
            throw new Error(
              'E2E_PROFILE=live requires ONCHAIN_ACTIONS_API_URL. Web E2E will not bootstrap onchain-actions.',
            );
          })();

    process.env['ONCHAIN_ACTIONS_API_URL'] = onchainApiUrl;

    // 2) Resolve Allora base URL.
    const alloraBaseUrl = process.env['ALLORA_API_BASE_URL'] ?? 'https://api.allora.network';
    process.env.ALLORA_API_BASE_URL = alloraBaseUrl;

    // 3) Start LangGraph runtime for agent-gmx-allora.
    const langgraphPort = await getFreePort();
    const langgraphBaseUrl = `http://127.0.0.1:${langgraphPort}`;
    process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL = langgraphBaseUrl;
    process.env.WEB_E2E_LANGGRAPH_BASE_URL = langgraphBaseUrl;

    const langgraph = spawnProcess({
      cwd: webAppDir, // apps/web
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
        E2E_PROFILE: profile,
        DELEGATIONS_BYPASS: 'true',
        GMX_ALLORA_MODE: 'debug',
        ONCHAIN_ACTIONS_API_URL: onchainApiUrl,
        ALLORA_API_BASE_URL: alloraBaseUrl,
        ...(profile === 'mocked'
          ? {
              ALLORA_INFERENCE_CACHE_TTL_MS: '0',
              ALLORA_8H_INFERENCE_CACHE_TTL_MS: '0',
            }
          : {}),
      },
    });
    cleanups.push(langgraph.cleanup);

    // Server returns 404 on unknown thread state, but that still proves it's accepting connections.
    await waitForHttp({
      url: `${langgraphBaseUrl}/threads/00000000-0000-0000-0000-000000000000/state`,
      timeoutMs: 60_000,
      child: langgraph.child,
      childOutput: langgraph.output,
      predicate: (res) => res.status === 404 || res.ok,
    });

    // 4) Start the web app server.
    const webPort = await getFreePort();
    const webBaseUrl = `http://127.0.0.1:${webPort}`;
    process.env.WEB_E2E_BASE_URL = webBaseUrl;

    // If a previous dev server crashed, it can leave a stale lock file behind.
    try {
      const lockPath = path.join(webAppDir, '.next', 'dev', 'lock');
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // ignore
    }

    const web = spawnProcess({
      cwd: webAppDir, // apps/web
      args: ['dev', '-p', String(webPort), '-H', '127.0.0.1'],
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        // Avoid Watchpack EMFILE issues in monorepos by using polling instead of
        // file-descriptor heavy native watchers.
        WATCHPACK_POLLING: 'true',
        WATCHPACK_POLLING_INTERVAL: '1000',
        LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL: langgraphBaseUrl,
        // Keep other agents from failing if the UI touches them.
        LANGGRAPH_DEPLOYMENT_URL: langgraphBaseUrl,
        LANGGRAPH_PENDLE_DEPLOYMENT_URL: langgraphBaseUrl,
      },
    });
    cleanups.push(web.cleanup);

    await waitForWebApiRoute({
      baseUrl: webBaseUrl,
      timeoutMs: 120_000,
      child: web.child,
      childOutput: web.output,
    });

    console.log('[web-e2e] services ready', {
      e2eProfile: profile,
      webBaseUrl,
      langgraphBaseUrl,
      onchainActionsApiUrl: onchainApiUrl,
      alloraApiBaseUrl: alloraBaseUrl,
    });

    return async () => {
      for (const cleanup of cleanups.reverse()) {
        await cleanup();
      }
    };
  } catch (error) {
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup();
      } catch {
        // ignore cleanup errors; surface original error
      }
    }
    throw error;
  }
}
