import {
  createPiRuntimeGatewayRuntime,
  createPiRuntimeGatewayService,
  type PiRuntimeGatewayAgent,
  type PiRuntimeGatewayControlPlane,
  type PiRuntimeGatewayRunRequest,
  type PiRuntimeGatewayService,
} from 'agent-runtime';

export const PI_EXAMPLE_AGENT_ID = 'agent-pi-example';
export const PI_EXAMPLE_AG_UI_BASE_PATH = '/ag-ui';

type PiExampleAgUiHandlerOptions = {
  agentId: string;
  service: PiRuntimeGatewayService;
  basePath?: string;
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

export function createPiExampleGatewayService(): PiRuntimeGatewayService {
  const controlPlane: PiRuntimeGatewayControlPlane = {
    inspectHealth: async () => ({ status: 'ok' }),
    listExecutions: async () => [],
  };

  const agent: PiRuntimeGatewayAgent = {
    sessionId: undefined,
    state: {
      systemPrompt: '',
      model: {} as PiRuntimeGatewayAgent['state']['model'],
      thinkingLevel: 'off',
      tools: [],
      messages: [],
      isStreaming: false,
      streamMessage: null,
      pendingToolCalls: new Set<string>(),
    },
    subscribe: () => () => undefined,
    prompt: async () => undefined,
    continue: async () => undefined,
    steer: () => undefined,
    followUp: () => undefined,
    abort: () => undefined,
  };

  const runtime = createPiRuntimeGatewayRuntime({
    agent,
    getSession: () => {
      const threadId = agent.sessionId ?? 'thread-1';
      return {
        thread: { id: threadId },
        execution: {
          id: `pi-example:${threadId}`,
          status: 'working',
        },
      };
    },
  });

  return createPiRuntimeGatewayService({
    runtime,
    controlPlane,
  });
}

export function createPiExampleAgUiHandler(options: PiExampleAgUiHandlerOptions) {
  const basePath = (options.basePath ?? PI_EXAMPLE_AG_UI_BASE_PATH).replace(/\/$/, '');

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'GET' && pathname === `${basePath}/health`) {
      return jsonResponse(await options.service.control.inspectHealth());
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

      return sseResponse(await options.service.connect({ threadId }));
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
