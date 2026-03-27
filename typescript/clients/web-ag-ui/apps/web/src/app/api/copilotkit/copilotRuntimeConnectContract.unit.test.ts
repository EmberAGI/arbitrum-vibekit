import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { EventType } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

function packageRootFromEntry(entryPath: string): string {
  const distSegment = `${path.sep}dist${path.sep}`;
  const distIndex = entryPath.indexOf(distSegment);
  return distIndex === -1 ? path.dirname(entryPath) : entryPath.slice(0, distIndex);
}

async function loadRuntimeHandlers() {
  const runtimeRequire = createRequire(require.resolve('@copilotkit/runtime'));
  const runtimeEntry = runtimeRequire.resolve('@copilotkitnext/runtime');
  const runtimeRoot = packageRootFromEntry(runtimeEntry);

  const connectModule = (await import(
    pathToFileURL(path.join(runtimeRoot, 'dist/handlers/handle-connect.mjs')).href
  )) as {
    handleConnectAgent: (params: {
      runtime: {
        agents: Promise<Record<string, unknown>>;
        runner: {
          connect: (params: { threadId: string; headers?: Headers }) => Observable<unknown>;
        };
      };
      request: Request;
      agentId: string;
    }) => Promise<Response>;
  };

  return connectModule;
}

async function loadInMemoryRunner() {
  const runtimeRequire = createRequire(require.resolve('@copilotkit/runtime'));
  const runtimeEntry = runtimeRequire.resolve('@copilotkitnext/runtime');
  const runtimeRoot = packageRootFromEntry(runtimeEntry);

  const inMemoryModule = (await import(
    pathToFileURL(path.join(runtimeRoot, 'dist/runner/in-memory.mjs')).href
  )) as {
    InMemoryAgentRunner: new () => {
      connect: (params: {
        threadId: string;
        agent?: {
          setMessages?: (messages: unknown[]) => void;
          setState?: (state: Record<string, unknown>) => void;
          connectAgent: (
            input: {
              runId: string;
              tools: unknown[];
              context: unknown[];
              forwardedProps?: Record<string, unknown>;
            },
            callbacks: {
              onEvent: (params: { event: unknown }) => void;
            },
          ) => Promise<void>;
          detachActiveRun?: () => Promise<void> | void;
          threadId?: string;
        };
        input?: {
          threadId: string;
          runId: string;
          state: Record<string, unknown>;
          messages: unknown[];
          tools: unknown[];
          context: unknown[];
          forwardedProps?: Record<string, unknown>;
        };
      }) => Observable<unknown>;
    };
  };

  return inMemoryModule;
}

function createConnectRequest() {
  return new Request('http://localhost/api/copilotkit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      threadId: 'thread-1',
      runId: 'run-1',
      messages: [],
      tools: [],
      context: [],
      state: {},
    }),
  });
}

function createEventStream(label: string) {
  return new Observable<unknown>((subscriber) => {
    subscriber.next({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: `run-${label}`,
    });
    subscriber.complete();
  });
}

describe('CopilotKit runtime connect contract', () => {
  it('configures the cloned agent and passes agent-owned connect context to runtime.runner.connect', async () => {
    const { handleConnectAgent } = await loadRuntimeHandlers();
    const setMessages = vi.fn();
    const setState = vi.fn();
    const clone = vi.fn(() => ({
      setMessages,
      setState,
      threadId: undefined as string | undefined,
    }));
    const runnerConnect = vi.fn(() => createEventStream('runner'));

    const response = await handleConnectAgent({
      runtime: {
        agents: Promise.resolve({
          'agent-gmx-allora': {
            clone,
          },
        }),
        runner: {
          connect: runnerConnect,
        },
      },
      request: createConnectRequest(),
      agentId: 'agent-gmx-allora',
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => {
      expect(clone).toHaveBeenCalledTimes(1);
      expect(setMessages).toHaveBeenCalledWith([]);
      expect(setState).toHaveBeenCalledWith({});
      expect(runnerConnect).toHaveBeenCalledTimes(1);
      expect(runnerConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-1',
          headers: {},
          input: expect.objectContaining({
            threadId: 'thread-1',
            runId: 'run-1',
          }),
          agent: expect.objectContaining({
            threadId: 'thread-1',
          }),
        }),
      );
    });
  });

  it('delegates runner.connect through agent.connectAgent when agent and input are provided', async () => {
    const { InMemoryAgentRunner } = await loadInMemoryRunner();
    const runner = new InMemoryAgentRunner();
    const setMessages = vi.fn();
    const setState = vi.fn();
    const detachActiveRun = vi.fn();
    const connectAgent = vi.fn(
      async (
        _input: {
          runId: string;
          tools: unknown[];
          context: unknown[];
          forwardedProps?: Record<string, unknown>;
        },
        callbacks: {
          onEvent: (params: { event: unknown }) => void;
        },
      ) => {
        callbacks.onEvent({
          event: {
            type: EventType.RUN_STARTED,
            threadId: 'thread-1',
            runId: 'run-1',
          },
        });
      },
    );
    const events: unknown[] = [];

    const subscription = runner
      .connect({
        threadId: 'thread-1',
        agent: {
          setMessages,
          setState,
          connectAgent,
          detachActiveRun,
        },
        input: {
          threadId: 'thread-1',
          runId: 'run-1',
          state: { cycle: 1 },
          messages: [{ id: 'm-1', role: 'user', content: 'hello' }],
          tools: [],
          context: [],
          forwardedProps: { source: 'qa-test' },
        },
      })
      .subscribe({
        next: (event) => events.push(event),
      });

    await vi.waitFor(() => {
      expect(setMessages).toHaveBeenCalledWith([
        { id: 'm-1', role: 'user', content: 'hello' },
      ]);
      expect(setState).toHaveBeenCalledWith({ cycle: 1 });
      expect(connectAgent).toHaveBeenCalledWith(
        {
          runId: 'run-1',
          tools: [],
          context: [],
          forwardedProps: { source: 'qa-test' },
        },
        expect.objectContaining({
          onEvent: expect.any(Function),
        }),
      );
      expect(events).toEqual([
        {
          type: EventType.RUN_STARTED,
          threadId: 'thread-1',
          runId: 'run-1',
        },
      ]);
    });

    subscription.unsubscribe();
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
  });
});
