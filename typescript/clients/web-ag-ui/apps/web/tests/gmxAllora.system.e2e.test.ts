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

type CycleSnapshot = {
  iteration: number;
  action: string;
  reason: string;
  assumedPositionSide?: string;
  hasExecutionPlan: boolean;
  executionPlanAction?: string;
  executionOk?: boolean;
  executionError?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

function parseCycleSnapshot(sync: AgentSyncResponse): CycleSnapshot {
  if (!isRecord(sync.metrics)) {
    throw new Error(`Sync response metrics missing: ${JSON.stringify(sync)}`);
  }

  const iteration = sync.metrics['iteration'];
  const latestCycle = sync.metrics['latestCycle'];
  if (typeof iteration !== 'number' || !isRecord(latestCycle)) {
    throw new Error(`Sync response latestCycle missing: ${JSON.stringify(sync.metrics)}`);
  }

  const action = latestCycle['action'];
  const reason = latestCycle['reason'];
  if (typeof action !== 'string' || typeof reason !== 'string') {
    throw new Error(`latestCycle missing action/reason: ${JSON.stringify(latestCycle)}`);
  }
  const assumedPositionSide =
    typeof sync.metrics['assumedPositionSide'] === 'string'
      ? sync.metrics['assumedPositionSide']
      : undefined;

  let hasExecutionPlan = false;
  let executionPlanAction: string | undefined;
  let executionOk: boolean | undefined;
  let executionError: string | undefined;
  const events = sync.activity?.events;
  if (Array.isArray(events)) {
    for (const rawEvent of events) {
      if (!isRecord(rawEvent) || rawEvent['type'] !== 'artifact' || !isRecord(rawEvent['artifact'])) {
        continue;
      }
      const artifact = rawEvent['artifact'];
      const artifactId = artifact['artifactId'];
      if (artifactId !== 'gmx-allora-execution-plan' && artifactId !== 'gmx-allora-execution-result') {
        continue;
      }
      const parts = artifact['parts'];
      if (!Array.isArray(parts)) {
        continue;
      }
      for (const rawPart of parts) {
        if (!isRecord(rawPart) || rawPart['kind'] !== 'data' || !isRecord(rawPart['data'])) {
          continue;
        }
        const data = rawPart['data'];
        if (artifactId === 'gmx-allora-execution-plan') {
          hasExecutionPlan = true;
          const planAction = data['action'];
          if (typeof planAction === 'string') {
            executionPlanAction = planAction;
          }
          continue;
        }
        const ok = data['ok'];
        if (typeof ok === 'boolean') {
          executionOk = ok;
        }
        const error = data['error'];
        if (typeof error === 'string' && error.length > 0) {
          executionError = error;
        }
      }
    }
  }

  return {
    iteration,
    action,
    reason,
    assumedPositionSide,
    hasExecutionPlan,
    executionPlanAction,
    executionOk,
    executionError,
  };
}

async function runCycleAndSync(params: {
  webBaseUrl: string;
  langgraphBaseUrl: string;
  graphId: string;
  threadId: string;
}): Promise<CycleSnapshot> {
  await sendCommand({ baseUrl: params.langgraphBaseUrl, threadId: params.threadId, command: 'cycle' });
  const runId = await createRun({
    baseUrl: params.langgraphBaseUrl,
    threadId: params.threadId,
    graphId: params.graphId,
  });
  await waitForRunCompletion({
    baseUrl: params.langgraphBaseUrl,
    threadId: params.threadId,
    runId,
    timeoutMs: 120_000,
  });

  const synced = await postJson<AgentSyncResponse>(`${params.webBaseUrl}/api/agents/sync`, {
    agentId: params.graphId,
    threadId: params.threadId,
  });
  if (synced.status !== 200 || synced.json.error) {
    throw new Error(`Web sync failed after cycle: ${JSON.stringify(synced)}`);
  }

  return parseCycleSnapshot(synced.json);
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

  it('runs deterministic open/hold/close/reopen assertions in mocked profile', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');
    const langgraphBaseUrl = requireEnv('WEB_E2E_LANGGRAPH_BASE_URL');
    const e2eProfile = requireEnv('E2E_PROFILE');

    const graphId = 'agent-gmx-allora';
    const threadId = crypto.randomUUID();
    if (e2eProfile !== 'mocked') {
      expect(e2eProfile).toBe('live');
      return;
    }

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
          cronScheduled: true,
        },
        view: {
          delegationsBypassActive: true,
          operatorConfig,
          selectedPool,
          // Preserve shape expected by reducers.
          activity: { telemetry: [], events: [] },
          profile: { chains: [], protocols: [], tokens: [], pools: [], allowedPools: [] },
          metrics: { iteration: 0, previousPrice: 46000, cyclesSinceRebalance: 0, staleCycles: 0 },
          transactionHistory: [],
        },
      },
    });

    const cycleOne = await runCycleAndSync({ webBaseUrl, langgraphBaseUrl, graphId, threadId });
    expect(cycleOne.iteration).toBe(1);
    expect(cycleOne.action).toBe('open');
    expect(cycleOne.hasExecutionPlan).toBe(true);
    expect(cycleOne.executionPlanAction).toBe('long');

    const cycleTwo = await runCycleAndSync({ webBaseUrl, langgraphBaseUrl, graphId, threadId });
    expect(cycleTwo.iteration).toBe(2);
    expect(cycleTwo.action).toBe('hold');
    expect(cycleTwo.reason.toLowerCase()).toContain('holding');

    const cycleThree = await runCycleAndSync({ webBaseUrl, langgraphBaseUrl, graphId, threadId });
    expect(cycleThree.iteration).toBe(3);
    expect(cycleThree.action).toBe('close');
    expect(cycleThree.hasExecutionPlan).toBe(true);
    expect(cycleThree.executionPlanAction).toBe('close');
    expect(cycleThree.executionOk).toBe(true);
    expect(cycleThree.executionError).toBeUndefined();
    expect(cycleThree.assumedPositionSide).toBeUndefined();

    const cycleFour = await runCycleAndSync({ webBaseUrl, langgraphBaseUrl, graphId, threadId });
    expect(cycleFour.iteration).toBe(4);
    expect(cycleFour.action).toBe('open');
    expect(cycleFour.hasExecutionPlan).toBe(true);
    expect(cycleFour.executionPlanAction).toBe('short');
  }, 180_000);
});
