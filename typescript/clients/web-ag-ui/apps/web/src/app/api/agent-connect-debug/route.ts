import { appendFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const shouldLogAgentConnectDebug =
  process.env.AGENT_CONNECT_DEBUG === 'true' || process.env.NEXT_PUBLIC_AGENT_CONNECT_DEBUG === 'true';

const agentConnectDebugPayloadSchema = z.object({
  ts: z.string().min(1),
  event: z.string().min(1),
  agentId: z.string().min(1),
  threadId: z.string().min(1).nullable().optional(),
  runtimeStatus: z.string().min(1).nullable().optional(),
  seq: z.number().int().nonnegative().optional(),
  agent: z.string().min(1).optional(),
  ownerId: z.string().min(1).nullable().optional(),
  lastConnectedThread: z.string().min(1).nullable().optional(),
  path: z.string().min(1).optional(),
  visibilityState: z.string().min(1).optional(),
  hasFocus: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  if (!shouldLogAgentConnectDebug) {
    return Response.json({ ok: true, skipped: true });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'Invalid debug payload',
      },
      { status: 400 },
    );
  }

  const parsed = agentConnectDebugPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid debug payload',
      },
      { status: 400 },
    );
  }

  console.info('[agent-connect-debug]', {
    requestId: randomUUID(),
    ...parsed.data,
  });

  const logDir = path.join(process.cwd(), '.logs');
  const logPath = path.join(logDir, 'agent-connect-debug.log');

  void mkdir(logDir, { recursive: true })
    .then(() => appendFile(logPath, `${JSON.stringify(parsed.data)}\n`, 'utf8'))
    .catch(() => {
      // best-effort local log sink only
    });

  return Response.json({ ok: true });
}
