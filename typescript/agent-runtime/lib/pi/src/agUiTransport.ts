import { HttpAgent, runHttpRequest, transformHttpEventStream } from '@ag-ui/client';
import type { HttpAgentConfig, RunAgentInput } from '@ag-ui/client';

import type { PiRuntimeGatewayRunRequest, PiRuntimeGatewayService } from './index.js';

export const DEFAULT_PI_RUNTIME_GATEWAY_AG_UI_BASE_PATH = '/ag-ui';

export type PiRuntimeGatewayAgUiHandlerOptions = {
  agentId: string;
  service: PiRuntimeGatewayService;
  basePath?: string;
};

export type PiRuntimeGatewayHttpAgentConfig = Omit<HttpAgentConfig, 'url'> & {
  runtimeUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      return jsonResponse({ error: 'Expected a JSON object body.' }, 400);
    }
    return body;
  } catch {
    return jsonResponse({ error: 'Expected a valid JSON body.' }, 400);
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function sseResponse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}

function parseRunRequest(body: Record<string, unknown>): PiRuntimeGatewayRunRequest | Response {
  const threadId = readStringField(body, 'threadId');
  const runId = readStringField(body, 'runId');

  if (!threadId || !runId) {
    return jsonResponse({ error: 'Expected threadId and runId.' }, 400);
  }

  return {
    threadId,
    runId,
    messages: Array.isArray(body.messages) ? (body.messages as PiRuntimeGatewayRunRequest['messages']) : undefined,
  };
}

export function createPiRuntimeGatewayAgUiHandler(options: PiRuntimeGatewayAgUiHandlerOptions) {
  const basePath = (options.basePath ?? DEFAULT_PI_RUNTIME_GATEWAY_AG_UI_BASE_PATH).replace(/\/$/, '');
  const controlRoutes: Record<string, () => Promise<unknown>> = {
    [`${basePath}/control/health`]: () => options.service.control.inspectHealth(),
    [`${basePath}/control/threads`]: () => options.service.control.listThreads(),
    [`${basePath}/control/executions`]: () => options.service.control.listExecutions(),
    [`${basePath}/control/automations`]: () => options.service.control.listAutomations(),
    [`${basePath}/control/automation-runs`]: () => options.service.control.listAutomationRuns(),
    [`${basePath}/control/scheduler`]: () => options.service.control.inspectScheduler(),
    [`${basePath}/control/outbox`]: () => options.service.control.inspectOutbox(),
    [`${basePath}/control/maintenance`]: () => options.service.control.inspectMaintenance(),
  };

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'GET' && pathname === `${basePath}/health`) {
      return jsonResponse(await options.service.control.inspectHealth());
    }

    if (request.method === 'GET' && pathname in controlRoutes) {
      return jsonResponse(await controlRoutes[pathname]!());
    }

    const endpoint = new RegExp(`^${basePath}/agent/([^/]+)/(connect|run|stop)$`).exec(pathname);
    if (!endpoint) {
      return jsonResponse({ error: 'Not found.' }, 404);
    }

    const [, agentId, action] = endpoint;
    if (agentId !== options.agentId) {
      return jsonResponse({ error: 'Unknown agent.' }, 404);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405);
    }

    const body = await readJsonBody(request);
    if (body instanceof Response) {
      return body;
    }

    if (action === 'connect') {
      const threadId = readStringField(body, 'threadId');
      if (!threadId) {
        return jsonResponse({ error: 'Expected threadId.' }, 400);
      }

      const runId = readStringField(body, 'runId');

      return sseResponse(
        await options.service.connect({
          threadId,
          ...(runId ? { runId } : {}),
        }),
      );
    }

    if (action === 'run') {
      const runRequest = parseRunRequest(body);
      if (runRequest instanceof Response) {
        return runRequest;
      }

      return sseResponse(await options.service.run(runRequest));
    }

    const threadId = readStringField(body, 'threadId');
    const runId = readStringField(body, 'runId');
    if (!threadId || !runId) {
      return jsonResponse({ error: 'Expected threadId and runId.' }, 400);
    }

    return sseResponse(
      await options.service.stop({
        threadId,
        runId,
      }),
    );
  };
}

export class PiRuntimeGatewayHttpAgent extends HttpAgent {
  runtimeUrl: string;
  private activeRunId?: string;

  constructor(config: PiRuntimeGatewayHttpAgentConfig) {
    if (!config.agentId) {
      throw new Error('PiRuntimeGatewayHttpAgent requires an agentId.');
    }

    const runtimeUrl = config.runtimeUrl.replace(/\/$/, '');

    super({
      ...config,
      url: `${runtimeUrl}/agent/${encodeURIComponent(config.agentId)}/run`,
    });

    this.runtimeUrl = runtimeUrl;
  }

  override connect(input: RunAgentInput): ReturnType<HttpAgent['connect']> {
    this.rememberActiveRun(input);

    const httpEvents = runHttpRequest(
      `${this.runtimeUrl}/agent/${encodeURIComponent(this.agentId ?? '')}/connect`,
      this.requestInit(input),
    );

    return transformHttpEventStream(httpEvents);
  }

  override run(input: RunAgentInput): ReturnType<HttpAgent['run']> {
    this.rememberActiveRun(input);
    return super.run(input);
  }

  override abortRun(): void {
    const agentId = this.agentId;
    const threadId = this.threadId;
    const activeRunId = this.activeRunId;
    const headers = this.headers;

    super.abortRun();

    if (!agentId || !threadId || !activeRunId || typeof fetch === 'undefined') {
      return;
    }

    void fetch(`${this.runtimeUrl}/agent/${encodeURIComponent(agentId)}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        threadId,
        runId: activeRunId,
      }),
    }).catch(() => undefined);
  }

  override clone(): PiRuntimeGatewayHttpAgent {
    const cloned = super.clone() as PiRuntimeGatewayHttpAgent;
    cloned.runtimeUrl = this.runtimeUrl;
    cloned.activeRunId = this.activeRunId;
    return cloned;
  }

  private rememberActiveRun(input: RunAgentInput): void {
    this.threadId = input.threadId;
    this.activeRunId = input.runId;
  }
}
