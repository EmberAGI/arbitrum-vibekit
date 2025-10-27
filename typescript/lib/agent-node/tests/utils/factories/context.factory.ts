import type { Message } from '@a2a-js/sdk';
import type { RequestContext } from '@a2a-js/sdk/server';

import type { ResumeResult, WorkflowExecution } from '../../../src/workflows/types.js';

/**
 * Factory for creating test RequestContext objects
 */
export function createRequestContext(
  message: Message,
  taskId: string,
  contextId: string,
): RequestContext {
  return {
    userMessage: message,
    taskId,
    contextId,
  } as RequestContext;
}

/**
 * Create a simple request context with text message
 */
export function createSimpleRequestContext(
  text: string,
  taskId = '',
  contextId = 'ctx-test',
): RequestContext {
  const message: Message = {
    kind: 'message',
    messageId: 'msg-test',
    contextId,
    role: 'user',
    parts: [{ kind: 'text', text }],
  };
  return createRequestContext(message, taskId, contextId);
}

/**
 * Factory for creating WorkflowExecution stubs
 */
export function createWorkflowExecutionStub(
  executionId: string,
  contextId: string,
  state: WorkflowExecution['state'],
): WorkflowExecution {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const execution: WorkflowExecution = {
    id: executionId,
    pluginId: 'test-plugin',
    state,
    context: {
      contextId,
      taskId: executionId,
    },
    startedAt: new Date(),
    waitForCompletion: () => Promise.resolve(undefined),
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
      return execution;
    },
    getArtifacts: () => [],
    getError: () => undefined,
    getPauseInfo: () => undefined,
    resume: (_input: unknown): Promise<ResumeResult> => Promise.resolve({ valid: true }),
  };

  return execution;
}
