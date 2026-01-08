/**
 * A2A Session Hook
 *
 * Session-aware wrapper around A2A client functionality
 * Integrates A2A protocol with session management
 */

'use client';

import { useCallback, useRef, useEffect } from 'react';
import { SessionStatus } from '@/lib/types/session';
import { processSSEStream } from '@/lib/utils/sseProcessor';
import {
  processA2AEvent,
  type EventProcessorState,
  type EventProcessorCallbacks,
} from '@/lib/utils/a2aEventProcessor';

interface A2ASessionConfig {
  sessionId: string;
  agentEndpoint: string;
  contextId: string | null;
  taskId?: string | null; // Current task ID for resubscription
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

interface UseA2ASessionReturn {
  sendMessage: (
    config: A2ASessionConfig,
    message: string,
    metadata: Record<string, string>,
  ) => Promise<void>;
  reconnectToStream: (config: A2ASessionConfig) => Promise<void>;
  sendToActiveTask: (
    sessionId: string,
    agentEndpoint: string,
    contextId: string,
    data: any,
    onMessage: (
      sessionId: string,
      messageId: string,
      content: string,
      sender: 'agent' | 'agent-progress' | 'agent-error',
      updates?: any,
    ) => string,
    onStatusUpdate: (sessionId: string, status: SessionStatus, data?: any) => void,
    metadata?: Record<string, string>,
  ) => Promise<void>;
  isProcessing: (sessionId: string) => boolean;
}

/**
 * Hook to manage A2A communications for multiple sessions
 */
export function useA2ASession(): UseA2ASessionReturn {
  const activeRequestsRef = useRef<Map<string, AbortController>>(new Map());
  const processingSessionsRef = useRef<Set<string>>(new Set());

  const sendMessage = useCallback(
    async (config: A2ASessionConfig, message: string, metadata: Record<string, string>) => {
      const {
        sessionId,
        agentEndpoint,
        contextId,
        onMessage,
        onStatusUpdate,
        onContextIdReceived,
        onTaskReceived,
        onTaskStateChanged,
        onChildTaskDetected,
        onToolInvocation,
      } = config;

      if (!agentEndpoint) {
        console.error('[A2ASession] No agent endpoint for session:', sessionId);
        return;
      }

      // Mark session as processing
      processingSessionsRef.current.add(sessionId);
      onStatusUpdate(sessionId, 'working');

      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Cancel any existing request for this session
      if (activeRequestsRef.current.has(sessionId)) {
        activeRequestsRef.current.get(sessionId)?.abort();
      }

      const abortController = new AbortController();
      activeRequestsRef.current.set(sessionId, abortController);

      console.log('[A2ASession] Sending message for session:', sessionId, {
        hasContextId: !!contextId,
        contextId,
      });

      try {
        // Prepare message payload
        const messagePayload: any = {
          role: 'user',
          parts: [{ kind: 'text', text: message }],
          messageId,
          metadata,
        };

        // Only include contextId if we have one
        if (contextId) {
          messagePayload.contextId = contextId;
        }

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

        // Make fetch request with SSE
        const response = await fetch(agentEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(request),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Process SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        // Initialize state for event processing
        const currentAgentMessageId = onMessage(sessionId, '', '', 'agent', {
          isStreaming: true,
        });

        const eventState: EventProcessorState = {
          sessionId,
          contextId,
          currentAgentMessageId,
          reasoningText: '',
          responseText: '',
          artifactsMap: {},
        };

        const eventCallbacks: EventProcessorCallbacks = {
          onMessage,
          onStatusUpdate,
          onContextIdReceived,
          onTaskReceived,
          onTaskStateChanged,
          onChildTaskDetected,
          onToolInvocation,
        };

        // Process SSE stream using utility
        await processSSEStream(reader, {
          onEvent: async (event) => {
            await processA2AEvent(event, eventState, eventCallbacks);
          },
          onError: (error) => {
            onMessage(
              sessionId,
              eventState.currentAgentMessageId,
              `Error: ${error.message}`,
              'agent-error',
              {
                isStreaming: false,
              },
            );
            onStatusUpdate(sessionId, 'error', error);
          },
        });

        console.log('[A2ASession] Stream ended for session:', sessionId);
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('[A2ASession] Request aborted for session:', sessionId);
        } else {
          console.error('[A2ASession] Failed to send message for session:', sessionId, error);
          onMessage(sessionId, '', `Error: ${error.message}`, 'agent-error', {
            isStreaming: false,
          });
          onStatusUpdate(sessionId, 'error', error);
        }
      } finally {
        processingSessionsRef.current.delete(sessionId);
        activeRequestsRef.current.delete(sessionId);
      }
    },
    [],
  );

  const reconnectToStream = useCallback(async (config: A2ASessionConfig) => {
    const {
      sessionId,
      agentEndpoint,
      contextId,
      taskId,
      onMessage,
      onStatusUpdate,
      onContextIdReceived,
      onTaskReceived,
      onTaskStateChanged,
      onChildTaskDetected,
      onToolInvocation,
    } = config;

    if (!agentEndpoint) {
      console.error('[A2ASession] No agent endpoint for session:', sessionId);
      return;
    }

    if (!taskId) {
      console.warn(
        '[A2ASession] Cannot resubscribe without taskId:',
        sessionId,
        '- falling back to message/stream with contextId',
      );
      // If no taskId but we have contextId, fall back to old method
      if (!contextId) {
        return;
      }
    }

    // Mark session as processing
    processingSessionsRef.current.add(sessionId);
    onStatusUpdate(sessionId, 'connecting');

    const requestId = `resubscribe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Cancel any existing request for this session
    if (activeRequestsRef.current.has(sessionId)) {
      activeRequestsRef.current.get(sessionId)?.abort();
    }

    const abortController = new AbortController();
    activeRequestsRef.current.set(sessionId, abortController);

    console.log('[A2ASession] Resubscribing to task for session:', sessionId, {
      taskId,
      contextId,
      agentEndpoint,
    });

    try {
      // Prepare resubscribe request using tasks/resubscribe method
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tasks/resubscribe',
        params: {
          id: taskId, // Task ID to resubscribe to
          metadata: {
            sessionId,
            reconnect: 'true',
          },
        },
      };

      console.log('[A2ASession] Sending resubscribe request:', JSON.stringify(request, null, 2));

      // Make fetch request with SSE
      const response = await fetch(agentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          '[A2ASession] Resubscribe request failed:',
          response.status,
          response.statusText,
          errorText,
        );
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('[A2ASession] Resubscribe response received, status:', response.status);

      // Process SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      // Initialize state for event processing
      const currentAgentMessageId = onMessage(sessionId, '', '', 'agent', {
        isStreaming: true,
      });

      const eventState: EventProcessorState = {
        sessionId,
        contextId,
        currentAgentMessageId,
        reasoningText: '',
        responseText: '',
        artifactsMap: {},
      };

      const eventCallbacks: EventProcessorCallbacks = {
        onMessage,
        onStatusUpdate,
        onContextIdReceived,
        onTaskReceived,
        onTaskStateChanged,
        onChildTaskDetected,
        onToolInvocation,
      };

      // Process SSE stream using utility
      await processSSEStream(reader, {
        onEvent: async (event) => {
          // Special handling for resubscribe: process initial task artifacts
          if (event.kind === 'task' && event.artifacts && Array.isArray(event.artifacts)) {
            console.log('[A2ASession] Resubscribe: Processing initial task artifacts');

            // Process ALL artifacts including data artifacts
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

            // Update message with artifacts if any
            if (Object.keys(eventState.artifactsMap).length > 0) {
              onMessage(sessionId, currentAgentMessageId, eventState.responseText, 'agent', {
                reasoning: eventState.reasoningText,
                artifacts: eventState.artifactsMap,
                isStreaming: false,
              });
            }
          }

          // Process message from history if present (e.g., input-required message)
          if (
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
                  onMessage(sessionId, currentAgentMessageId, eventState.responseText, 'agent', {
                    reasoning: eventState.reasoningText,
                    artifacts: eventState.artifactsMap,
                    isStreaming: false,
                  });
                }
              }
            }
          }

          // Use standard event processor
          await processA2AEvent(event, eventState, eventCallbacks);
        },
        onError: (error) => {
          onMessage(
            sessionId,
            eventState.currentAgentMessageId,
            `Error resubscribing to task: ${error.message}`,
            'agent-error',
            {
              isStreaming: false,
            },
          );
          onStatusUpdate(sessionId, 'error', error);
        },
      });

      console.log('[A2ASession] Resubscription stream ended for session:', sessionId);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[A2ASession] Resubscription aborted for session:', sessionId);
      } else {
        console.error('[A2ASession] Failed to resubscribe for session:', sessionId, error);
        onMessage(sessionId, '', `Error resubscribing to task: ${error.message}`, 'agent-error', {
          isStreaming: false,
        });
        onStatusUpdate(sessionId, 'error', error);
      }
    } finally {
      processingSessionsRef.current.delete(sessionId);
      activeRequestsRef.current.delete(sessionId);
    }
  }, []);

  const sendToActiveTask = useCallback(
    async (
      sessionId: string,
      agentEndpoint: string,
      contextId: string,
      data: any,
      onMessage: (
        sessionId: string,
        messageId: string,
        content: string,
        sender: 'agent' | 'agent-progress' | 'agent-error',
        updates?: any,
      ) => string,
      onStatusUpdate: (sessionId: string, status: SessionStatus, data?: any) => void,
      metadata: Record<string, string> = {},
    ) => {
      if (!agentEndpoint) {
        console.error('[A2ASession] No agent endpoint for session:', sessionId);
        return;
      }

      if (!contextId) {
        console.error('[A2ASession] No contextId - cannot send to active task:', sessionId);
        return;
      }

      console.log('[A2ASession] Sending user interaction data to active task:', {
        sessionId,
        contextId,
        data,
      });

      const messageId = `user-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      try {
        // Prepare user interaction message
        const request = {
          jsonrpc: '2.0',
          id: messageId,
          method: 'message/stream', // Use streaming to continue task
          params: {
            message: {
              role: 'user',
              parts: [
                {
                  kind: 'data',
                  data: data,
                },
              ],
              messageId,
              contextId, // Important: continue in the same context and task
              metadata: {
                ...metadata,
                userInteraction: 'true',
                interactionType: 'component-response',
              },
            },
            configuration: {
              acceptedOutputModes: ['text/plain'],
            },
          },
        };

        // Mark as processing
        processingSessionsRef.current.add(sessionId);
        onStatusUpdate(sessionId, 'working');

        // Send via streaming (SSE)
        const response = await fetch(agentEndpoint, {
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

        console.log('[A2ASession] User interaction sent, processing stream...');

        // TODO: Add streaming response processing here
        // For now, just log success
        console.log('[A2ASession] User interaction stream initiated');
      } catch (error: any) {
        console.error('[A2ASession] Failed to send user interaction:', sessionId, error);
        onStatusUpdate(sessionId, 'error', error);
        throw error;
      } finally {
        processingSessionsRef.current.delete(sessionId);
      }
    },
    [],
  );

  const isProcessing = useCallback((sessionId: string): boolean => {
    return processingSessionsRef.current.has(sessionId);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRequestsRef.current.forEach((controller) => controller.abort());
      activeRequestsRef.current.clear();
    };
  }, []);

  return {
    sendMessage,
    reconnectToStream,
    sendToActiveTask,
    isProcessing,
  };
}
