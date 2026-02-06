import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

type Child = ReturnType<typeof spawn>;

const WEB_AG_UI_ROOT = path.resolve(__dirname, '../../../../../../..');
const AGENT_GMX_ALLORA_ROOT = path.resolve(WEB_AG_UI_ROOT, 'apps/agent-gmx-allora');

function resolvePnpmInvocation(): { command: string; prefixArgs: string[] } {
  // When tests are run via pnpm, these env vars should be present and more reliable than PATH.
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
    server.listen(0, () => {
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

async function waitForHttpReady(params: {
  url: string;
  timeoutMs: number;
  child?: Child;
  childOutput?: string[];
}): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < params.timeoutMs) {
    if (params.child && params.child.exitCode !== null) {
      const logs = params.childOutput?.slice(-50).join('\n') ?? '';
      throw new Error(
        `Server process exited before becoming ready (code=${params.child.exitCode}).` +
          (logs ? `\nLast logs:\n${logs}` : ''),
      );
    }
    try {
      const res = await fetch(params.url);
      if (res.status >= 200) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const logs = params.childOutput?.slice(-50).join('\n') ?? '';
  throw new Error(`Timed out waiting for ${params.url}` + (logs ? `\nLast logs:\n${logs}` : ''));
}

function startLangGraphAgent(params: { port: number }): Child {
  // `langgraphjs` is installed at the web-ag-ui workspace root.
  const pnpm = resolvePnpmInvocation();
  return spawn(
    pnpm.command,
    [
      ...pnpm.prefixArgs,
      'exec',
      'langgraphjs',
      'dev',
      '--port',
      String(params.port),
      '--host',
      '127.0.0.1',
      '--no-browser',
      '--config',
      AGENT_GMX_ALLORA_ROOT,
    ],
    {
      cwd: WEB_AG_UI_ROOT,
      stdio: 'pipe',
      env: {
        ...process.env,
        // Keep this as a pure local test; no external deps required for bootstrap/sync.
        DELEGATIONS_BYPASS: 'true',
        GMX_ALLORA_MODE: 'debug',
      },
    },
  );
}

async function stopChild(child: Child): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 2_000));
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

describe('POST /api/agents/sync (e2e)', () => {
  it(
    'syncs against a running GMX Allora LangGraph runtime without stubbing fetch',
    async () => {
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    const child = startLangGraphAgent({ port });
    try {
    const childOutput: string[] = [];
    child.stdout?.on('data', (chunk: Buffer) => childOutput.push(chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => childOutput.push(chunk.toString('utf8')));

      await waitForHttpReady({
        // LangGraph dev server doesn't expose `/openapi.json`; use a known endpoint that returns 404
        // once the HTTP server is accepting connections.
        url: `${baseUrl}/threads/00000000-0000-0000-0000-000000000000/state`,
        timeoutMs: 60_000,
        child,
        childOutput,
      });

      const previous = process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL;
      process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL = baseUrl;

      vi.resetModules();
      const { POST } = await import('./route');

      const threadId = crypto.randomUUID();
      const request = {
        json: async () => ({ agentId: 'agent-gmx-allora', threadId }),
      };

      const res = await POST(request as never);
      expect(res.status).toBe(200);

      const payload = (await res.json()) as {
        profile: null | { protocols?: unknown; tokens?: unknown };
        metrics: unknown;
        error?: unknown;
        details?: unknown;
      };

      expect(payload.error).toBeUndefined();
      expect(payload.details).toBeUndefined();

      expect(payload.profile).not.toBeNull();
      expect(Array.isArray(payload.profile?.protocols)).toBe(true);
      expect((payload.profile?.protocols as string[])).toEqual(expect.arrayContaining(['GMX', 'Allora']));
      expect(payload.metrics).not.toBeNull();

      process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL = previous;
    } finally {
      await stopChild(child);
    }
    },
    180_000,
  );
});
