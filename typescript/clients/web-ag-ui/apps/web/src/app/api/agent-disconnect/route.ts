import { NextRequest } from 'next/server';
import { z } from 'zod';

type ConnectAbortHandler = () => void;
type ConnectAbortersByThread = Map<string, Set<ConnectAbortHandler>>;

type RuntimeGlobals = typeof globalThis & {
  __copilotkitConnectAbortersByThread?: ConnectAbortersByThread;
};

const disconnectPayloadSchema = z.object({
  agentId: z.string().min(1),
  threadId: z.string().min(1),
});

function getConnectAbortersByThread(): ConnectAbortersByThread | null {
  const runtimeGlobals = globalThis as RuntimeGlobals;
  const aborters = runtimeGlobals.__copilotkitConnectAbortersByThread;
  if (!aborters) return null;
  return aborters;
}

export async function POST(req: NextRequest): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'Invalid disconnect payload',
      },
      { status: 400 },
    );
  }

  const parsed = disconnectPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid disconnect payload',
      },
      { status: 400 },
    );
  }

  const { agentId, threadId } = parsed.data;
  const connectKey = `${agentId}:${threadId}`;
  const abortersByThread = getConnectAbortersByThread();
  const aborters = abortersByThread?.get(connectKey);
  if (!aborters || aborters.size === 0) {
    return Response.json({
      ok: true,
      abortedCount: 0,
    });
  }

  const handlers = Array.from(aborters);
  abortersByThread?.delete(connectKey);
  let abortedCount = 0;
  for (const abortHandler of handlers) {
    try {
      abortHandler();
      abortedCount += 1;
    } catch {
      // best-effort disconnect
    }
  }

  return Response.json({
    ok: true,
    abortedCount,
  });
}
