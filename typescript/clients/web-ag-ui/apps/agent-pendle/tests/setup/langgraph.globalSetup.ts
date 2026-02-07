import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Cleanup = () => Promise<void> | void;

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  predicate: (res: Response) => boolean;
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(params.url);
      if (params.predicate(response)) {
        return;
      }
      lastError = new Error(`Non-ready response: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for ${params.url}: ${message}`);
}

function resolveAgentRootDir(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  // .../apps/agent-pendle/tests/setup -> .../apps/agent-pendle
  return path.resolve(path.dirname(currentFilePath), '..', '..');
}

function spawnLongLived(params: {
  cwd: string;
  port: number;
  env: NodeJS.ProcessEnv;
}): { cleanup: Cleanup; getExitError: () => Error | undefined } {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'langgraphjs',
      'dev',
      '--port',
      String(params.port),
      '--host',
      '127.0.0.1',
      '--no-browser',
      '--config',
      '.',
    ],
    {
      cwd: params.cwd,
      env: params.env,
      stdio: 'inherit',
    },
  );

  let exitError: Error | undefined;
  child.once('exit', (code, signal) => {
    if (code === 0) {
      return;
    }
    exitError = new Error(
      `langgraphjs dev exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
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

export default async function langgraphGlobalSetup(): Promise<Cleanup> {
  const agentRoot = resolveAgentRootDir();

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  process.env['LANGGRAPH_DEPLOYMENT_URL'] = baseUrl;
  process.env['LANGGRAPH_GRAPH_ID'] = process.env['LANGGRAPH_GRAPH_ID'] ?? 'agent-pendle';

  const server = spawnLongLived({
    cwd: agentRoot,
    port,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Keep runs simple in CI: no delegations required.
      DELEGATIONS_BYPASS: process.env['DELEGATIONS_BYPASS'] ?? 'true',
    },
  });

  // LangGraph dev returns 404 on unknown thread state, but that proves it's accepting connections.
  await waitForHttp({
    url: `${baseUrl}/threads/00000000-0000-0000-0000-000000000000/state`,
    timeoutMs: 60_000,
    predicate: (res) => res.status === 404,
  });

  const earlyExit = server.getExitError();
  if (earlyExit) {
    throw earlyExit;
  }

  return async () => {
    await server.cleanup();
  };
}
