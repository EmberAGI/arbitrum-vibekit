import { randomUUID } from 'node:crypto';

import { verifyEvents } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { lastValueFrom, toArray } from 'rxjs';
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

const agentCommandPayloadSchema = z.object({
  agentId: z.enum([
    PI_EXAMPLE_AGENT_NAME,
    PORTFOLIO_MANAGER_AGENT_NAME,
    EMBER_LENDING_AGENT_NAME,
  ]),
  threadId: z.string().min(1),
  command: z.object({
    name: z.string().min(1),
    input: z.unknown().optional(),
  }),
});

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

function readLatestStateSnapshot(events: readonly BaseEvent[]): Record<string, unknown> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== EventType.STATE_SNAPSHOT || !isRecord(event.snapshot)) {
      continue;
    }

    return event.snapshot;
  }

  return null;
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

  const { agentId, threadId, command } = parsedPayload.data;
  const agent = createAgentRuntimeHttpAgent({
    agentId,
    runtimeUrl: resolveAgentRuntimeUrl(process.env, agentId),
  });
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
          command: {
            name: command.name,
            ...(Object.prototype.hasOwnProperty.call(command, 'input')
              ? { input: command.input }
              : {}),
          },
        },
      })
      .pipe(verifyEvents(false), toArray()),
  );

  const snapshot = readLatestStateSnapshot(runEvents);
  const thread = isRecord(snapshot?.['thread']) ? snapshot['thread'] : null;
  const task = isRecord(thread?.['task']) ? thread['task'] : null;
  const taskStatus = isRecord(task?.['taskStatus']) ? task['taskStatus'] : null;
  const taskState = readString(taskStatus?.['state']);
  const statusMessage = readTaskStatusMessage(taskStatus?.['message']);
  const executionError = readString(thread?.['executionError']);
  const haltReason = readString(thread?.['haltReason']);

  if (taskState === 'failed' || taskState === 'canceled' || executionError || haltReason) {
    return Response.json(
      {
        ok: false,
        error:
          executionError ??
          haltReason ??
          statusMessage ??
          `Agent command '${command.name}' failed.`,
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    taskState,
    statusMessage,
    domainProjection: isRecord(thread?.['domainProjection']) ? thread['domainProjection'] : null,
  });
}
