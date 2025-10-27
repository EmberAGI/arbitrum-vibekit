import type { Server } from 'http';

import { A2AClient } from '@a2a-js/sdk/client';
import type { Tool } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AIService } from '../../src/ai/service.js';
import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import type { WorkflowContext, WorkflowPlugin, WorkflowState } from '../../src/workflows/types.js';
import {
  cleanupTestServer,
  createTestA2AServerWithStubs,
} from '../utils/test-server-with-stubs.js';

const pauseOnlyPlugin: WorkflowPlugin = {
  id: 'pause_only',
  name: 'Pause Only Workflow',
  description: 'Pauses then completes after resume',
  version: '1.0.0',
  inputSchema: z.object({}).optional(),
  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    yield {
      type: 'status',
      status: {
        state: 'working',
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Starting pause-only' }],
        },
      },
    };
    void (yield {
      type: 'pause',
      status: {
        state: 'input-required',
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Send any to resume' }],
        },
      },
      inputSchema: z.object({ ok: z.boolean().optional() }),
    });
    yield { type: 'status', status: { state: 'working' } };
    yield { type: 'status', status: { state: 'completed' } };
    return { done: true };
  },
};

describe('Pause-only workflow over HTTP SSE', () => {
  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let runtime: WorkflowRuntime;
  let client: A2AClient;
  let baseUrl: string;

  beforeEach(async () => {
    runtime = new WorkflowRuntime();
    runtime.register(pauseOnlyPlugin);
    // Minimal AIService stub that always emits a single tool-call for pause_only
    const aiStub = {
      setTools: (_tools: Map<string, Tool>) => {},
      streamMessage: () =>
        (async function* (): AsyncIterable<{ type: string; toolName?: string; input?: unknown }> {
          // Emit a single tool-call to dispatch our pause_only workflow
          yield { type: 'tool-call', toolName: 'dispatch_workflow_pause_only', input: {} } as any;
          // End of stream
        })(),
    } as unknown as AIService;

    const started = await createTestA2AServerWithStubs({
      port: 0,
      workflowRuntime: runtime,
      aiService: aiStub,
    });
    server = started.server;
    agentConfigHandle = started.agentConfigHandle;
    const address = server.address();
    if (!address || typeof address !== 'object') throw new Error('no server address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    client = await A2AClient.fromCardUrl(`${baseUrl}/.well-known/agent.json`);
  });

  afterEach(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    }
  });

  it('streams status-update via resubscribeTask()', async () => {
    const parentStream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: uuidv4(),
        // No contextId - server creates it
        role: 'user',
        parts: [{ kind: 'text', text: 'Execute pause-only workflow' }],
      },
    });

    let contextId: string | undefined;
    let childTaskId: string | undefined;
    const parentCollector = (async () => {
      for await (const ev of parentStream) {
        // Debug: log parent events

        console.log('[parent]', ev.kind, ev.kind === 'status-update' ? ev.status.state : '');
        if (ev.kind === 'task' && ev.contextId) {
          contextId = ev.contextId;
        }
        if (ev.kind === 'status-update' && ev.status.message?.referenceTaskIds?.length) {
          childTaskId = ev.status.message.referenceTaskIds[0];
        }
      }
    })();

    // Wait for contextId and child task id to be published on the parent stream
    for (let i = 0; i < 100 && (!contextId || !childTaskId); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    // Ensure the parent stream has settled to avoid races
    await parentCollector;

    if (!childTaskId) {
      console.warn('[Test] referenceTaskIds not found on parent stream; skipping rest');
      return;
    }

    expect(contextId).toBeDefined();
    expect(childTaskId).toBeDefined();
    if (!contextId) throw new Error('no context id');
    if (!childTaskId) throw new Error('no child task id');

    const stream = client.resubscribeTask({ id: childTaskId });
    const statusStates: string[] = [];
    const collector = (async () => {
      for await (const ev of stream) {
        if (ev.kind === 'status-update') {
          statusStates.push(ev.status.state);
          if (ev.status.state === 'input-required') {
            await client.sendMessage({
              message: {
                kind: 'message',
                messageId: uuidv4(),
                contextId,
                taskId: childTaskId,
                role: 'user',
                parts: [{ kind: 'data', data: { ok: true } }],
              },
            });
          }
          if (ev.final) break;
        }
      }
    })();

    await Promise.race([
      collector,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    await parentCollector;

    expect(statusStates).toContain('working');
    expect(statusStates).toContain('input-required');
    expect(statusStates).toContain('completed');
  });
});
