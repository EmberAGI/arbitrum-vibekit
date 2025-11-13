/**
 * Base A2A Handler
 *
 * Common functionality shared between Chat and Workflow handlers
 */

import { SessionStatus } from '@/lib/types/session';

export interface A2AHandlerCallbacks {
  onMessage: (
    sessionId: string,
    messageId: string,
    content: string,
    sender: 'agent' | 'agent-progress' | 'agent-error',
    updates?: any,
  ) => string;
  onStatusUpdate: (sessionId: string, status: SessionStatus, data?: any) => void;
  onContextIdReceived: (sessionId: string, contextId: string) => void;
  onTaskReceived?: (sessionId: string, taskId: string, state: string) => void;
  onTaskStateChanged?: (sessionId: string, taskId: string, state: string) => void;
  onChildTaskDetected?: (
    parentSessionId: string,
    childTaskId: string,
    contextId: string,
    metadata?: any,
  ) => void;
  onToolInvocation?: (sessionId: string, toolData: any) => void;
}

export interface A2AHandlerConfig {
  sessionId: string;
  agentEndpoint: string;
  contextId: string | null;
  taskId?: string | null;
}

export abstract class BaseA2AHandler {
  protected config: A2AHandlerConfig;
  protected callbacks: A2AHandlerCallbacks;

  constructor(config: A2AHandlerConfig, callbacks: A2AHandlerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Send a message to the A2A agent
   */
  abstract sendMessage(message: string, metadata?: Record<string, string>): Promise<void>;

  /**
   * Reconnect to an existing stream
   */
  abstract reconnectToStream(): Promise<void>;

  /**
   * Send data to an active task (for user interactions)
   */
  abstract sendToActiveTask(data: any, metadata?: Record<string, string>): Promise<void>;

  /**
   * Abort current request
   */
  abstract abort(): void;

  /**
   * Check if currently processing
   */
  abstract isProcessing(): boolean;

  /**
   * Common method to create A2A request payload
   */
  protected createMessagePayload(message: string, metadata?: Record<string, string>): any {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const payload: any = {
      role: 'user',
      parts: [{ kind: 'text', text: message }],
      messageId,
      metadata: metadata || {},
    };

    if (this.config.contextId) {
      payload.contextId = this.config.contextId;
    }

    return payload;
  }

  /**
   * Common method to create data payload for user interactions
   */
  protected createDataPayload(data: any, metadata?: Record<string, string>): any {
    const messageId = `user-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      role: 'user',
      parts: [
        {
          kind: 'data',
          data: data,
        },
      ],
      messageId,
      contextId: this.config.contextId,
      metadata: {
        ...metadata,
        userInteraction: 'true',
        interactionType: 'component-response',
      },
    };
  }

  /**
   * Update handler configuration
   */
  updateConfig(config: Partial<A2AHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): A2AHandlerConfig {
    return { ...this.config };
  }
}
