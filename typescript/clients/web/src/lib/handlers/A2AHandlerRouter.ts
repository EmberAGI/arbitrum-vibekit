/**
 * A2A Handler Router
 *
 * Routes A2A requests to appropriate handlers (Chat vs Workflow)
 */

import { BaseA2AHandler, A2AHandlerConfig, A2AHandlerCallbacks } from './BaseA2AHandler';
import { ChatA2AHandler } from './ChatA2AHandler';
import { WorkflowA2AHandler } from './WorkflowA2AHandler';
import { Session } from '@/lib/types/session';

export type HandlerType = 'chat' | 'workflow';

/**
 * Determine handler type from session
 */
export function getHandlerType(session: Session): HandlerType {
  // Workflows are identified by having a parentSessionId
  // or being of type "tool-execution"
  if (session.parentSessionId || session.type === 'tool-execution') {
    return 'workflow';
  }
  return 'chat';
}

/**
 * Create appropriate handler for a session
 */
export function createA2AHandler(session: Session, callbacks: A2AHandlerCallbacks): BaseA2AHandler {
  const handlerType = getHandlerType(session);

  const config: A2AHandlerConfig = {
    sessionId: session.id,
    agentEndpoint: session.agentEndpoint || '',
    contextId: session.contextId,
    taskId: session.tasks.length > 0 ? session.tasks[session.tasks.length - 1].taskId : null,
  };

  if (handlerType === 'workflow') {
    return new WorkflowA2AHandler(config, callbacks);
  }

  return new ChatA2AHandler(config, callbacks);
}

/**
 * Router class for managing multiple handlers
 */
export class A2AHandlerRouter {
  private handlers: Map<string, BaseA2AHandler> = new Map();

  /**
   * Get or create handler for a session
   */
  getHandler(session: Session, callbacks: A2AHandlerCallbacks): BaseA2AHandler {
    if (!this.handlers.has(session.id)) {
      const handler = createA2AHandler(session, callbacks);
      this.handlers.set(session.id, handler);
    }

    const handler = this.handlers.get(session.id)!;

    // Update handler config if session changed
    const config: A2AHandlerConfig = {
      sessionId: session.id,
      agentEndpoint: session.agentEndpoint || '',
      contextId: session.contextId,
      taskId: session.tasks.length > 0 ? session.tasks[session.tasks.length - 1].taskId : null,
    };

    // Update config if it changed
    const currentConfig = handler.getConfig();
    if (
      currentConfig.agentEndpoint !== config.agentEndpoint ||
      currentConfig.contextId !== config.contextId ||
      currentConfig.taskId !== config.taskId
    ) {
      handler.updateConfig(config);
    }

    return handler;
  }

  /**
   * Remove handler for a session
   */
  removeHandler(sessionId: string): void {
    this.handlers.delete(sessionId);
  }

  /**
   * Clear all handlers (aborts active requests)
   */
  clear(): void {
    // Abort all active requests before clearing
    this.handlers.forEach((handler) => {
      handler.abort();
    });
    this.handlers.clear();
  }
}
