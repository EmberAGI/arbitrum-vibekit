import type { Server } from 'http';

import type { Tool } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { AIService } from '../src/ai/service.js';
import type { AgentConfigHandle } from '../src/config/runtime/init.js';
import { WorkflowRuntime } from '../src/workflows/runtime.js';
import type { WorkflowContext, WorkflowPlugin, WorkflowState } from '../src/workflows/types.js';
import {
  cleanupTestServer,
  createTestA2AServerWithStubs,
} from '../tests/utils/test-server-with-stubs.js';

interface JsonRpcSuccessResponse<T> {
  jsonrpc: '2.0';
  id: number | string | null;
  result: T;
}

interface StreamResult {
  kind: string;
  final?: boolean;
  taskId?: string;
  status?: { state: string; message?: { referenceTaskIds?: string[] } };
}

type StreamEvent = JsonRpcSuccessResponse<StreamResult>;

type ParsedEvent = {
  result: StreamResult;
  raw: string;
};

const collectedEvents: ParsedEvent[] = [];

function emitEvent(raw: string, requestId: number | string): void {
  try {
    const parsed = JSON.parse(raw) as StreamEvent;

    if (parsed.id !== requestId) {
      console.warn('SSE event id mismatch', { expected: requestId, received: parsed.id });
    }

    collectedEvents.push({ result: parsed.result, raw });

    console.log('SSE event result', parsed.result.kind, {
      state: parsed.result.status?.state,
      referenceTaskIds: parsed.result.status?.message?.referenceTaskIds,
      final: parsed.result.final ?? false,
    });
  } catch (error) {
    console.error('Failed to parse SSE event', { raw, error });
  }
}

function findChildTaskId(): string | undefined {
  for (const event of collectedEvents) {
    const references = event.result.status?.message?.referenceTaskIds;
    if (references && references.length > 0) {
      return references[0];
    }
  }
  return undefined;
}

type ResubscribeEvent = JsonRpcSuccessResponse<{
  kind: string;
  final?: boolean;
  taskId?: string;
  status?: { state: string; message?: { referenceTaskIds?: string[] } };
}>;

const pauseOnlyPlugin: WorkflowPlugin = {
  id: 'pause_only',
  name: 'Pause Only Workflow',
  description: 'Pauses then completes after resume',
  version: '1.0.0',
  inputSchema: z.object({}).optional(),
  async *execute(_context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
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

const aiStub = {
  setTools: (_tools: Map<string, Tool>) => {},
  streamMessage: () =>
    (async function* (): AsyncIterable<{ type: string; toolName?: string; input?: unknown }> {
      yield { type: 'tool-call', toolName: 'dispatch_workflow_pause_only', input: {} } as const;
    })(),
} as unknown as AIService;

async function parseSseStream(response: Response, requestId: number | string): Promise<void> {
  if (!response.body) {
    throw new Error('SSE response body is undefined');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let dataLines: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (dataLines.length > 0) {
          emitEvent(dataLines.join('\n'), requestId);
        }
        break;
      }

      buffer += value;

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).trimEnd();
        buffer = buffer.slice(newlineIndex + 1);

        if (line === '') {
          if (dataLines.length > 0) {
            emitEvent(dataLines.join('\n'), requestId);
            dataLines = [];
          }
          continue;
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trimStart());
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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
    const rpcRequest = {
      jsonrpc: '2.0' as const,
      method: 'message/stream',
      id: 1,
      params: {
        message: {
          kind: 'message' as const,
          messageId: uuidv4(),
          contextId: `ctx-${Date.now()}`,
          role: 'user' as const,
          parts: [{ kind: 'text' as const, text: 'Execute pause-only workflow' }],
        },
      },
    };

    const response = await fetch(`${baseUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    });

    console.log('HTTP status', response.status, response.statusText);
    await parseSseStream(response, rpcRequest.id);
    const childTaskId = findChildTaskId();

    console.log('Child task detected', childTaskId);

    if (!childTaskId) {
      throw new Error('No child task id detected');
    }

    const resubscribeRequest = {
      jsonrpc: '2.0' as const,
      method: 'tasks/resubscribe',
      id: 2,
      params: { id: childTaskId },
    };

    const resubscribeResponse = await fetch(`${baseUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resubscribeRequest),
    });

    console.log('Resubscribe status', resubscribeResponse.status, resubscribeResponse.statusText);

    resumeState.sent = false;
    await parseResubscribeStream(resubscribeResponse, resubscribeRequest.id, {
      baseUrl,
      childTaskId,
      contextId: rpcRequest.params.message.contextId,
    });
  } finally {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    } else if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  }
}

interface ResubscribeContext {
  baseUrl: string;
  childTaskId: string;
  contextId: string;
}

async function parseResubscribeStream(
  response: Response,
  requestId: number | string,
  context: ResubscribeContext,
): Promise<void> {
  if (!response.body) throw new Error('Resubscribe SSE body missing');

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let dataLines: string[] = [];
  let streamClosed = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (dataLines.length > 0) {
          streamClosed ||= await processResubscribeEvent(dataLines.join('\n'), requestId, context);
        }
        break;
      }

      buffer += value;

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) break;
        const line = buffer.slice(0, newlineIndex).trimEnd();
        buffer = buffer.slice(newlineIndex + 1);

        if (line === '') {
          if (dataLines.length > 0) {
            streamClosed ||= await processResubscribeEvent(
              dataLines.join('\n'),
              requestId,
              context,
            );
            dataLines = [];
          }
          continue;
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trimStart());
        }
      }
      if (streamClosed) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const resumeState = { sent: false };

async function processResubscribeEvent(
  raw: string,
  requestId: number | string,
  context: ResubscribeContext,
): Promise<boolean> {
  let parsed: ResubscribeEvent;
  try {
    parsed = JSON.parse(raw) as ResubscribeEvent;
    if (parsed.id !== requestId) {
      console.warn('Resubscribe SSE id mismatch', { expected: requestId, received: parsed.id });
    }

    console.log('Resubscribe event', parsed.result.kind, {
      state: parsed.result.status?.state,
      final: parsed.result.final ?? false,
    });
  } catch (error) {
    console.error('Failed to parse resubscribe event', { raw, error });
    return false;
  }

  const state = parsed.result.status?.state;
  if (!resumeState.sent && state === 'input-required') {
    resumeState.sent = true;
    await sendResume(context, parsed.result.taskId ?? context.childTaskId);
  }

  if (parsed.result.final) {
    return true;
  }

  return false;
}

async function sendResume(context: ResubscribeContext, taskId: string): Promise<void> {
  const resumeRequest = {
    jsonrpc: '2.0' as const,
    id: 3,
    method: 'message/send',
    params: {
      message: {
        kind: 'message' as const,
        messageId: uuidv4(),
        contextId: context.contextId,
        role: 'user' as const,
        parts: [{ kind: 'data', data: { ok: true } }],
        taskId,
      },
    },
  };

  const response = await fetch(`${context.baseUrl}/a2a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resumeRequest),
  });

  const body = await response.text();

  console.log('Resume response', response.status, response.statusText, body);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
