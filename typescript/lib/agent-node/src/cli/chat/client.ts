/**
 * Chat Client Module
 * Wraps A2A SDK client for chat interactions
 */

import type { Message, Part } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

import type { ArtifactUpdateEvent, StatusUpdateEvent } from '../../client/index.js';
import { isArtifactUpdateEvent, isStatusUpdateEvent } from '../../client/index.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamEvent {
  kind: 'artifact-update' | 'status-update' | 'unknown';
  data: ArtifactUpdateEvent | StatusUpdateEvent | unknown;
}

export class ChatClient {
  private client: A2AClient;
  private contextId?: string;
  private baseUrl: string;

  private constructor(client: A2AClient, baseUrl: string) {
    this.client = client;
    this.baseUrl = baseUrl;
  }

  /**
   * Create a chat client from an agent URL
   * @param baseUrl - Base URL of the agent (e.g., http://localhost:3000)
   */
  static async fromUrl(baseUrl: string): Promise<ChatClient> {
    // Normalize URL (remove trailing slash)
    const normalizedUrl = baseUrl.replace(/\/$/, '');
    const cardUrl = `${normalizedUrl}/.well-known/agent-card.json`;

    const client = await A2AClient.fromCardUrl(cardUrl);
    return new ChatClient(client, normalizedUrl);
  }

  /**
   * Send a message and get a streaming response
   * @param userMessage - The user's message text
   * @returns AsyncGenerator yielding stream events
   */
  async *sendMessage(userMessage: string): AsyncGenerator<StreamEvent, void, unknown> {
    const message: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'user',
      parts: [{ kind: 'text', text: userMessage }] as Part[],
      ...(this.contextId ? { contextId: this.contextId } : {}),
    };

    const stream = this.client.sendMessageStream({ message });

    for await (const event of stream) {
      // Extract contextId from first event if not already set
      if (!this.contextId && typeof event === 'object' && event !== null && 'contextId' in event) {
        this.contextId = event.contextId as string;
      }

      // Classify and yield event
      if (isArtifactUpdateEvent(event)) {
        yield {
          kind: 'artifact-update',
          data: event,
        };
      } else if (isStatusUpdateEvent(event)) {
        yield {
          kind: 'status-update',
          data: event,
        };
      } else {
        yield {
          kind: 'unknown',
          data: event,
        };
      }
    }
  }

  /**
   * Get the current context ID
   */
  getContextId(): string | undefined {
    return this.contextId;
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Reset the conversation context
   */
  resetContext(): void {
    this.contextId = undefined;
  }
}
