import { randomUUID } from 'node:crypto';

import { EventType } from '@ag-ui/core';
import { filter, firstValueFrom, map, take, type Observable } from 'rxjs';
import { NextRequest } from 'next/server';

import { getVisibleAgents } from '@/config/agents';
import { projectAgentListUpdateFromState, projectDetailStateFromPayload } from '@/contexts/agentProjection';
import type { AgentListEntry } from '@/contexts/agentListTypes';
import { defaultUiRuntimeState } from '@/types/agent';
import { deriveUiState } from '@/utils/deriveUiState';
import { getAgentThreadId } from '@/utils/agentThread';
import { buildCopilotRuntimeAgents } from '../copilotkit/copilotRuntimeRegistry';

export const runtime = 'nodejs';

type HttpConnectSnapshotAgent = {
  connect: (input: {
    threadId: string;
    runId: string;
    messages: unknown[];
    state: Record<string, never>;
    tools: unknown[];
    context: unknown[];
  }) => Observable<unknown>;
};

type WorkflowSnapshotAgent = {
  readThreadSnapshot: (threadId: string) => Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWalletAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

function isStateSnapshotEvent(value: unknown): value is {
  type: typeof EventType.STATE_SNAPSHOT;
  snapshot: Record<string, unknown>;
} {
  return isRecord(value) && value.type === EventType.STATE_SNAPSHOT && isRecord(value.snapshot);
}

function isHttpConnectSnapshotAgent(value: unknown): value is HttpConnectSnapshotAgent {
  return isRecord(value) && typeof value.connect === 'function';
}

function isWorkflowSnapshotAgent(value: unknown): value is WorkflowSnapshotAgent {
  return isRecord(value) && typeof value.readThreadSnapshot === 'function';
}

async function readFirstConnectSnapshot(params: {
  agent: HttpConnectSnapshotAgent;
  threadId: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const snapshot = await firstValueFrom(
      params.agent
        .connect({
          threadId: params.threadId,
          runId: randomUUID(),
          messages: [],
          state: {},
          tools: [],
          context: [],
        })
        .pipe(
          filter(isStateSnapshotEvent),
          map((event) => event.snapshot),
          take(1),
        ),
    );

    return snapshot;
  } catch {
    return null;
  }
}

async function readAgentSnapshot(params: {
  agent: unknown;
  threadId: string;
}): Promise<Record<string, unknown> | null> {
  if (isWorkflowSnapshotAgent(params.agent)) {
    const snapshot = await params.agent.readThreadSnapshot(params.threadId).catch(() => null);
    return isRecord(snapshot) ? snapshot : null;
  }

  if (isHttpConnectSnapshotAgent(params.agent)) {
    return readFirstConnectSnapshot({
      agent: params.agent,
      threadId: params.threadId,
    });
  }

  return null;
}

function buildAgentListEntryFromSnapshot(snapshot: Record<string, unknown>): Partial<AgentListEntry> | null {
  const projectedState = projectDetailStateFromPayload(snapshot);
  if (!projectedState) {
    return null;
  }

  const projectedEntry = projectAgentListUpdateFromState(projectedState);
  const uiState = deriveUiState({
    threadState: projectedState.thread,
    runtime: {
      ...defaultUiRuntimeState,
      hasLoadedSnapshot: true,
    },
  });

  return {
    ...projectedEntry,
    isHired: uiState.selectors.isHired,
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const wallet = normalizeWalletAddress(req.nextUrl.searchParams.get('wallet'));
  if (!wallet) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid wallet address.',
      },
      { status: 400 },
    );
  }

  const runtimeAgents = buildCopilotRuntimeAgents(process.env);
  const visibleAgents = getVisibleAgents();
  const agentEntries: Record<string, Partial<AgentListEntry>> = {};

  await Promise.all(
    visibleAgents.map(async (agentConfig) => {
      const threadId = getAgentThreadId(agentConfig.id, wallet);
      if (!threadId) {
        agentEntries[agentConfig.id] = { isHired: false };
        return;
      }

      const snapshot = await readAgentSnapshot({
        agent: runtimeAgents[agentConfig.id],
        threadId,
      }).catch(() => null);

      const projectedEntry = snapshot ? buildAgentListEntryFromSnapshot(snapshot) : null;
      agentEntries[agentConfig.id] = projectedEntry ?? { isHired: false };
    }),
  );

  const hiredAgentIds = Object.entries(agentEntries)
    .filter(([, entry]) => entry.isHired)
    .map(([agentId]) => agentId)
    .sort();

  return Response.json({
    ok: true,
    hiredAgentIds,
    agents: agentEntries,
  });
}
