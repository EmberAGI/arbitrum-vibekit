import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  agentId: z.string().min(1),
  threadId: z.string().min(1),
});

type AgentRuntimeConfig = {
  deploymentUrl: string;
  graphId: string;
};

const AGENT_RUNTIME_CONFIGS: Record<string, AgentRuntimeConfig> = {
  'agent-clmm': {
    deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
    graphId: 'agent-clmm',
  },
  'agent-pendle': {
    deploymentUrl: process.env.LANGGRAPH_PENDLE_DEPLOYMENT_URL || 'http://localhost:8125',
    graphId: 'agent-pendle',
  },
  'agent-gmx-allora': {
    deploymentUrl: process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL || 'http://localhost:8126',
    graphId: 'agent-gmx-allora',
  },
  starterAgent: {
    deploymentUrl: 'http://localhost:8123',
    graphId: 'starterAgent',
  },
};

function resolveAgentRuntime(agentId: string): AgentRuntimeConfig | null {
  return AGENT_RUNTIME_CONFIGS[agentId] ?? null;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

const RUN_IN_PROGRESS = new Set(['pending', 'queued', 'running']);

type RunSummary = {
  run_id: string;
  status?: string;
  created_at?: string;
  started_at?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const extractRunsArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  const data = payload['data'];
  if (Array.isArray(data)) return data;
  const runs = payload['runs'];
  if (Array.isArray(runs)) return runs;
  return [];
};

const toRunSummary = (value: unknown): RunSummary | null => {
  if (!isRecord(value)) return null;
  const runId = value['run_id'];
  if (typeof runId !== 'string' || runId.length === 0) return null;
  const status = typeof value['status'] === 'string' ? value['status'] : undefined;
  const created_at = typeof value['created_at'] === 'string' ? value['created_at'] : undefined;
  const started_at = typeof value['started_at'] === 'string' ? value['started_at'] : undefined;
  return { run_id: runId, status, created_at, started_at };
};

async function parseJsonResponse(response: Response): Promise<unknown> {
  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`LangGraph API request failed (${response.status}): ${payloadText}`);
  }
  const trimmed = payloadText.trim();
  return trimmed.length > 0 ? (JSON.parse(trimmed) as unknown) : ({} as unknown);
}

function pickActiveRunId(runs: RunSummary[]): string | null {
  const active = runs.filter((run) => RUN_IN_PROGRESS.has((run.status ?? '').toLowerCase()));
  if (active.length === 0) return null;

  // Prefer "newest" by started/created timestamp when present; otherwise first match.
  const score = (run: RunSummary): number => {
    const raw = run.started_at ?? run.created_at;
    if (!raw) return 0;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  let best = active[0];
  let bestScore = score(best);
  for (const run of active.slice(1)) {
    const s = score(run);
    if (s >= bestScore) {
      best = run;
      bestScore = s;
    }
  }
  return best.run_id;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.message },
      { status: 400 },
    );
  }

  const runtime = resolveAgentRuntime(parsed.data.agentId);
  if (!runtime) {
    return NextResponse.json(
      { error: 'Unknown agent', agentId: parsed.data.agentId },
      { status: 404 },
    );
  }

  const baseUrl = normalizeBaseUrl(runtime.deploymentUrl);
  const threadId = parsed.data.threadId;

  try {
    const runsResponse = await fetch(`${baseUrl}/threads/${threadId}/runs?limit=50&offset=0`);
    const runsPayload = await parseJsonResponse(runsResponse);
    const runSummaries = extractRunsArray(runsPayload)
      .map(toRunSummary)
      .filter((value): value is RunSummary => value !== null);

    const activeRunId = pickActiveRunId(runSummaries);
    if (!activeRunId) {
      return NextResponse.json({ cancelledRunIds: [] }, { status: 200 });
    }

    const cancelResponse = await fetch(
      `${baseUrl}/threads/${threadId}/runs/${activeRunId}/cancel?action=interrupt&wait=false`,
      { method: 'POST' },
    );
    if (!cancelResponse.ok && cancelResponse.status !== 404) {
      const text = await cancelResponse.text().catch(() => '');
      throw new Error(`LangGraph cancel failed (${cancelResponse.status}): ${text}`);
    }

    return NextResponse.json({ cancelledRunIds: [activeRunId] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[abort-active-run] Failed', { agentId: parsed.data.agentId, threadId, error: message });
    return NextResponse.json({ error: 'Abort failed', details: message }, { status: 500 });
  }
}

