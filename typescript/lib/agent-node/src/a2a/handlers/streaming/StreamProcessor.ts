/**
 * Core stream processing for AI responses
 */

import type { TaskArtifactUpdateEvent } from '@a2a-js/sdk';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool, TextStreamPart, AssistantModelMessage } from 'ai';

import { Logger } from '../../../utils/logger.js';

import { ArtifactManager } from './ArtifactManager.js';
import { StreamEventHandler } from './StreamEventHandler.js';

export interface StreamProcessorOptions {
  taskId: string;
  contextId: string;
  eventBus: ExecutionEventBus;
}

/**
 * Handles the core stream processing logic
 */
export class StreamProcessor {
  private logger: Logger;
  private artifactManager: ArtifactManager;
  private eventHandler: StreamEventHandler;

  constructor() {
    this.logger = Logger.getInstance('StreamProcessor');
    this.artifactManager = new ArtifactManager();
    this.eventHandler = new StreamEventHandler();
  }

  /**
   * Process an AI stream and return the assistant message for history
   */
  async processStream(
    streamIter: AsyncIterable<TextStreamPart<Record<string, Tool>>>,
    options: StreamProcessorOptions,
  ): Promise<AssistantModelMessage | null> {
    const { taskId, contextId, eventBus } = options;

    try {
      // Initialize processing state
      const state = {
        textChunkIndex: 0,
        reasoningChunkIndex: 0,
        bufferedArtifact: null as TaskArtifactUpdateEvent | null,
        bufferedReasoningArtifact: null as TaskArtifactUpdateEvent | null,
        toolCallArtifacts: new Map<number, string>(),
        deltaCounters: { 'tool-input-delta': 0 } as Record<string, number>,
        accumulatedText: '',
        accumulatedReasoning: '',
        toolCalls: [],
      };

      // Process the stream
      for await (const streamEvent of streamIter) {
        this.eventHandler.handleStreamEvent(
          streamEvent,
          taskId,
          contextId,
          eventBus,
          state,
          this.artifactManager,
        );
      }

      this.logger.info('AI stream ended', {
        textChunks: state.textChunkIndex,
        toolCalls: state.toolCalls.length,
      });

      // Flush any remaining buffered artifacts
      this.flushBufferedArtifacts(state, eventBus);

      // Publish completion status
      this.publishCompletionStatus(taskId, contextId, eventBus);

      // Build assistant message for conversation history
      const assistantMessage = this.buildAssistantMessage(state);
      return assistantMessage;
    } catch (error) {
      this.handleStreamError(error, taskId, contextId, eventBus);
      return null;
    } finally {
      eventBus.finished();
    }
  }

  /**
   * Build AssistantModelMessage from stream state for conversation history
   */
  private buildAssistantMessage(state: {
    accumulatedText: string;
    accumulatedReasoning: string;
  }): AssistantModelMessage | null {
    const { accumulatedText, accumulatedReasoning } = state;

    // Only create a message if there's content
    if (!accumulatedText && !accumulatedReasoning) {
      return null;
    }

    // Build content array with reasoning first (required by Anthropic), then text
    const content: Array<{ type: 'text'; text: string }> = [];

    // Add reasoning block if present (thinking blocks must come first for Anthropic)
    if (accumulatedReasoning) {
      content.push({
        type: 'text',
        text: accumulatedReasoning,
      });
    }

    // Add text content if present
    if (accumulatedText) {
      content.push({
        type: 'text',
        text: accumulatedText,
      });
    }

    return {
      role: 'assistant',
      content,
    };
  }

  private flushBufferedArtifacts(
    state: {
      bufferedArtifact: TaskArtifactUpdateEvent | null;
      bufferedReasoningArtifact: TaskArtifactUpdateEvent | null;
    },
    eventBus: ExecutionEventBus,
  ): void {
    if (state.bufferedArtifact) {
      this.logger.debug('Flushing remaining buffered text artifact (no text-end received)');
      state.bufferedArtifact.lastChunk = true;
      eventBus.publish(state.bufferedArtifact);
    }

    if (state.bufferedReasoningArtifact) {
      this.logger.debug(
        'Flushing remaining buffered reasoning artifact (no reasoning-end received)',
      );
      state.bufferedReasoningArtifact.lastChunk = true;
      eventBus.publish(state.bufferedReasoningArtifact);
    }
  }

  private publishCompletionStatus(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
  ): void {
    this.logger.debug('Publishing completed status-update');
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: 'completed',
        timestamp: new Date().toISOString(),
      },
      final: true,
    });
  }

  private handleStreamError(
    error: unknown,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
  ): void {
    this.logger.error('Streaming error', error);
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: 'failed',
        timestamp: new Date().toISOString(),
        message: {
          kind: 'message',
          messageId: crypto.randomUUID(),
          contextId,
          role: 'agent',
          parts: [
            {
              kind: 'text',
              text: `Streaming error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        },
      },
      final: true,
    });
  }
}
