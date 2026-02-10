import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function requireHexAddressEnv(name: string): `0x${string}` {
  const value = requireEnv(name);
  if (!value.startsWith('0x')) {
    throw new Error(`Env var ${name} must be a hex address, got: ${value}`);
  }
  return value as `0x${string}`;
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

type AgentSyncResponse = {
  agentId: string;
  error?: string;
  details?: string;
  profile: null | { protocols?: unknown };
  metrics: unknown;
  activity: null | { telemetry?: unknown; events?: unknown };
};

async function ensureThread(baseUrl: string, threadId: string, graphId: string): Promise<void> {
  const res = await fetch(`${baseUrl}/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, if_exists: 'do_nothing', metadata: { graph_id: graphId } }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create thread: ${res.status} ${await res.text()}`);
  }

  const patch = await fetch(`${baseUrl}/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ metadata: { graph_id: graphId } }),
  });
  if (!patch.ok) {
    throw new Error(`Failed to patch thread metadata: ${patch.status} ${await patch.text()}`);
  }
}

async function updateThreadState(params: {
  baseUrl: string;
  threadId: string;
  values: unknown;
}): Promise<void> {
  const res = await fetch(`${params.baseUrl}/threads/${params.threadId}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Use a plain state update for non-message fields; `as_node` updates can be
    // interpreted as a node execution and may not apply arbitrary `view/private`
    // patches the way we expect.
    body: JSON.stringify({ values: params.values }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update thread state: ${res.status} ${await res.text()}`);
  }
}

async function sendCommand(params: {
  baseUrl: string;
  threadId: string;
  command: 'cycle' | 'sync';
}): Promise<void> {
  const message = {
    id: crypto.randomUUID(),
    role: 'user',
    content: JSON.stringify({ command: params.command }),
  };

  const res = await fetch(`${params.baseUrl}/threads/${params.threadId}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ values: { messages: [message] }, as_node: 'runCommand' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to send command: ${res.status} ${await res.text()}`);
  }
}

async function createRun(params: {
  baseUrl: string;
  threadId: string;
  graphId: string;
}): Promise<string> {
  const res = await fetch(`${params.baseUrl}/threads/${params.threadId}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assistant_id: params.graphId,
      input: null,
      config: { configurable: { thread_id: params.threadId }, durability: 'exit' },
      stream_mode: ['values'],
      stream_resumable: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to create run: ${res.status} ${text}`);
  }
  const payload = JSON.parse(text) as { run_id?: string };
  if (!payload.run_id) {
    throw new Error(`Run response missing run_id: ${text}`);
  }
  return payload.run_id;
}

async function waitForRunCompletion(params: {
  baseUrl: string;
  threadId: string;
  runId: string;
  timeoutMs: number;
}): Promise<void> {
  const start = Date.now();
  const running = new Set(['pending', 'queued', 'running']);

  while (Date.now() - start < params.timeoutMs) {
    const res = await fetch(`${params.baseUrl}/threads/${params.threadId}/runs/${params.runId}`);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Failed to poll run status: ${res.status} ${text}`);
    }
    const payload = JSON.parse(text) as { status?: string };
    const status = (payload.status ?? '').toLowerCase();
    if (!running.has(status)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(`Run did not complete within ${params.timeoutMs}ms`);
}

describe('GMX Allora full system (web + agent runtime + onchain-actions)', () => {
  it('web /api/agents/sync succeeds when agent runtime is up', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');

    const threadId = crypto.randomUUID();
    const { status, json } = await postJson<AgentSyncResponse>(`${webBaseUrl}/api/agents/sync`, {
      agentId: 'agent-gmx-allora',
      threadId,
    });

    expect(status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.details).toBeUndefined();
    expect(json.profile).not.toBeNull();
    expect(Array.isArray(json.profile?.protocols)).toBe(true);
    expect(json.metrics).not.toBeNull();
  });

  it('cycle run produces telemetry/artifacts and the web sync can read them', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');
    const langgraphBaseUrl = requireEnv('WEB_E2E_LANGGRAPH_BASE_URL');

    const graphId = 'agent-gmx-allora';
    const threadId = crypto.randomUUID();

    // Bootstrap via web sync (ensures the thread exists and the graph can respond).
    const initial = await postJson<AgentSyncResponse>(`${webBaseUrl}/api/agents/sync`, {
      agentId: graphId,
      threadId,
    });
    expect(initial.status).toBe(200);

    await ensureThread(langgraphBaseUrl, threadId, graphId);

    // Prime state so the cycle path can run without a full interactive onboarding.
    const selectedPool = {
      address: '0x0000000000000000000000000000000000000001',
      baseSymbol: 'BTC',
      quoteSymbol: 'USDC',
      token0: { symbol: 'BTC' },
      token1: { symbol: 'USDC' },
      maxLeverage: 2,
    };

    const agentWalletAddress = requireHexAddressEnv('SMOKE_WALLET');
    const operatorConfig = {
      delegatorWalletAddress: agentWalletAddress,
      delegateeWalletAddress: agentWalletAddress,
      baseContributionUsd: 250,
      fundingTokenAddress: '0x1111111111111111111111111111111111111111',
      targetMarket: selectedPool,
      maxLeverage: 2,
    };

    await updateThreadState({
      baseUrl: langgraphBaseUrl,
      threadId,
      values: {
        private: {
          bootstrapped: true,
          pollIntervalMs: 1000,
          streamLimit: 10,
          cronScheduled: false,
        },
        view: {
          delegationsBypassActive: true,
          operatorConfig,
          selectedPool,
          // Preserve shape expected by reducers.
          activity: { telemetry: [], events: [] },
          profile: { chains: [], protocols: [], tokens: [], pools: [], allowedPools: [] },
          metrics: { iteration: 0, previousPrice: 47000, cyclesSinceRebalance: 0, staleCycles: 0 },
          transactionHistory: [],
        },
      },
    });

    // Now send the command using the same `as_node` pattern the web route uses.
    await sendCommand({ baseUrl: langgraphBaseUrl, threadId, command: 'cycle' });

    const runId = await createRun({ baseUrl: langgraphBaseUrl, threadId, graphId });
    await waitForRunCompletion({ baseUrl: langgraphBaseUrl, threadId, runId, timeoutMs: 120_000 });

    const after = await postJson<AgentSyncResponse>(`${webBaseUrl}/api/agents/sync`, {
      agentId: graphId,
      threadId,
    });
    expect(after.status).toBe(200);
    expect(after.json.error).toBeUndefined();

    const activity = after.json.activity as { telemetry?: unknown; events?: unknown } | null;
    expect(activity).not.toBeNull();
    expect(Array.isArray(activity?.telemetry)).toBe(true);
    const telemetry = activity?.telemetry as unknown[];
    if (telemetry.length === 0) {
      const threadState = await fetch(`${langgraphBaseUrl}/threads/${threadId}/state`).then(
        async (res) => ({
          status: res.status,
          body: await res.text(),
        }),
      );
      throw new Error(
        [
          'Expected cycle run telemetry, but got empty telemetry array.',
          `web sync: ${JSON.stringify(after.json)}`,
          `langgraph state (status=${threadState.status}): ${threadState.body}`,
        ].join('\n'),
      );
    }
    expect(telemetry.length).toBeGreaterThan(0);
    expect(Array.isArray(activity?.events)).toBe(true);

    const events = activity?.events as Array<Record<string, unknown>>;
    const hasPlanArtifact = events.some(
      (event) =>
        event?.type === 'artifact' &&
        typeof event.artifact === 'object' &&
        event.artifact !== null &&
        (event.artifact as Record<string, unknown>).artifactId === 'gmx-allora-execution-plan',
    );
    expect(hasPlanArtifact).toBe(true);
  }, 180_000);
});
