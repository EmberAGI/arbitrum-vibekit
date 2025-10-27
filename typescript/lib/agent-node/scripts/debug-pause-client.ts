import type { Server } from 'http';

import { A2AClient } from '@a2a-js/sdk/client';
import type { Tool } from 'ai';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

import type { AIService } from '../src/ai/service.js';
import type { AgentConfigHandle } from '../src/config/runtime/init.js';
import { WorkflowRuntime } from '../src/workflows/runtime.js';
import type { WorkflowContext, WorkflowPlugin, WorkflowState } from '../src/workflows/types.js';
import {
  cleanupTestServer,
  createTestA2AServerWithStubs,
} from '../tests/utils/test-server-with-stubs.js';

const pauseOnlyPlugin: WorkflowPlugin = {
  id: 'pause_only',
  name: 'Pause Only Workflow',
  description: 'Pauses then completes after resume',
  version: '1.0.0',
  inputSchema: z.object({}),
  async *execute(_context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    console.log('[parent] execute - ONE STATUS');
    yield {
      type: 'status-update',
      message: 'Starting pause-only',
    };

    console.log('[parent] execute - TWO ARTIFACT');
    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'step1.json',
        description: 'Step 1 artifact',
        name: 'step1.json',
        parts: [{ kind: 'data', data: { step: 1 }, metadata: { mimeType: 'application/json' } }],
      },
    };

    console.log('[parent] execute - THREE PAUSE');
    const inputSchema = z.object({ ok: z.boolean() });

    void (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Return true to resume',
      inputSchema,
    });

    console.log('[parent] execute - FOUR CONTINUE');
    yield { type: 'status-update', message: 'Resuming...' };

    console.log('[parent] execute - FIVE COMPLETED');
    yield { type: 'status-update', message: 'Completed' };
    return { done: true };
  },
};

const aiStub = {
  setTools: (_tools: Map<string, Tool>) => {},
  streamMessage: () =>
    (async function* (): AsyncIterable<{ type: string; toolName?: string; input?: unknown }> {
      yield { type: 'tool-call', toolName: 'dispatch_workflow_pause_only', input: {} } as const;
    })(),
} as unknown as AIService;

async function main(): Promise<void> {
  let server: Server | undefined;
  let agentConfigHandle: AgentConfigHandle | undefined;

  try {
    const runtime = new WorkflowRuntime();
    runtime.register(pauseOnlyPlugin);

    const started = await createTestA2AServerWithStubs({
      workflowRuntime: runtime,
      aiService: aiStub,
      port: 0,
    });
    server = started.server;
    agentConfigHandle = started.agentConfigHandle;

    const address = server.address();
    if (!address || typeof address !== 'object') {
      throw new Error('Server has no address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const client = await A2AClient.fromCardUrl(`${baseUrl}/.well-known/agent.json`);

    const parentStream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: uuidv7(),
        role: 'user',
        parts: [{ kind: 'text', text: 'Execute pause-only workflow' }],
      },
    });

    let contextId: string | undefined;
    let parentTaskId: string | undefined;
    let childTaskId: string | undefined;

    for await (const event of parentStream) {
      console.log(
        `[parent] ${event.kind} ${event.kind === 'status-update' ? event.status.state : ''}`,
      );
      console.dir(event, { depth: null });

      if (event.kind === 'task') {
        contextId = event.contextId;
        console.log('[parent] contextId', contextId);
        parentTaskId = event.id;
        console.log('[parent] parentTaskId', parentTaskId);
      }

      if (event.kind === 'status-update' && event.status.message?.referenceTaskIds?.length) {
        childTaskId = event.status.message.referenceTaskIds[0];
        console.log('[parent] childTaskId', childTaskId);
      }

      if (event.kind === 'status-update' && event.final) {
        break;
      }
    }

    console.log('[parent] END');

    if (!parentTaskId) {
      throw new Error('No parent task id found');
    }
    const parentTask = await client.getTask({ id: parentTaskId });
    console.log('[parent] task get id: ', parentTask.id);
    console.dir(parentTask, { depth: null });

    if (!contextId) {
      throw new Error('No context id found');
    }

    if (!childTaskId) {
      throw new Error('No child task id found');
    }

    const childStream = client.resubscribeTask({ id: childTaskId });
    for await (const event of childStream) {
      console.log('[child]', event.kind, event.kind === 'status-update' ? event.status.state : '');
      console.dir(event, { depth: null });

      if (event.kind === 'task' && event.status.state === 'input-required') {
        console.log('[child] task status input-required');
        await client.sendMessage({
          message: {
            kind: 'message',
            taskId: childTaskId,
            messageId: uuidv7(),
            contextId,
            role: 'user',
            parts: [{ kind: 'data', data: { ok: false } }],
          },
        });
      } else if (event.kind === 'status-update' && event.status.state === 'input-required') {
        await client.sendMessage({
          message: {
            kind: 'message',
            taskId: childTaskId,
            messageId: uuidv7(),
            contextId,
            role: 'user',
            parts: [{ kind: 'data', data: { ok: true } }],
          },
        });
      }

      if (event.kind === 'status-update' && event.final) {
        break;
      }
    }
  } finally {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    } else if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
