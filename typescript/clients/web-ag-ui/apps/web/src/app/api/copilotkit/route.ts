import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import { NextRequest } from 'next/server';

// 1. You can use any service adapter here for multi-agent support. We use
//    the empty adapter since we're only using one agent.
const serviceAdapter = new ExperimentalEmptyAdapter();

const CLMM_AGENT_NAME = 'agent-clmm';
const PENDLE_AGENT_NAME = 'agent-pendle';
const GMX_ALLORA_AGENT_NAME = 'agent-gmx-allora';
const STARTER_AGENT_NAME = 'starterAgent';

// 2. Create the CopilotRuntime instance and utilize the LangGraph AG-UI
//    integration to setup the connection.
const runtime = new CopilotRuntime({
  agents: {
    [CLMM_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [PENDLE_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_PENDLE_DEPLOYMENT_URL || 'http://localhost:8125',
      graphId: PENDLE_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [GMX_ALLORA_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL || 'http://localhost:8126',
      graphId: GMX_ALLORA_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [STARTER_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: 'http://localhost:8123',
      graphId: STARTER_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
  },
});

type CopilotRouteRequestMetadata = {
  method?: string;
  agentId?: string;
  threadId?: string;
  command?: string;
  source?: string;
  clientMutationId?: string;
  parseError?: string;
};

const shouldLogCopilotRouteRequests =
  process.env.NODE_ENV !== 'production' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractThreadId(payloadBody: Record<string, unknown>): string | undefined {
  const fromBody = readString(payloadBody.threadId) ?? readString(payloadBody.thread_id);
  if (fromBody) return fromBody;

  const config = payloadBody.config;
  if (!isRecord(config)) return undefined;
  const configurable = config.configurable;
  if (!isRecord(configurable)) return undefined;
  return readString(configurable.threadId) ?? readString(configurable.thread_id);
}

function extractLastMessageContent(payloadBody: Record<string, unknown>): string | undefined {
  const messages = payloadBody.messages;
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  const last = messages[messages.length - 1];
  if (typeof last === 'string') return last;
  if (!isRecord(last)) return undefined;
  return readString(last.content);
}

function readCommandMetadata(lastMessageContent: string | undefined): {
  command?: string;
  source?: string;
  clientMutationId?: string;
} {
  if (!lastMessageContent) return {};
  try {
    const parsed = JSON.parse(lastMessageContent) as unknown;
    if (!isRecord(parsed)) return {};
    return {
      command: readString(parsed.command),
      source: readString(parsed.source),
      clientMutationId: readString(parsed.clientMutationId),
    };
  } catch {
    return {};
  }
}

function parseCopilotRouteMetadata(payload: unknown): CopilotRouteRequestMetadata {
  if (!isRecord(payload)) return {};

  const method = readString(payload.method);
  const params = isRecord(payload.params) ? payload.params : undefined;
  const payloadBody = isRecord(payload.body) ? payload.body : undefined;
  const lastMessageContent = payloadBody ? extractLastMessageContent(payloadBody) : undefined;
  const commandMetadata = readCommandMetadata(lastMessageContent);

  return {
    method,
    agentId: readString(params?.agentId),
    threadId: payloadBody ? extractThreadId(payloadBody) : undefined,
    command: commandMetadata.command,
    source: commandMetadata.source,
    clientMutationId: commandMetadata.clientMutationId,
  };
}

async function readCopilotRouteMetadata(req: NextRequest): Promise<CopilotRouteRequestMetadata> {
  try {
    const raw = await req.clone().text();
    if (!raw) return {};
    return parseCopilotRouteMetadata(JSON.parse(raw) as unknown);
  } catch (error: unknown) {
    return {
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

// 3. Build a Next.js API route that handles the CopilotKit runtime requests.
export const POST = async (req: NextRequest) => {
  const requestMetadata = await readCopilotRouteMetadata(req);
  const shouldTraceMethod =
    requestMetadata.method === 'agent/run' ||
    requestMetadata.method === 'agent/connect' ||
    requestMetadata.method === 'agent/stop';
  const shouldTraceRequest = shouldLogCopilotRouteRequests && shouldTraceMethod;
  const startedAt = Date.now();

  if (shouldTraceRequest) {
    console.info('[copilotkit-route] request', requestMetadata);
  } else if (shouldLogCopilotRouteRequests && requestMetadata.parseError) {
    console.warn('[copilotkit-route] request parse failed', {
      detail: requestMetadata.parseError,
    });
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  const response = await handleRequest(req);
  if (shouldTraceRequest) {
    console.info('[copilotkit-route] response', {
      ...requestMetadata,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
  }
  return response;
};
