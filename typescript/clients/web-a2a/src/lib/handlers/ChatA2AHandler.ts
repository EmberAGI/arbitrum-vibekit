/**
 * Chat A2A Handler
 *
 * Handles chat-style A2A connections with text input support
 */

import { BaseA2AHandler, A2AHandlerConfig, A2AHandlerCallbacks } from './BaseA2AHandler';
import { processSSEStream } from '@/lib/utils/sseProcessor';
import {
  processA2AEvent,
  type EventProcessorState,
  type EventProcessorCallbacks,
} from '@/lib/utils/a2aEventProcessor';

export class ChatA2AHandler extends BaseA2AHandler {
  private activeRequest: AbortController | null = null;
  private isProcessingFlag = false;

  constructor(config: A2AHandlerConfig, callbacks: A2AHandlerCallbacks) {
    super(config, callbacks);
  }

  async sendMessage(message: string, metadata?: Record<string, string>): Promise<void> {
    if (!this.config.agentEndpoint) {
      console.error('[ChatA2A] No agent endpoint for session:', this.config.sessionId);
      return;
    }

    this.isProcessingFlag = true;
    this.callbacks.onStatusUpdate(this.config.sessionId, 'working');

    // Cancel any existing request
    if (this.activeRequest) {
      this.activeRequest.abort();
    }

    this.activeRequest = new AbortController();

    try {
      const messagePayload = this.createMessagePayload(message, metadata);
      // Use the messageId from payload for JSON-RPC request id
      const messageId = messagePayload.messageId;

      const request = {
        jsonrpc: '2.0',
        id: messageId,
        method: 'message/stream',
        params: {
          message: messagePayload,
          configuration: {
            acceptedOutputModes: ['text/plain'],
          },
        },
      };

      const response = await fetch(this.config.agentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: this.activeRequest.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.processStream(response);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[ChatA2A] Request aborted for session:', this.config.sessionId);
      } else {
        console.error(
          '[ChatA2A] Failed to send message for session:',
          this.config.sessionId,
          error,
        );
        this.callbacks.onMessage(
          this.config.sessionId,
          '',
          `Error: ${error.message}`,
          'agent-error',
          {
            isStreaming: false,
          },
        );
        this.callbacks.onStatusUpdate(this.config.sessionId, 'error', error);
      }
    } finally {
      this.isProcessingFlag = false;
      this.activeRequest = null;
    }
  }

  async reconnectToStream(): Promise<void> {
    if (!this.config.agentEndpoint) {
      console.error('[ChatA2A] No agent endpoint for session:', this.config.sessionId);
      return;
    }

    if (!this.config.taskId) {
      console.warn('[ChatA2A] Cannot resubscribe without taskId:', this.config.sessionId);
      return;
    }

    this.isProcessingFlag = true;
    this.callbacks.onStatusUpdate(this.config.sessionId, 'connecting');

    const requestId = `resubscribe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Cancel any existing request
    if (this.activeRequest) {
      this.activeRequest.abort();
    }

    this.activeRequest = new AbortController();

    try {
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tasks/resubscribe',
        params: {
          id: this.config.taskId,
          metadata: {
            sessionId: this.config.sessionId,
            reconnect: 'true',
          },
        },
      };

      const response = await fetch(this.config.agentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: this.activeRequest.signal,
      });

      if (!response.ok) {
        await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.processStream(response, true);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[ChatA2A] Resubscription aborted for session:', this.config.sessionId);
      } else {
        console.error('[ChatA2A] Failed to resubscribe for session:', this.config.sessionId, error);
        this.callbacks.onMessage(
          this.config.sessionId,
          '',
          `Error resubscribing to task: ${error.message}`,
          'agent-error',
          {
            isStreaming: false,
          },
        );
        this.callbacks.onStatusUpdate(this.config.sessionId, 'error', error);
      }
    } finally {
      this.isProcessingFlag = false;
      this.activeRequest = null;
    }
  }

  async sendToActiveTask(data: any, metadata?: Record<string, string>): Promise<void> {
    if (!this.config.agentEndpoint) {
      console.error('[ChatA2A] No agent endpoint for session:', this.config.sessionId);
      return;
    }

    if (!this.config.contextId) {
      console.error('[ChatA2A] No contextId - cannot send to active task:', this.config.sessionId);
      return;
    }

    this.isProcessingFlag = true;
    this.callbacks.onStatusUpdate(this.config.sessionId, 'working');

    try {
      const dataPayload = this.createDataPayload(data, metadata);

      const request = {
        jsonrpc: '2.0',
        id: dataPayload.messageId,
        method: 'message/stream',
        params: {
          message: dataPayload,
          configuration: {
            acceptedOutputModes: ['text/plain'],
          },
        },
      };

      const response = await fetch(this.config.agentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.processStream(response);
    } catch (error: any) {
      console.error('[ChatA2A] Failed to send user interaction:', this.config.sessionId, error);
      this.callbacks.onStatusUpdate(this.config.sessionId, 'error', error);
      throw error;
    } finally {
      this.isProcessingFlag = false;
    }
  }

  abort(): void {
    if (this.activeRequest) {
      this.activeRequest.abort();
      this.activeRequest = null;
      this.isProcessingFlag = false;
    }
  }

  isProcessing(): boolean {
    return this.isProcessingFlag;
  }

  /**
   * Process SSE stream
   */
  private async processStream(response: Response, isResubscribe = false): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    // Initialize state for event processing
    const currentAgentMessageId = this.callbacks.onMessage(this.config.sessionId, '', '', 'agent', {
      isStreaming: true,
    });

    const eventState: EventProcessorState = {
      sessionId: this.config.sessionId,
      contextId: this.config.contextId,
      currentAgentMessageId,
      reasoningText: '',
      responseText: '',
      artifactsMap: {},
    };

    const eventCallbacks: EventProcessorCallbacks = {
      onMessage: this.callbacks.onMessage,
      onStatusUpdate: this.callbacks.onStatusUpdate,
      onContextIdReceived: this.callbacks.onContextIdReceived,
      onTaskReceived: this.callbacks.onTaskReceived,
      onTaskStateChanged: this.callbacks.onTaskStateChanged,
      onChildTaskDetected: this.callbacks.onChildTaskDetected,
      onToolInvocation: this.callbacks.onToolInvocation,
    };

    // Process SSE stream using utility
    await processSSEStream(reader, {
      onEvent: async (event) => {
        // Special handling for resubscribe: process initial task artifacts
        if (
          isResubscribe &&
          event.kind === 'task' &&
          event.artifacts &&
          Array.isArray(event.artifacts)
        ) {
          console.log('[ChatA2A] Resubscribe: Processing initial task artifacts');

          for (const artifact of event.artifacts) {
            const artifactType = artifact.name || artifact.artifactId;
            const artifactId = artifact.artifactId || artifact.id || artifactType;

            if (artifact.parts) {
              const dataParts = artifact.parts.filter((p: any) => p.kind === 'data' && p.data);
              const hasMultipleDataParts = dataParts.length > 1;
              let aggregatedData: any = null;

              for (const part of artifact.parts) {
                if (part.kind === 'data' && part.data) {
                  const toolData = part.data;
                  if (hasMultipleDataParts) {
                    if (aggregatedData === null) {
                      aggregatedData = [toolData];
                    } else if (Array.isArray(aggregatedData)) {
                      aggregatedData.push(toolData);
                    }
                  } else {
                    aggregatedData = toolData;
                  }
                }
              }

              if (aggregatedData !== null) {
                eventState.artifactsMap[artifactId] = {
                  artifactId,
                  toolName: artifactId,
                  input: aggregatedData,
                  output: aggregatedData,
                  append: false,
                  isLoading: false,
                };
              }
            }
          }

          if (Object.keys(eventState.artifactsMap).length > 0) {
            this.callbacks.onMessage(
              this.config.sessionId,
              currentAgentMessageId,
              eventState.responseText,
              'agent',
              {
                reasoning: eventState.reasoningText,
                artifacts: eventState.artifactsMap,
                isStreaming: false,
              },
            );
          }
        }

        // Process message from history if present (e.g., input-required message)
        if (
          isResubscribe &&
          event.kind === 'task' &&
          event.history &&
          Array.isArray(event.history) &&
          event.history.length > 0
        ) {
          const latestMessage = event.history[event.history.length - 1];
          if (latestMessage.parts) {
            for (const part of latestMessage.parts) {
              if (part.kind === 'text' && part.text) {
                eventState.responseText = part.text;
                this.callbacks.onMessage(
                  this.config.sessionId,
                  currentAgentMessageId,
                  eventState.responseText,
                  'agent',
                  {
                    reasoning: eventState.reasoningText,
                    artifacts: eventState.artifactsMap,
                    isStreaming: false,
                  },
                );
              }
            }
          }
        }

        // Use standard event processor
        await processA2AEvent(event, eventState, eventCallbacks);
      },
      onError: (error) => {
        this.callbacks.onMessage(
          this.config.sessionId,
          eventState.currentAgentMessageId,
          `Error: ${error.message}`,
          'agent-error',
          {
            isStreaming: false,
          },
        );
        this.callbacks.onStatusUpdate(this.config.sessionId, 'error', error);
      },
    });
  }
}
