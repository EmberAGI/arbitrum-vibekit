import type { RequestContext } from '@a2a-js/sdk/server';
import {
  type AgentExecutor,
  type ExecutionEventBus,
  type ExecutionEventBusManager,
  type TaskStore,
} from '@a2a-js/sdk/server';

import type { AIService } from '../ai/service.js';
import type { WorkflowRuntime } from '../workflows/runtime.js';

import { AIHandler } from './handlers/aiHandler.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { WorkflowHandler } from './handlers/workflowHandler.js';
import type { SessionManager } from './sessions/manager.js';

/**
 * Creates an AgentExecutor that integrates with the workflow runtime and AI
 */
export function createAgentExecutor(
  workflowRuntime: WorkflowRuntime | undefined,
  ai: AIService,
  sessionManager: SessionManager,
  eventBusManager: ExecutionEventBusManager,
  taskStore: TaskStore,
): AgentExecutor {
  return new A2AAgentExecutor(workflowRuntime, ai, sessionManager, eventBusManager, taskStore);
}

/**
 * Main agent executor implementation for the A2A system
 * Delegates to specialized handlers for different aspects of agent functionality
 */
class A2AAgentExecutor implements AgentExecutor {
  private messageHandler: MessageHandler;
  private workflowHandler: WorkflowHandler;
  private aiHandler: AIHandler;
  private sessionManager: SessionManager;

  constructor(
    workflowRuntime: WorkflowRuntime | undefined,
    ai: AIService,
    sessionManager: SessionManager,
    eventBusManager: ExecutionEventBusManager,
    taskStore: TaskStore,
  ) {
    // Store session manager for contextId validation
    this.sessionManager = sessionManager;

    // Initialize handlers
    this.workflowHandler = new WorkflowHandler(workflowRuntime, eventBusManager, taskStore);
    this.aiHandler = new AIHandler(ai, this.workflowHandler, sessionManager);
    this.messageHandler = new MessageHandler(this.workflowHandler, this.aiHandler);
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { userMessage, taskId, contextId } = requestContext;

    // Ensure session exists for this contextId
    // Sessions are created on-demand for any contextId (client-provided or server-generated)
    // This is the A2A spec behavior - contextIds are opaque identifiers managed by the server
    if (!this.sessionManager.getSession(contextId)) {
      this.sessionManager.createSessionWithId(contextId);
    }

    // Extract message content and data
    const { content: messageContent, data: messageData } =
      this.messageHandler.extractMessageParts(userMessage);

    // Delegate to message handler for routing and processing
    await this.messageHandler.handleMessage(
      taskId,
      contextId,
      messageContent,
      messageData,
      eventBus,
    );
  }

  async cancelTask(taskId: string, _eventBus: ExecutionEventBus): Promise<void> {
    // Delegate cancellation to workflow handler
    this.workflowHandler.cancelTask(taskId);
    return Promise.resolve();
  }
}
