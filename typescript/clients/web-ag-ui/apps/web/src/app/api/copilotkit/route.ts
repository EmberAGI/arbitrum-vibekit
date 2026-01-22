import type { BaseEvent, Message, RunAgentInput, State } from '@ag-ui/client';
import { EventEncoder } from '@ag-ui/encoder';
import { CopilotRuntime, createCopilotEndpointSingleRoute } from '@copilotkit/runtime/v2';
import { NextRequest } from 'next/server';
import { LangGraphAttachAgent } from './langgraphAttachAgent';

// 1. You can use any service adapter here for multi-agent support. We use
//    the empty adapter since we're only using one agent.
const CLMM_AGENT_NAME = 'agent-clmm';
const LEGACY_AGENT_NAME = 'starterAgent';
const KEEP_ALIVE_MS = 15_000;

// 2. Create the CopilotRuntime instance and utilize the LangGraph AG-UI
//    integration to setup the connection.
const runtime = new CopilotRuntime({
  agents: {
    [CLMM_AGENT_NAME]: new LangGraphAttachAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [LEGACY_AGENT_NAME]: new LangGraphAttachAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: LEGACY_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
  },
});

const endpoint = createCopilotEndpointSingleRoute({
  runtime,
  basePath: '/api/copilotkit',
});

// 3. Build a Next.js API route that handles the CopilotKit runtime requests.
type MethodCall = {
  method?: string;
  params?: Record<string, unknown>;
  body?: unknown;
};

function parseMethodCallPayload(payload: unknown): MethodCall | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const method = 'method' in payload ? (payload as { method?: unknown }).method : undefined;
  const params = 'params' in payload ? (payload as { params?: unknown }).params : undefined;
  const body = 'body' in payload ? (payload as { body?: unknown }).body : undefined;
  return {
    method: typeof method === 'string' ? method : undefined,
    params: params && typeof params === 'object' ? (params as Record<string, unknown>) : undefined,
    body,
  };
}

function resolveStringParam(params: Record<string, unknown> | undefined, key: string): string | null {
  const value = params?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveLastEventId(req: NextRequest): string | undefined {
  const headerValue =
    req.headers.get('last-event-id') ?? req.headers.get('Last-Event-ID') ?? undefined;
  if (headerValue && headerValue.length > 0) {
    return headerValue;
  }
  return undefined;
}

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: 'invalid_request', message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function resolveMessages(input: RunAgentInput): Message[] {
  return Array.isArray(input.messages) ? (input.messages as Message[]) : [];
}

function resolveState(input: RunAgentInput): State {
  if (input.state && typeof input.state === 'object') {
    return input.state as State;
  }
  return {};
}

async function handleConnect(req: NextRequest, methodCall: MethodCall): Promise<Response> {
  const agentId = resolveStringParam(methodCall.params, 'agentId');
  if (!agentId) {
    return errorResponse("Missing or invalid parameter 'agentId'");
  }
  if (!methodCall.body || typeof methodCall.body !== 'object') {
    return errorResponse('Missing request body for JSON handler');
  }

  const input = methodCall.body as RunAgentInput;
  if (!input.threadId || typeof input.threadId !== 'string') {
    return errorResponse("Missing or invalid parameter 'threadId'");
  }

  const agents = await runtime.agents;
  const registeredAgent = agents[agentId];
  if (!registeredAgent) {
    return new Response(
      JSON.stringify({
        error: 'Agent not found',
        message: `Agent '${agentId}' does not exist`,
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const agent = registeredAgent.clone() as LangGraphAttachAgent;
  if ('headers' in agent) {
    const agentWithHeaders = agent as LangGraphAttachAgent & {
      headers: Record<string, string>;
    };
    const shouldForward = (headerName: string) => {
      const lower = headerName.toLowerCase();
      return lower === 'authorization' || lower.startsWith('x-');
    };
    const forwardableHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      if (shouldForward(key)) {
        forwardableHeaders[key] = value;
      }
    });
    agentWithHeaders.headers = {
      ...agentWithHeaders.headers,
      ...forwardableHeaders,
    };
  }

  const messages = resolveMessages(input);
  const state = resolveState(input);
  agent.setMessages(messages);
  agent.setState(state);
  agent.threadId = input.threadId;

  const lastEventId = resolveLastEventId(req);
  const forwardedProps =
    lastEventId && input.forwardedProps
      ? { ...input.forwardedProps, lastEventId }
      : lastEventId
        ? { lastEventId }
        : (input.forwardedProps ?? {});
  const connectInput: RunAgentInput = {
    ...input,
    messages,
    state,
    forwardedProps,
  };

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new EventEncoder();
  const textEncoder = new TextEncoder();
  let streamClosed = false;

  const closeStream = async () => {
    if (streamClosed) {
      return;
    }
    streamClosed = true;
    try {
      await writer.close();
    } catch {
      // Stream already closed
    }
  };

  const keepAliveTimer = setInterval(() => {
    if (streamClosed) {
      return;
    }
    void writer.write(textEncoder.encode(':\n\n')).catch(() => {
      streamClosed = true;
    });
  }, KEEP_ALIVE_MS);

  const subscription = agent.connect(connectInput).subscribe({
    next: async (event: BaseEvent) => {
      if (req.signal.aborted || streamClosed) {
        return;
      }
      try {
        await writer.write(encoder.encodeBinary(event));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          streamClosed = true;
        }
      }
    },
    error: async (error: unknown) => {
      console.error('[copilotkit] connect stream error', error);
      clearInterval(keepAliveTimer);
      await closeStream();
    },
    complete: async () => {
      clearInterval(keepAliveTimer);
      await closeStream();
    },
  });

  req.signal.addEventListener('abort', () => {
    subscription.unsubscribe();
    clearInterval(keepAliveTimer);
    void closeStream();
  });

  return new Response(stream.readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export const POST = async (req: NextRequest) => {
  let payload: unknown = undefined;
  try {
    payload = await req.clone().json();
  } catch {
    return endpoint.fetch(req);
  }

  const methodCall = parseMethodCallPayload(payload);
  if (methodCall?.method === 'agent/connect') {
    return handleConnect(req, methodCall);
  }

  return endpoint.fetch(req);
};
