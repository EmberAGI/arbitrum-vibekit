import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

type Cleanup = () => Promise<void> | void;
type Child = ReturnType<typeof spawn>;

export interface LangGraphE2EGlobalSetupOptions {
  appDir: string;
  graphId: string;
  defaultPort: number;
}

function killProcessTree(child: Child, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (!pid) {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-pid, signal);
    return;
  } catch {
    // Fall through to direct kill.
  }

  child.kill(signal);
}

function resolvePnpmInvocation(): { command: string; prefixArgs: string[] } {
  const execPath = process.env.npm_execpath;
  const nodePath = process.env.npm_node_execpath;
  if (execPath && nodePath && execPath.endsWith('.js')) {
    return { command: nodePath, prefixArgs: [execPath] };
  }

  return { command: 'pnpm', prefixArgs: [] };
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
        `LangGraph process exited before becoming ready (code=${params.child.exitCode}).` +
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

    await new Promise((resolve) => setTimeout(resolve, 250));
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
    if (child.exitCode !== null) {
      return;
    }

    killProcessTree(child, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (child.exitCode === null) {
      killProcessTree(child, 'SIGKILL');
    }
  };

  return { child, output, cleanup };
}

function resolveLocalBaseUrl(preferredPort: number): Promise<{ baseUrl: string; port: number }> {
  const raw = process.env['LANGGRAPH_DEPLOYMENT_URL'];
  if (!raw) {
    return Promise.resolve({ baseUrl: `http://127.0.0.1:${preferredPort}`, port: preferredPort });
  }

  try {
    const url = new URL(raw);
    const localHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    const parsedPort = Number(url.port);
    if (!localHost || !Number.isFinite(parsedPort) || parsedPort <= 0) {
      return getFreePort().then((port) => ({ baseUrl: `http://127.0.0.1:${port}`, port }));
    }
    return Promise.resolve({ baseUrl: `http://127.0.0.1:${parsedPort}`, port: parsedPort });
  } catch {
    return Promise.resolve({ baseUrl: `http://127.0.0.1:${preferredPort}`, port: preferredPort });
  }
}

export function createLangGraphE2EGlobalSetup(
  options: LangGraphE2EGlobalSetupOptions,
): () => Promise<Cleanup> {
  return async () => {
    const cleanups: Cleanup[] = [];
    const envPath = path.join(options.appDir, '.env');
    const envCreatedBySetup = !fs.existsSync(envPath);

    try {
      if (envCreatedBySetup) {
        fs.writeFileSync(envPath, '');
      }

      const { baseUrl, port } = await resolveLocalBaseUrl(options.defaultPort);
      process.env['LANGGRAPH_DEPLOYMENT_URL'] = baseUrl;
      process.env['LANGGRAPH_GRAPH_ID'] = options.graphId;

      const langgraph = spawnProcess({
        cwd: options.appDir,
        args: [
          'exec',
          'langgraphjs',
          'dev',
          '--port',
          String(port),
          '--host',
          '127.0.0.1',
          '--no-browser',
          '--config',
          '.',
        ],
        env: {
          ...process.env,
          LANGGRAPH_DEPLOYMENT_URL: baseUrl,
          LANGGRAPH_GRAPH_ID: options.graphId,
        },
      });
      cleanups.push(langgraph.cleanup);

      await waitForHttp({
        url: `${baseUrl}/threads/00000000-0000-0000-0000-000000000000/state`,
        timeoutMs: 60_000,
        child: langgraph.child,
        childOutput: langgraph.output,
        predicate: (res) => res.status === 404 || res.ok,
      });

      return async () => {
        for (const cleanup of cleanups.reverse()) {
          await cleanup();
        }

        if (envCreatedBySetup && fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
        }
      };
    } catch (error) {
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch {
          // Ignore cleanup errors and preserve original failure.
        }
      }

      if (envCreatedBySetup && fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }

      throw error;
    }
  };
}
