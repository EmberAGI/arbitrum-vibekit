import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll } from 'vitest';

const DEFAULT_LANGGRAPH_URL = 'http://localhost:8124';
const STARTUP_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 250;

let langgraphProcess: ChildProcess | null = null;

const resolveDeploymentUrl = () => {
  const envValue = process.env['LANGGRAPH_DEPLOYMENT_URL'];
  if (envValue && envValue.trim().length > 0) {
    return envValue.trim();
  }
  process.env['LANGGRAPH_DEPLOYMENT_URL'] = DEFAULT_LANGGRAPH_URL;
  return DEFAULT_LANGGRAPH_URL;
};

const isLocalhost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const isPortOpen = async (hostname: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: hostname, port });
    const finalize = (value: boolean) => {
      socket.removeAllListeners();
      socket.end();
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finalize(true));
    socket.once('error', () => finalize(false));
    socket.once('timeout', () => finalize(false));
    socket.setTimeout(500);
  });

const waitForPort = async (hostname: string, port: number, timeoutMs: number) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(hostname, port)) {
      return;
    }
    await delay(RETRY_DELAY_MS);
  }
  throw new Error(`LangGraph server did not start on ${hostname}:${port} within ${timeoutMs}ms.`);
};

const startLangGraph = async (url: URL) => {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const webRoot = process.cwd();
  const agentRoot = path.resolve(webRoot, '..', 'agent-clmm');
  langgraphProcess = spawn(pnpmCommand, ['dev'], {
    cwd: agentRoot,
    env: { ...process.env },
    stdio: 'inherit',
  });

  await waitForPort(url.hostname, Number(url.port), STARTUP_TIMEOUT_MS);
};

beforeAll(async () => {
  const deploymentUrl = resolveDeploymentUrl();
  const parsed = new URL(deploymentUrl);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;

  if (await isPortOpen(parsed.hostname, port)) {
    return;
  }

  if (!isLocalhost(parsed.hostname)) {
    throw new Error(
      `LANGGRAPH_DEPLOYMENT_URL (${deploymentUrl}) is not reachable and is not local. ` +
        'Start LangGraph separately or point to a reachable deployment.',
    );
  }

  await startLangGraph(new URL(`http://${parsed.hostname}:${port}`));
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
  if (!langgraphProcess) {
    return;
  }

  langgraphProcess.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    langgraphProcess?.once('exit', () => resolve());
    setTimeout(resolve, 2000);
  });
  langgraphProcess = null;
});
