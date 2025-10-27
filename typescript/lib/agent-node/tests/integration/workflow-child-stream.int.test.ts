/**
 * Minimal SDK contract test for workflow child stream lifecycle
 *
 * Tests the core A2A SDK plumbing for workflow child tasks:
 * - Parent task dispatches child task
 * - Child task is discoverable via getTask()
 * - Child task can be resumed via sendMessage()
 * - Child events stream correctly via resubscribeTask()
 * - Bus isolation (parent artifacts don't leak to child stream)
 */

import type { Server } from 'http';

import type {
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  AgentCard,
  Artifact,
  Message,
  TextPart,
} from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import type { RequestContext } from '@a2a-js/sdk/server';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBusManager,
  ExecutionEventQueue,
  ResultManager,
  type AgentExecutor,
  type ExecutionEventBus,
  type ExecutionEventBusManager,
  type TaskStore,
} from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import express from 'express';
import { v7 as uuidv7 } from 'uuid';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stub executor that manually orchestrates parent → child task flow
 * Uses shared EventBusManager to create child buses
 */
class StubExecutor implements AgentExecutor {
  private childResumeHandlers = new Map<string, () => Promise<void>>();

  constructor(
    private eventBusManager: ExecutionEventBusManager,
    private taskStore: TaskStore,
  ) {}

  async execute(requestContext: RequestContext, parentBus: ExecutionEventBus): Promise<void> {
    const { taskId: parentTaskId, contextId, userMessage } = requestContext;

    // Check if this is a resume request (has taskId in message data or explicit taskId in requestContext)
    const isResume = userMessage.parts.some((p) => p.kind === 'data');

    if (isResume) {
      // This is a resume request - parentTaskId is actually the child task ID when resuming
      const resumeHandler = this.childResumeHandlers.get(parentTaskId);
      if (resumeHandler) {
        await resumeHandler();
        return;
      }
    }

    // This is a new parent task - dispatch child workflow
    // First, publish the parent task event
    const parentTask: Task = {
      kind: 'task',
      id: parentTaskId,
      contextId,
      status: {
        state: 'working',
      },
    };
    parentBus.publish(parentTask);

    const childTaskId = uuidv7();
    const childContextId = contextId;

    // 1. Create child bus using SHARED manager (BEFORE announcing)
    const childBus = this.eventBusManager.createOrGetByTaskId(childTaskId);

    // 2. Start persistence loop IMMEDIATELY
    const childQueue = new ExecutionEventQueue(childBus);
    const childResults = new ResultManager(this.taskStore);
    void (async () => {
      for await (const event of childQueue.events()) {
        await childResults.processEvent(event);
      }
    })();

    // 3. Publish child task event
    const childTask: Task = {
      kind: 'task',
      id: childTaskId,
      contextId: childContextId,
      status: {
        state: 'submitted',
      },
    };
    childBus.publish(childTask);

    // Update to working
    childBus.publish({
      kind: 'status-update',
      taskId: childTaskId,
      contextId: childContextId,
      status: {
        state: 'working',
      },
      final: false,
    } as TaskStatusUpdateEvent);

    // 4. Emit pre-pause artifacts (2)
    const prePauseArtifact1: Artifact = {
      artifactId: 'pre-pause-1.json',
      name: 'pre-pause-1.json',
      mimeType: 'application/json',
      parts: [
        {
          kind: 'data',
          data: { phase: 'before-pause', index: 0 },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    childBus.publish({
      kind: 'artifact-update',
      taskId: childTaskId,
      contextId: childContextId,
      artifact: prePauseArtifact1,
    } as TaskArtifactUpdateEvent);

    const prePauseArtifact2: Artifact = {
      artifactId: 'pre-pause-2.json',
      name: 'pre-pause-2.json',
      mimeType: 'application/json',
      parts: [
        {
          kind: 'data',
          data: { phase: 'before-pause', index: 1 },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    childBus.publish({
      kind: 'artifact-update',
      taskId: childTaskId,
      contextId: childContextId,
      artifact: prePauseArtifact2,
    } as TaskArtifactUpdateEvent);

    // 5. Pause for input
    const pauseMessage: Message = {
      kind: 'message',
      messageId: uuidv7(),
      contextId: childContextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Need input' } as TextPart],
    };
    childBus.publish({
      kind: 'status-update',
      taskId: childTaskId,
      contextId: childContextId,
      status: {
        state: 'input-required',
        message: pauseMessage,
      },
      final: false,
    } as TaskStatusUpdateEvent);

    // 6. Small delay to ensure persistence
    await wait(20);

    // 7. Register resume handler for this child
    this.childResumeHandlers.set(childTaskId, async () => {
      // Resume: transition to working
      childBus.publish({
        kind: 'status-update',
        taskId: childTaskId,
        contextId: childContextId,
        status: {
          state: 'working',
        },
        final: false,
      } as TaskStatusUpdateEvent);

      // Emit post-resume artifact (1)
      const postResumeArtifact: Artifact = {
        artifactId: 'post-resume-1.json',
        name: 'post-resume-1.json',
        mimeType: 'application/json',
        parts: [
          {
            kind: 'data',
            data: { phase: 'after-resume', index: 0 },
            metadata: { mimeType: 'application/json' },
          },
        ],
      };
      childBus.publish({
        kind: 'artifact-update',
        taskId: childTaskId,
        contextId: childContextId,
        artifact: postResumeArtifact,
      } as TaskArtifactUpdateEvent);

      // Complete
      const completionMessage: Message = {
        kind: 'message',
        messageId: uuidv7(),
        contextId: childContextId,
        role: 'agent',
        parts: [{ kind: 'text', text: 'Child task completed' } as TextPart],
      };
      childBus.publish({
        kind: 'status-update',
        taskId: childTaskId,
        contextId: childContextId,
        status: {
          state: 'completed',
          message: completionMessage,
        },
        final: true,
      } as TaskStatusUpdateEvent);

      // Finish child bus
      childBus.finished();

      // Clean up resume handler
      this.childResumeHandlers.delete(childTaskId);

      // Wait for persistence to drain
      await wait(20);
    });

    // 8. NOW announce via parent referenceTaskIds
    const parentToolCallMessage: Message = {
      kind: 'message',
      messageId: uuidv7(),
      contextId,
      role: 'agent',
      parts: [
        {
          kind: 'tool-call',
          toolCallId: uuidv7(),
          toolName: 'dispatch_workflow',
          args: {},
        },
      ],
    };
    parentBus.publish({
      kind: 'status-update',
      taskId: parentTaskId,
      contextId,
      status: {
        state: 'working',
        message: {
          ...parentToolCallMessage,
          referenceTaskIds: [childTaskId],
        },
      },
      final: false,
    } as TaskStatusUpdateEvent);

    // 9. Complete parent task
    const parentCompletionMessage: Message = {
      kind: 'message',
      messageId: uuidv7(),
      contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Parent task completed' } as TextPart],
    };
    parentBus.publish({
      kind: 'status-update',
      taskId: parentTaskId,
      contextId,
      status: {
        state: 'completed',
        message: parentCompletionMessage,
      },
      final: true,
    } as TaskStatusUpdateEvent);

    // Finish parent bus
    parentBus.finished();
  }

  async cancelTask(_taskId: string, _eventBus: ExecutionEventBus): Promise<void> {
    // No-op for this test
  }
}

/**
 * Helper to collect events from SSE stream
 * Collects events until stream ends or timeout is reached
 */
async function collectStreamEvents(
  stream: AsyncIterable<unknown>,
  timeoutMs: number = 5000,
): Promise<unknown[]> {
  const events: unknown[] = [];
  const streamPromise = (async () => {
    try {
      for await (const event of stream) {
        events.push(event);
      }
    } catch (_error) {
      // Stream ended with error - that's ok, return what we collected
    }
  })();

  const timeoutPromise = new Promise<void>((resolve) => setTimeout(() => resolve(), timeoutMs));

  // Wait for either stream to end or timeout
  await Promise.race([streamPromise, timeoutPromise]);

  // If stream hasn't ended by timeout, that's ok - return what we have
  return events;
}

/**
 * Helper to poll getTask until predicate is met
 */
async function waitForTaskState(
  client: A2AClient,
  taskId: string,
  predicate: (task: Task | undefined) => boolean,
  attempts: number = 100,
  delayMs: number = 50,
): Promise<Task | undefined> {
  let task: Task | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await client.getTask({ id: taskId });
    if ('result' in response) {
      task = response.result;
    }
    if (predicate(task)) {
      return task;
    }
    await wait(delayMs);
  }
  return task;
}

describe('Workflow Child Stream (SDK Contract)', () => {
  let server: Server;
  let client: A2AClient;
  let serverUrl: string;
  let eventBusManager: ExecutionEventBusManager;
  let taskStore: TaskStore;

  beforeEach(async () => {
    // Create Express app
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json({ limit: '50mb' }));

    // Create shared event bus manager and task store
    eventBusManager = new DefaultExecutionEventBusManager();
    taskStore = new InMemoryTaskStore();

    // Create stub executor with shared manager
    const stubExecutor = new StubExecutor(eventBusManager, taskStore);

    // Start server first to get the actual URL
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => {
      if (server.listening) {
        resolve();
      } else {
        server.once('listening', () => resolve());
      }
    });

    // Get server URL
    const address = server.address();
    if (address && typeof address === 'object') {
      serverUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error('Failed to get server address');
    }

    // Create agent card with actual server URL
    const agentCard: AgentCard = {
      name: 'Test Agent',
      description: 'Minimal test agent for SDK contract validation',
      url: `${serverUrl}/a2a`,
      capabilities: {
        streaming: true,
      },
      version: '1.0.0',
    };

    // Create request handler with shared manager (4th parameter)
    const requestHandler = new DefaultRequestHandler(
      agentCard,
      taskStore,
      stubExecutor,
      eventBusManager, // ← CRITICAL: shared instance
    );

    // Set up A2A routes
    const a2aApp = new A2AExpressApp(requestHandler);
    a2aApp.setupRoutes(app, '/a2a');

    // Add well-known endpoints
    app.get('/.well-known/agent-card.json', (_req, res) => {
      res.json(agentCard);
    });

    app.get('/.well-known/agent.json', (_req, res) => {
      res.json(agentCard);
    });

    // Create client from card URL
    const cardUrl = `${serverUrl}/.well-known/agent.json`;
    client = await A2AClient.fromCardUrl(cardUrl);
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }, 20000);

  it('should dispatch child workflow and make it discoverable via getTask', async () => {
    // 1. Send message to trigger parent task and child workflow dispatch
    const messageStream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: uuidv7(),
        role: 'user',
        parts: [{ kind: 'text', text: 'Start workflow' }],
      },
    });

    // Collect parent stream events
    const parentEvents: unknown[] = [];
    let childTaskId: string | undefined;

    for await (const event of messageStream) {
      parentEvents.push(event);

      // Look for referenceTaskIds in status updates
      if (
        typeof event === 'object' &&
        event !== null &&
        'kind' in event &&
        event.kind === 'status-update'
      ) {
        const statusEvent = event;
        if (
          statusEvent.status?.message &&
          'referenceTaskIds' in statusEvent.status.message &&
          Array.isArray(statusEvent.status.message.referenceTaskIds)
        ) {
          childTaskId = statusEvent.status.message.referenceTaskIds[0] as string;
        }
      }
    }

    // Verify we got a child task ID
    expect(childTaskId).toBeDefined();
    expect(typeof childTaskId).toBe('string');

    // 2. Call getTask(childId) and verify pre-pause artifacts
    const childTask = await waitForTaskState(
      client,
      childTaskId!,
      (task) => task?.status?.state === 'input-required',
      100,
      50,
    );

    expect(childTask).toBeDefined();
    expect(childTask?.status?.state).toBe('input-required');
    expect(childTask?.artifacts).toBeDefined();
    expect(childTask?.artifacts?.length).toBe(2);

    // Verify pre-pause artifact contents
    const artifact1 = childTask?.artifacts?.[0];
    expect(artifact1?.artifactId).toBe('pre-pause-1.json');
    const artifact1Data = artifact1?.parts?.find((p) => p.kind === 'data');
    expect(artifact1Data).toBeDefined();
    if (artifact1Data && 'data' in artifact1Data) {
      expect(artifact1Data.data).toMatchObject({
        phase: 'before-pause',
        index: 0,
      });
    }

    const artifact2 = childTask?.artifacts?.[1];
    expect(artifact2?.artifactId).toBe('pre-pause-2.json');
    const artifact2Data = artifact2?.parts?.find((p) => p.kind === 'data');
    expect(artifact2Data).toBeDefined();
    if (artifact2Data && 'data' in artifact2Data) {
      expect(artifact2Data.data).toMatchObject({
        phase: 'before-pause',
        index: 1,
      });
    }
  });

  it('should stream post-resume events via resubscribeTask', async () => {
    // 1. Dispatch parent and get child task ID
    const messageStream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: uuidv7(),
        role: 'user',
        parts: [{ kind: 'text', text: 'Start workflow' }],
      },
    });

    let childTaskId: string | undefined;
    let parentTaskId: string | undefined;
    let parentContextId: string | undefined;
    for await (const event of messageStream) {
      if (typeof event !== 'object' || event === null || !('kind' in event)) {
        continue;
      }

      if (event.kind === 'task') {
        const taskEvent = event;
        parentTaskId = taskEvent.id;
        parentContextId = taskEvent.contextId;
      } else if (event.kind === 'status-update') {
        const statusEvent = event;
        if (!parentContextId) {
          parentContextId = statusEvent.contextId;
        }
        if (
          statusEvent.status?.message &&
          'referenceTaskIds' in statusEvent.status.message &&
          Array.isArray(statusEvent.status.message.referenceTaskIds)
        ) {
          childTaskId = statusEvent.status.message.referenceTaskIds[0] as string;
        }
      }
    }

    expect(parentTaskId).toBeDefined();
    expect(parentContextId).toBeDefined();
    expect(childTaskId).toBeDefined();

    // 2. Wait for child to reach input-required state
    const childTask = await waitForTaskState(
      client,
      childTaskId!,
      (task) => task?.status?.state === 'input-required',
      100,
      50,
    );
    expect(childTask?.status?.state).toBe('input-required');
    expect(childTask?.contextId).toBe(parentContextId);

    // 3. Subscribe to child stream BEFORE resuming (to capture live events)
    const childStreamPromise = (async () => {
      const childStream = client.resubscribeTask({ id: childTaskId! });
      return await collectStreamEvents(childStream, 5000);
    })();

    // Small delay to ensure subscription is established
    await wait(100);

    // 4. Resume the child task
    const childContextId = childTask?.contextId ?? parentContextId ?? `context-${childTaskId!}`;
    await client.sendMessage({
      message: {
        kind: 'message',
        messageId: uuidv7(),
        role: 'user',
        contextId: childContextId,
        taskId: childTaskId!,
        parts: [
          { kind: 'text', text: 'Resume' },
          { kind: 'data', data: { input: 'test' } },
        ],
      },
    });

    // 5. Collect child stream events
    const childEvents = await childStreamPromise;

    // Verify post-resume artifact appears in stream
    const artifactEvents = childEvents.filter(
      (e) => typeof e === 'object' && e !== null && 'kind' in e && e.kind === 'artifact-update',
    ) as TaskArtifactUpdateEvent[];

    expect(artifactEvents.length).toBeGreaterThan(0);

    // Find post-resume artifact
    const postResumeArtifact = artifactEvents.find(
      (e) => e.artifact?.artifactId === 'post-resume-1.json',
    );
    expect(postResumeArtifact).toBeDefined();

    // Verify completion status
    const statusEvents = childEvents.filter(
      (e) => typeof e === 'object' && e !== null && 'kind' in e && e.kind === 'status-update',
    ) as TaskStatusUpdateEvent[];

    const completedEvent = statusEvents.find((e) => e.status?.state === 'completed');
    expect(completedEvent).toBeDefined();
  }, 15000);

  it('should maintain bus isolation (parent artifacts do not leak to child stream)', async () => {
    // 1. Dispatch parent and get child task ID
    const messageStream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: uuidv7(),
        role: 'user',
        parts: [{ kind: 'text', text: 'Start workflow' }],
      },
    });

    let parentTaskId: string | undefined;
    let parentContextId: string | undefined;
    let childTaskId: string | undefined;

    const parentEvents: unknown[] = [];
    for await (const event of messageStream) {
      parentEvents.push(event);

      if (typeof event === 'object' && event !== null && 'kind' in event) {
        if (event.kind === 'task') {
          const taskEvent = event;
          parentTaskId = taskEvent.id;
          parentContextId = taskEvent.contextId;
        }

        if (event.kind === 'status-update') {
          const statusEvent = event;
          if (!parentContextId) {
            parentContextId = statusEvent.contextId;
          }
          if (
            statusEvent.status?.message &&
            'referenceTaskIds' in statusEvent.status.message &&
            Array.isArray(statusEvent.status.message.referenceTaskIds)
          ) {
            childTaskId = statusEvent.status.message.referenceTaskIds[0] as string;
          }
        }
      }
    }

    expect(parentTaskId).toBeDefined();
    expect(parentContextId).toBeDefined();
    expect(childTaskId).toBeDefined();
    expect(parentTaskId).not.toBe(childTaskId);

    const childTask = await waitForTaskState(
      client,
      childTaskId!,
      (task) => task?.status?.state === 'input-required',
      100,
      50,
    );
    expect(childTask?.status?.state).toBe('input-required');
    if (parentContextId) {
      expect(childTask?.contextId).toBe(parentContextId);
    }
    const childContextId = childTask?.contextId ?? parentContextId ?? `context-${childTaskId!}`;

    // 2. Subscribe to child stream
    const childStream = client.resubscribeTask({ id: childTaskId! });
    const childEvents = await collectStreamEvents(childStream, 3000);

    // 3. Verify child stream contains only child task events
    const taskEvents = childEvents.filter(
      (e) => typeof e === 'object' && e !== null && 'kind' in e && e.kind === 'task',
    ) as Task[];

    // All task events should have childTaskId
    for (const taskEvent of taskEvents) {
      expect(taskEvent.id).toBe(childTaskId);
    }

    // Status updates should all reference childTaskId
    const statusEvents = childEvents.filter(
      (e) => typeof e === 'object' && e !== null && 'kind' in e && e.kind === 'status-update',
    ) as TaskStatusUpdateEvent[];

    for (const statusEvent of statusEvents) {
      expect(statusEvent.taskId).toBe(childTaskId);
    }

    // Artifact updates should all reference childTaskId
    const artifactEvents = childEvents.filter(
      (e) => typeof e === 'object' && e !== null && 'kind' in e && e.kind === 'artifact-update',
    ) as TaskArtifactUpdateEvent[];

    for (const artifactEvent of artifactEvents) {
      expect(artifactEvent.taskId).toBe(childTaskId);
    }

    // Resume child task to flush remaining events and close the bus
    await client.sendMessage({
      message: {
        kind: 'message',
        messageId: uuidv7(),
        role: 'user',
        contextId: childContextId,
        taskId: childTaskId!,
        parts: [
          { kind: 'text', text: 'Resume (cleanup)' },
          { kind: 'data', data: { input: 'cleanup' } },
        ],
      },
    });
  });
});
