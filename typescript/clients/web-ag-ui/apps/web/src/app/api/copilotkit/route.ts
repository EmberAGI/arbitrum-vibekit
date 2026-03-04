import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { installCopilotRuntimeDebugFilter } from '../../../utils/copilotRuntimeDebugFilter';

// 1. You can use any service adapter here for multi-agent support. We use
//    the empty adapter since we're only using one agent.
const serviceAdapter = new ExperimentalEmptyAdapter();

const CLMM_AGENT_NAME = 'agent-clmm';
const PENDLE_AGENT_NAME = 'agent-pendle';
const GMX_ALLORA_AGENT_NAME = 'agent-gmx-allora';
const STARTER_AGENT_NAME = 'starterAgent';
const shouldLogCopilotRuntimeDebug =
  process.env.COPILOTKIT_RUNTIME_DEBUG === 'true' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const shouldTraceCopilotRouteConnect =
  process.env.COPILOTKIT_ROUTE_TRACE_CONNECT === 'true' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';

installCopilotRuntimeDebugFilter({ enabled: shouldLogCopilotRuntimeDebug });

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
  payloadKind?: 'object' | 'array' | 'other';
  batchLength?: number;
  topLevelKeys?: string[];
  metadataMatched?: boolean;
  rawLength?: number;
};

const shouldLogCopilotRouteRequests =
  process.env.NODE_ENV !== 'production' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const shouldLogCopilotRouteSyncPolls =
  process.env.COPILOTKIT_ROUTE_DEBUG === 'true' || process.env.COPILOTKIT_ROUTE_LOG_SYNC === 'true';
const shouldTraceAllRunCommands =
  process.env.COPILOTKIT_ROUTE_TRACE_RUN_ALL === 'true' ||
  process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const shouldWarnOnSlowSyncPolls = process.env.COPILOTKIT_ROUTE_WARN_SYNC_SLOW !== 'false';
const shouldLogUnmatchedRequests =
  process.env.COPILOTKIT_ROUTE_LOG_UNMATCHED === 'true' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const slowCopilotRouteWarnThresholdMs = (() => {
  const raw = process.env.COPILOTKIT_ROUTE_SLOW_WARN_MS;
  if (!raw) return 15000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
})();

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

function parseCopilotRouteMetadataFromObject(payload: Record<string, unknown>): CopilotRouteRequestMetadata {
  const method = readString(payload.method);
  const params = isRecord(payload.params) ? payload.params : undefined;
  const payloadBody = isRecord(payload.body) ? payload.body : undefined;
  const lastMessageContent = payloadBody ? extractLastMessageContent(payloadBody) : undefined;
  const commandMetadata = readCommandMetadata(lastMessageContent);
  const threadId = payloadBody ? extractThreadId(payloadBody) : undefined;
  const agentId = readString(params?.agentId);
  const command = commandMetadata.command;
  const source = commandMetadata.source;
  const clientMutationId = commandMetadata.clientMutationId;

  return {
    method,
    agentId,
    threadId,
    command,
    source,
    clientMutationId,
    payloadKind: 'object',
    topLevelKeys: Object.keys(payload).slice(0, 20),
    metadataMatched: Boolean(method || agentId || threadId || command || source || clientMutationId),
  };
}

function parseCopilotRouteMetadata(payload: unknown): CopilotRouteRequestMetadata {
  if (isRecord(payload)) {
    return parseCopilotRouteMetadataFromObject(payload);
  }

  if (Array.isArray(payload)) {
    const first = payload[0];
    if (isRecord(first)) {
      const parsedFirst = parseCopilotRouteMetadataFromObject(first);
      return {
        ...parsedFirst,
        payloadKind: 'array',
        batchLength: payload.length,
      };
    }
    return {
      payloadKind: 'array',
      batchLength: payload.length,
      metadataMatched: false,
    };
  }

  return {
    payloadKind: 'other',
    metadataMatched: false,
  };
}

function cloneResponse(response: Response, body: ReadableStream<Uint8Array>): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function monitorCopilotResponseStream(params: {
  requestId: string;
  requestMetadata: CopilotRouteRequestMetadata;
  isAgentListSyncPoll: boolean;
  shouldTraceRequest: boolean;
  shouldLogCopilotRouteRequests: boolean;
  shouldWarnOnSlowSyncPolls: boolean;
  slowCopilotRouteWarnThresholdMs: number;
  startedAt: number;
  stream: ReadableStream<Uint8Array>;
}) {
  void (async () => {
    const reader = params.stream.getReader();
    let chunkCount = 0;
    let byteCount = 0;
    const streamStartedAt = Date.now();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        chunkCount += 1;
        byteCount += value?.byteLength ?? 0;
      }

      const totalDurationMs = Date.now() - params.startedAt;
      const streamDurationMs = Date.now() - streamStartedAt;
      const shouldWarnSlowStream =
        params.shouldLogCopilotRouteRequests &&
        (params.shouldWarnOnSlowSyncPolls || !params.isAgentListSyncPoll) &&
        totalDurationMs >= params.slowCopilotRouteWarnThresholdMs;

      if (params.shouldTraceRequest || shouldWarnSlowStream) {
        const payload = {
          requestId: params.requestId,
          ...params.requestMetadata,
          isAgentListSyncPoll: params.isAgentListSyncPoll,
          totalDurationMs,
          streamDurationMs,
          chunkCount,
          byteCount,
          slowWarnThresholdMs: params.slowCopilotRouteWarnThresholdMs,
        };
        if (shouldWarnSlowStream) {
          console.warn('[copilotkit-route] slow stream close', payload);
        } else {
          console.info('[copilotkit-route] stream close', payload);
        }
      }
    } catch (error: unknown) {
      console.warn('[copilotkit-route] stream monitor error', {
        requestId: params.requestId,
        ...params.requestMetadata,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      reader.releaseLock();
    }
  })();
}

async function readCopilotRouteMetadata(req: NextRequest): Promise<CopilotRouteRequestMetadata> {
  let rawLength = 0;
  try {
    const raw = await req.clone().text();
    rawLength = raw.length;
    if (!raw) return { rawLength: 0, metadataMatched: false };
    return {
      ...parseCopilotRouteMetadata(JSON.parse(raw) as unknown),
      rawLength,
    };
  } catch (error: unknown) {
    return {
      parseError: error instanceof Error ? error.message : String(error),
      rawLength,
    };
  }
}

// 3. Build a Next.js API route that handles the CopilotKit runtime requests.
export const POST = async (req: NextRequest) => {
  const requestId = randomUUID();
  const requestMetadata = await readCopilotRouteMetadata(req);
  const isAgentListSyncPoll =
    requestMetadata.method === 'agent/run' &&
    requestMetadata.command === 'sync' &&
    requestMetadata.source === 'agent-list-poll';
  const isFireRun = requestMetadata.method === 'agent/run' && requestMetadata.command === 'fire';
  const shouldTraceRunCommand =
    requestMetadata.method === 'agent/run' && (isFireRun || shouldTraceAllRunCommands);
  const shouldTraceMethod =
    shouldTraceRunCommand ||
    requestMetadata.method === 'agent/stop' ||
    (requestMetadata.method === 'agent/connect' && shouldTraceCopilotRouteConnect);
  const shouldTraceRequest =
    shouldLogCopilotRouteRequests &&
    shouldTraceMethod &&
    (!isAgentListSyncPoll || shouldLogCopilotRouteSyncPolls);
  const startedAt = Date.now();
  const metadataParsedAt = Date.now();

  if (shouldTraceRequest) {
    console.info('[copilotkit-route] request', {
      requestId,
      ...requestMetadata,
    });
  } else if (shouldLogCopilotRouteRequests && requestMetadata.parseError) {
    console.warn('[copilotkit-route] request parse failed', {
      requestId,
      detail: requestMetadata.parseError,
      rawLength: requestMetadata.rawLength,
    });
  } else if (shouldLogCopilotRouteRequests && shouldLogUnmatchedRequests && !requestMetadata.metadataMatched) {
    console.warn('[copilotkit-route] request metadata unmatched', {
      requestId,
      ...requestMetadata,
    });
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });
  const handlerReadyAt = Date.now();

  const response = await handleRequest(req);
  const durationMs = Date.now() - startedAt;
  const handleRequestDurationMs = Date.now() - handlerReadyAt;
  const metadataParseDurationMs = metadataParsedAt - startedAt;
  const handlerInitDurationMs = handlerReadyAt - metadataParsedAt;
  if (shouldTraceRequest) {
    console.info('[copilotkit-route] response', {
      requestId,
      ...requestMetadata,
      status: response.status,
      durationMs,
      phaseDurationsMs: {
        metadataParse: metadataParseDurationMs,
        handlerInit: handlerInitDurationMs,
        handleRequest: handleRequestDurationMs,
      },
      slowWarnThresholdMs: slowCopilotRouteWarnThresholdMs,
    });
  }
  if (
    shouldLogCopilotRouteRequests &&
    (shouldWarnOnSlowSyncPolls || !isAgentListSyncPoll) &&
    durationMs >= slowCopilotRouteWarnThresholdMs
  ) {
    console.warn('[copilotkit-route] slow request', {
      requestId,
      ...requestMetadata,
      isAgentListSyncPoll,
      status: response.status,
      durationMs,
      shouldWarnOnSlowSyncPolls,
      phaseDurationsMs: {
        metadataParse: metadataParseDurationMs,
        handlerInit: handlerInitDurationMs,
        handleRequest: handleRequestDurationMs,
      },
    });
  }

  if (!response.body) {
    return response;
  }

  const [bodyForClient, bodyForMonitor] = response.body.tee();
  monitorCopilotResponseStream({
    requestId,
    requestMetadata,
    isAgentListSyncPoll,
    shouldTraceRequest,
    shouldLogCopilotRouteRequests,
    shouldWarnOnSlowSyncPolls,
    slowCopilotRouteWarnThresholdMs,
    startedAt,
    stream: bodyForMonitor,
  });

  return cloneResponse(response, bodyForClient);
};
