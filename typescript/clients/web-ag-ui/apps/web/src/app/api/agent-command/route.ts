import { randomUUID } from 'node:crypto';

import { defaultApplyEvents, verifyEvents } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { lastValueFrom, from, toArray } from 'rxjs';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { createAgentRuntimeHttpAgent } from '../copilotkit/piRuntimeHttpAgent';
import {
  EMBER_LENDING_AGENT_NAME,
  PI_EXAMPLE_AGENT_NAME,
  PORTFOLIO_MANAGER_AGENT_NAME,
  resolveAgentRuntimeUrl,
} from '../copilotkit/copilotRuntimeRegistry';

export const runtime = 'nodejs';

const agentCommandPayloadBaseSchema = z.object({
  agentId: z.enum([
    PI_EXAMPLE_AGENT_NAME,
    PORTFOLIO_MANAGER_AGENT_NAME,
    EMBER_LENDING_AGENT_NAME,
  ]),
  threadId: z.string().min(1),
});

const agentNamedCommandPayloadSchema = agentCommandPayloadBaseSchema.extend({
  command: z.object({
    name: z.string().min(1),
    input: z.unknown().optional(),
  }),
});

const agentResumePayloadSchema = agentCommandPayloadBaseSchema.extend({
  resume: z.unknown(),
});

const agentCommandPayloadSchema = z.union([
  agentNamedCommandPayloadSchema,
  agentResumePayloadSchema,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readTaskStatusMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  return readString(value['content']);
}

async function readAuthoritativeStateDocument(params: {
  threadId: string;
  events: readonly BaseEvent[];
}): Promise<{
  state: Record<string, unknown> | null;
  sawDelta: boolean;
  sawSnapshot: boolean;
}> {
  const sawDelta = params.events.some((event) => event.type === EventType.STATE_DELTA);
  const sawSnapshot = params.events.some((event) => event.type === EventType.STATE_SNAPSHOT);
  if (!sawSnapshot) {
    return {
      state: null,
      sawDelta,
      sawSnapshot,
    };
  }

  const mutations = await lastValueFrom(
    defaultApplyEvents(
      {
        threadId: params.threadId,
        runId: 'route-state-reconcile',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {},
      },
      from(params.events),
      {} as never,
      [],
    ).pipe(toArray()),
  );
  const state = mutations.reduce<Record<string, unknown> | null>(
    (latestState, mutation) => (isRecord(mutation.state) ? mutation.state : latestState),
    null,
  );

  return {
    state,
    sawDelta,
    sawSnapshot,
  };
}

export async function POST(req: NextRequest): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'Invalid agent command payload.',
      },
      { status: 400 },
    );
  }

  const parsedPayload = agentCommandPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid agent command payload.',
      },
      { status: 400 },
    );
  }

  const { agentId, threadId } = parsedPayload.data;
  const agent = createAgentRuntimeHttpAgent({
    agentId,
    runtimeUrl: resolveAgentRuntimeUrl(process.env, agentId),
  });
  const forwardedCommand =
    'command' in parsedPayload.data
      ? {
          name: parsedPayload.data.command.name,
          ...(Object.prototype.hasOwnProperty.call(parsedPayload.data.command, 'input')
            ? { input: parsedPayload.data.command.input }
            : {}),
        }
      : {
          resume: parsedPayload.data.resume,
        };
  const runEvents = await lastValueFrom(
    agent
      .run({
        threadId,
        runId: randomUUID(),
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {
          command: forwardedCommand,
        },
      })
      .pipe(verifyEvents(false), toArray()),
  );

  const runState = await readAuthoritativeStateDocument({
    threadId,
    events: runEvents,
  });
  let snapshot = runState.state;

  if (!snapshot && runState.sawDelta && !runState.sawSnapshot) {
    const connectEvents = await lastValueFrom(agent.connect({ threadId }).pipe(verifyEvents(false), toArray()));
    snapshot = (
      await readAuthoritativeStateDocument({
        threadId,
        events: connectEvents,
      })
    ).state;
  }

  const thread = isRecord(snapshot?.['thread']) ? snapshot['thread'] : null;
  const projected = isRecord(snapshot?.['projected']) ? snapshot['projected'] : null;
  const task = isRecord(thread?.['task']) ? thread['task'] : null;
  const taskStatus = isRecord(task?.['taskStatus']) ? task['taskStatus'] : null;
  const execution = isRecord(thread?.['execution']) ? thread['execution'] : null;
  const taskState = readString(taskStatus?.['state']);
  const statusMessage = readTaskStatusMessage(taskStatus?.['message']);
  const executionStatus = readString(execution?.['status']);
  const executionStatusMessage = readString(execution?.['statusMessage']);
  const executionError = readString(thread?.['executionError']);
  const haltReason = readString(thread?.['haltReason']);

  if (
    taskState === 'failed' ||
    taskState === 'canceled' ||
    executionStatus === 'failed' ||
    executionStatus === 'canceled' ||
    executionError ||
    haltReason
  ) {
    return Response.json(
      {
        ok: false,
        error:
          executionError ??
          haltReason ??
          executionStatusMessage ??
          statusMessage ??
          ('command' in parsedPayload.data
            ? `Agent command '${parsedPayload.data.command.name}' failed.`
            : 'Agent resume failed.'),
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    taskState,
    statusMessage,
    domainProjection: projected,
  });
}
