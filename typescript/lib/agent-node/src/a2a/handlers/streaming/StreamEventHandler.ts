/**
 * Handles different types of stream events
 */

import type { Part, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { TextStreamPart, Tool } from 'ai';
import { v7 as uuidv7 } from 'uuid';

import { Logger } from '../../../utils/logger.js';

import type { ArtifactManager } from './ArtifactManager.js';

export interface StreamProcessingState {
  textChunkIndex: number;
  reasoningChunkIndex: number;
  bufferedArtifact: TaskArtifactUpdateEvent | null;
  bufferedReasoningArtifact: TaskArtifactUpdateEvent | null;
  toolCallArtifacts: Map<number, string>;
  deltaCounters: Record<string, number>;
  // Accumulated content for building ModelMessage
  accumulatedText: string;
  accumulatedReasoning: string;
  // Tool call tracking for matching SDK events
  toolCalls: Array<{
    name: string;
    artifactId: string;
  }>;
}

/**
 * Routes and handles different stream event types
 */
export class StreamEventHandler {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance('StreamEventHandler');
  }

  /**
   * Handle a stream event based on its type
   */
  handleStreamEvent(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
  ): void {
    switch (streamEvent.type) {
      case 'text-delta':
        this.handleTextDelta(streamEvent, taskId, contextId, eventBus, state, artifactManager);
        break;

      case 'tool-call':
        this.handleToolCall(streamEvent, taskId, contextId, eventBus, state, artifactManager);
        break;

      case 'tool-result':
        this.handleToolResult(streamEvent, taskId, contextId, eventBus, state, artifactManager);
        break;

      case 'reasoning-delta':
        this.handleReasoningDelta(streamEvent, taskId, contextId, eventBus, state, artifactManager);
        break;

      case 'reasoning-start':
        this.logger.debug('stream:reasoning-start');
        break;

      case 'reasoning-end':
        this.handleReasoningEnd(eventBus, state);
        break;

      case 'text-end':
        this.handleTextEnd(eventBus, state);
        break;

      case 'tool-input-end':
        this.handleToolInputEnd(state);
        break;

      default:
        this.handleOtherEvent(streamEvent, state);
        break;
    }
  }

  private handleTextDelta(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
  ): void {
    if (!('text' in streamEvent)) {
      return;
    }

    this.logger.debug('stream:text-delta', {
      len: (streamEvent.text || '').length,
      textChunkIndex: state.textChunkIndex,
    });

    // Accumulate text for CoreMessage
    state.accumulatedText += streamEvent.text;

    // Ring-buffer approach: publish previous chunk and buffer new one
    if (state.bufferedArtifact) {
      eventBus.publish(state.bufferedArtifact);
    }

    state.bufferedArtifact = artifactManager.createStreamingArtifact(
      taskId,
      contextId,
      'text-response',
      streamEvent.text,
      state.textChunkIndex,
      false,
    );
    state.textChunkIndex++;
  }

  private handleToolCall(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
  ): void {
    if (!('toolName' in streamEvent)) {
      return;
    }

    this.logger.debug('stream:tool-call', {
      name: streamEvent.toolName,
      hasInput: Object.prototype.hasOwnProperty.call(streamEvent, 'input'),
    });

    const artifactId = `tool-call-${streamEvent.toolName}-${uuidv7()}`;
    const toolCallIndex = state.toolCalls.length;

    // Store the artifact ID for later update
    state.toolCallArtifacts.set(toolCallIndex, artifactId);

    const isWorkflowDispatch = streamEvent.toolName.startsWith('dispatch_workflow_');

    if (!isWorkflowDispatch) {
      // Create and publish initial artifact for non-workflow tools
      const artifact = artifactManager.createToolCallArtifact(
        taskId,
        contextId,
        streamEvent.toolName,
        {},
      );

      // Override the artifactId to match what we're tracking
      artifact.artifact.artifactId = artifactId;

      this.logger.debug('Publishing tool-call artifact', {
        artifactId,
        toolName: streamEvent.toolName,
        toolCallIndex,
      });

      eventBus.publish(artifact);
    } else {
      this.logger.debug('Skipping initial tool-call artifact for workflow dispatch', {
        artifactId,
        toolName: streamEvent.toolName,
        toolCallIndex,
      });
    }

    // Add to state tool calls array
    state.toolCalls.push({
      name: streamEvent.toolName,
      artifactId,
    });
  }

  private handleToolResult(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
  ): void {
    const toolResultEvent = streamEvent as {
      type: 'tool-result';
      output?: unknown;
    };

    this.logger.debug('stream:tool-result', {
      hasOutput: 'output' in toolResultEvent,
      resultType: typeof toolResultEvent.output,
      isNull: toolResultEvent.output === null,
    });

    const toolCallIndex = state.toolCalls.length - 1;
    const lastToolCall = state.toolCalls[toolCallIndex];

    if (lastToolCall) {
      const artifactId = state.toolCallArtifacts.get(toolCallIndex);
      if (artifactId) {
        const resultArtifact = artifactManager.createToolResultArtifact(
          taskId,
          contextId,
          artifactId,
          lastToolCall.name,
          toolResultEvent.output,
        );

        this.logger.debug('Publishing tool-result artifact', {
          artifactId,
          toolName: lastToolCall.name,
          toolCallIndex,
          resultType: typeof toolResultEvent.output,
          resultSize:
            toolResultEvent.output && typeof toolResultEvent.output === 'object'
              ? Object.keys(toolResultEvent.output as Record<string, unknown>).length + ' keys'
              : 'non-object',
        });

        eventBus.publish(resultArtifact);
      }

      // Check if this is a workflow tool call and publish parent status update
      if (lastToolCall.name.startsWith('dispatch_workflow_')) {
        this.logger.debug('Tool result for workflow dispatch - publishing parent status update');

        // Extract workflow metadata from tool result output
        const workflowResult = toolResultEvent.output as {
          result: Part[];
          taskId: string;
          metadata: { workflowName: string; description: string; pluginId: string };
        };

        if (workflowResult && workflowResult.taskId && workflowResult.metadata) {
          // Build parts array with text, and add workflow-provided parts if present
          const parts: Part[] = [
            {
              kind: 'text',
              text: `Dispatching workflow: ${workflowResult.metadata.workflowName} (${workflowResult.metadata.description})`,
            },
          ];

          // Append workflow result parts
          if (workflowResult.result && workflowResult.result.length > 0) {
            this.logger.debug('Merging workflow dispatch-response parts', {
              partsCount: workflowResult.result.length,
            });
            parts.push(...workflowResult.result);
          }

          // Emit status update with referenceTaskIds
          const statusUpdate: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId,
            contextId,
            status: {
              state: 'working',
              message: {
                kind: 'message',
                messageId: uuidv7(),
                contextId,
                role: 'agent',
                referenceTaskIds: [workflowResult.taskId],
                parts,
                metadata: {
                  referencedWorkflow: workflowResult.metadata,
                },
              },
            },
            final: false,
          };

          this.logger.debug('Emitting workflow reference', {
            parentTaskId: taskId,
            childTaskId: workflowResult.taskId,
            partsCount: parts.length,
          });

          eventBus.publish(statusUpdate);
        }
      }

      // Clean up tracking for this tool call
      state.toolCallArtifacts.delete(toolCallIndex);
      state.toolCalls.pop();
    }
  }

  private handleReasoningDelta(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
  ): void {
    const reasoningEvent = streamEvent as unknown as {
      type: 'reasoning-delta';
      delta?: string;
      text?: string;
    };
    const reasoningText = reasoningEvent.delta || reasoningEvent.text || '';

    this.logger.debug('stream:reasoning-delta', {
      len: reasoningText.length,
      reasoningChunkIndex: state.reasoningChunkIndex,
    });

    // Accumulate reasoning for CoreMessage
    state.accumulatedReasoning += reasoningText;

    // Ring-buffer approach for reasoning
    if (state.bufferedReasoningArtifact) {
      eventBus.publish(state.bufferedReasoningArtifact);
    }

    state.bufferedReasoningArtifact = artifactManager.createStreamingArtifact(
      taskId,
      contextId,
      'reasoning',
      reasoningText,
      state.reasoningChunkIndex,
      false,
    );
    state.reasoningChunkIndex++;
  }

  private handleReasoningEnd(eventBus: ExecutionEventBus, state: StreamProcessingState): void {
    this.logger.debug('stream:reasoning-end - flushing reasoning buffer with lastChunk');
    if (state.bufferedReasoningArtifact) {
      state.bufferedReasoningArtifact.lastChunk = true;
      eventBus.publish(state.bufferedReasoningArtifact);
      state.bufferedReasoningArtifact = null;
    }
  }

  private handleTextEnd(eventBus: ExecutionEventBus, state: StreamProcessingState): void {
    this.logger.debug('stream:text-end - flushing buffer with lastChunk');
    if (state.bufferedArtifact) {
      state.bufferedArtifact.lastChunk = true;
      eventBus.publish(state.bufferedArtifact);
      state.bufferedArtifact = null;
    }
  }

  private handleToolInputEnd(state: StreamProcessingState): void {
    this.logger.debug('stream:tool-input-end', {
      'tool-input-delta-count': state.deltaCounters['tool-input-delta'],
    });
    state.deltaCounters['tool-input-delta'] = 0;
  }

  private handleOtherEvent(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    state: StreamProcessingState,
  ): void {
    const eventType = (streamEvent as { type?: string }).type;

    // Check if this is a delta event we only count
    if (eventType && Object.prototype.hasOwnProperty.call(state.deltaCounters, eventType)) {
      state.deltaCounters[eventType] = (state.deltaCounters[eventType] ?? 0) + 1;
    } else {
      this.logger.debug('stream:other', {
        type: eventType,
        streamEvent: streamEvent,
      });
    }
  }
}
