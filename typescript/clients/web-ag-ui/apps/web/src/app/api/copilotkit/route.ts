import {
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { parseCopilotRouteMetadata, type CopilotRouteRequestMetadata } from './routeMetadata';
import { installCopilotRuntimeDebugFilter } from '../../../utils/copilotRuntimeDebugFilter';

export const runtime = 'nodejs';

// 1. You can use any service adapter here for multi-agent support. We use
//    the empty adapter since we're only using one agent.
const serviceAdapter = new ExperimentalEmptyAdapter();

const shouldLogCopilotRuntimeDebug =
  process.env.COPILOTKIT_RUNTIME_DEBUG === 'true' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const shouldTraceCopilotRouteConnect =
  process.env.COPILOTKIT_ROUTE_TRACE_CONNECT === 'true' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';

installCopilotRuntimeDebugFilter({ enabled: shouldLogCopilotRuntimeDebug });

const shouldLogCopilotRouteRequests =
  process.env.NODE_ENV !== 'production' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const shouldLogCopilotRouteRefreshPolls =
  process.env.COPILOTKIT_ROUTE_DEBUG === 'true' || process.env.COPILOTKIT_ROUTE_LOG_SYNC === 'true';
const shouldTraceAllRunCommands =
  process.env.COPILOTKIT_ROUTE_TRACE_RUN_ALL === 'true' ||
  process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const shouldWarnOnSlowRefreshPolls = process.env.COPILOTKIT_ROUTE_WARN_SYNC_SLOW !== 'false';
const shouldLogUnmatchedRequests =
  process.env.COPILOTKIT_ROUTE_LOG_UNMATCHED === 'true' || process.env.COPILOTKIT_ROUTE_DEBUG === 'true';
const slowCopilotRouteWarnThresholdMs = (() => {
  const raw = process.env.COPILOTKIT_ROUTE_SLOW_WARN_MS;
  if (!raw) return 15000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
})();

function cloneResponse(response: Response, body: ReadableStream<Uint8Array>): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const copilotRouteLogPath = path.join(process.cwd(), 'apps/web/.logs/copilotkit-route.log');

async function appendCopilotRouteTrace(entry: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(copilotRouteLogPath), { recursive: true });
  await appendFile(copilotRouteLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function monitorCopilotResponseStream(params: {
  requestId: string;
  requestMetadata: CopilotRouteRequestMetadata;
  isAgentListRefreshPoll: boolean;
  shouldTraceRequest: boolean;
  shouldLogCopilotRouteRequests: boolean;
  shouldWarnOnSlowRefreshPolls: boolean;
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
        (params.shouldWarnOnSlowRefreshPolls || !params.isAgentListRefreshPoll) &&
        totalDurationMs >= params.slowCopilotRouteWarnThresholdMs;

      if (params.shouldTraceRequest || shouldWarnSlowStream) {
        const payload = {
          requestId: params.requestId,
          ...params.requestMetadata,
          isAgentListRefreshPoll: params.isAgentListRefreshPoll,
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
  const isAgentListRefreshPoll =
    requestMetadata.method === 'agent/run' &&
    requestMetadata.command === 'refresh' &&
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
    (!isAgentListRefreshPoll || shouldLogCopilotRouteRefreshPolls);
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

  if (requestMetadata.method === 'agent/run' && requestMetadata.hasResumePayload) {
    console.warn('[copilotkit-route] resume request', {
      requestId,
      agentId: requestMetadata.agentId,
      threadId: requestMetadata.threadId,
      command: requestMetadata.command,
      resumePayloadLength: requestMetadata.resumePayloadLength,
      resumePayloadPreview: requestMetadata.resumePayloadPreview,
    });
    void appendCopilotRouteTrace({
      ts: new Date().toISOString(),
      event: 'copilotkit-route-resume-request',
      requestId,
      ...requestMetadata,
    }).catch(() => {
      // best-effort local trace only
    });
  }

  const { buildCopilotRuntime } = await import('./copilotRuntimeRegistry');
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: buildCopilotRuntime(process.env),
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
    (shouldWarnOnSlowRefreshPolls || !isAgentListRefreshPoll) &&
    durationMs >= slowCopilotRouteWarnThresholdMs
  ) {
    console.warn('[copilotkit-route] slow request', {
      requestId,
      ...requestMetadata,
      isAgentListRefreshPoll,
      status: response.status,
      durationMs,
      shouldWarnOnSlowRefreshPolls,
      phaseDurationsMs: {
        metadataParse: metadataParseDurationMs,
        handlerInit: handlerInitDurationMs,
        handleRequest: handleRequestDurationMs,
      },
    });
  }
  if (requestMetadata.method === 'agent/run' && requestMetadata.hasResumePayload) {
    console.warn('[copilotkit-route] resume response', {
      requestId,
      agentId: requestMetadata.agentId,
      threadId: requestMetadata.threadId,
      command: requestMetadata.command,
      status: response.status,
      durationMs,
      resumePayloadLength: requestMetadata.resumePayloadLength,
      resumePayloadPreview: requestMetadata.resumePayloadPreview,
    });
    void appendCopilotRouteTrace({
      ts: new Date().toISOString(),
      event: 'copilotkit-route-resume-response',
      requestId,
      ...requestMetadata,
      status: response.status,
      durationMs,
      phaseDurationsMs: {
        metadataParse: metadataParseDurationMs,
        handlerInit: handlerInitDurationMs,
        handleRequest: handleRequestDurationMs,
      },
    }).catch(() => {
      // best-effort local trace only
    });
  }

  if (!response.body) {
    return response;
  }

  const [bodyForClient, bodyForMonitor] = response.body.tee();
  monitorCopilotResponseStream({
    requestId,
    requestMetadata,
    isAgentListRefreshPoll,
    shouldTraceRequest,
    shouldLogCopilotRouteRequests,
    shouldWarnOnSlowRefreshPolls,
    slowCopilotRouteWarnThresholdMs,
    startedAt,
    stream: bodyForMonitor,
  });

  return cloneResponse(response, bodyForClient);
};
