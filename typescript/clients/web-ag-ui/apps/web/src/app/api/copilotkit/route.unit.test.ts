import { Observable } from 'rxjs';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BaseEvent, RunAgentInput } from '@ag-ui/client';

type LangGraphAttachAgentConfig = {
  deploymentUrl?: string;
  graphId?: string;
  langsmithApiKey?: string;
};

const connectInputs: RunAgentInput[] = [];
let connectMode: 'complete' | 'never' = 'complete';

vi.mock('@copilotkit/runtime/v2', () => {
  class CopilotRuntime {
    agents: Promise<Record<string, unknown>>;
    constructor(config: { agents: Record<string, unknown> }) {
      this.agents = Promise.resolve(config.agents);
    }
  }
  const createCopilotEndpointSingleRoute = () => ({
    fetch: vi.fn(),
  });
  return { CopilotRuntime, createCopilotEndpointSingleRoute };
});

vi.mock('./langgraphAttachAgent', () => {
  class LangGraphAttachAgent {
    headers: Record<string, string> = {};
    threadId?: string;
    constructor(_config: LangGraphAttachAgentConfig) {}
    clone() {
      return this;
    }
    setMessages() {
      // no-op
    }
    setState() {
      // no-op
    }
    connect(input: RunAgentInput): Observable<BaseEvent> {
      connectInputs.push(input);
      return new Observable((subscriber) => {
        if (connectMode === 'complete') {
          subscriber.complete();
        }
        return () => {
          subscriber.complete();
        };
      });
    }
  }
  return { LangGraphAttachAgent };
});

const buildRequest = (options?: { lastEventId?: string }) => {
  const body = {
    method: 'agent/connect',
    params: { agentId: 'agent-clmm' },
    body: {
      threadId: 'thread-1',
      messages: [],
      state: {},
    },
  };
  return new NextRequest('http://localhost/api/copilotkit', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: options?.lastEventId
      ? { 'content-type': 'application/json', 'Last-Event-ID': options.lastEventId }
      : { 'content-type': 'application/json' },
  });
};

describe('copilotkit route connect behavior', () => {
  beforeEach(() => {
    connectInputs.length = 0;
    connectMode = 'complete';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards Last-Event-ID into connect forwardedProps', async () => {
    const { POST } = await import('./route.js');
    const req = buildRequest({ lastEventId: 'evt-123' });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(connectInputs).toHaveLength(1);
    expect(connectInputs[0]?.forwardedProps).toMatchObject({ lastEventId: 'evt-123' });
  });

  it('emits keep-alive heartbeats while idle', async () => {
    connectMode = 'never';
    vi.useFakeTimers();

    const { POST } = await import('./route.js');
    const controller = new AbortController();
    const req = new NextRequest('http://localhost/api/copilotkit', {
      method: 'POST',
      body: JSON.stringify({
        method: 'agent/connect',
        params: { agentId: 'agent-clmm' },
        body: {
          threadId: 'thread-1',
          messages: [],
          state: {},
        },
      }),
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    });

    const response = await POST(req);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    vi.advanceTimersByTime(15_000);
    await Promise.resolve();

    const readPromise = reader?.read();
    vi.advanceTimersByTime(1_000);
    const result = await readPromise;

    controller.abort();

    const decoded = new TextDecoder().decode(result?.value);
    expect(decoded).toContain(':\n\n');
  });
});
