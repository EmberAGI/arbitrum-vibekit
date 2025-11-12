import { EventEmitter } from 'events';

import { A2AError } from '@a2a-js/sdk/server';
import type { ModelMessage } from 'ai';
import { v7 as uuidv7 } from 'uuid';

import type { Context, ContextState } from './types.js';

export class ContextManager extends EventEmitter {
  private contexts: Map<string, Context> = new Map();
  private persistedContexts: Map<string, Context> = new Map();

  constructor() {
    super();
  }

  /**
   * Creates a new context with the specified contextId (no validation)
   * Used when the SDK has already generated/assigned a contextId
   * or when creating contexts on-demand for any contextId
   */
  createContextWithId(contextId: string): Context {
    const context: Context = {
      contextId,
      createdAt: new Date(),
      lastActivity: new Date(),
      state: {
        tasks: [],
        metadata: {},
        conversationHistory: [],
      },
    };

    this.contexts.set(contextId, context);
    this.emit('contextCreated', { contextId, context });
    return context;
  }

  /**
   * Creates a new context or reattaches to an existing one per A2A spec
   * - If no contextId provided: generates server-side contextId (new context)
   * - If contextId provided and exists: returns existing context (reattachment)
   * - If contextId provided but doesn't exist: throws error (proper API design)
   */
  createContext(contextId?: string): Context {
    // Check if this is a reattachment attempt
    if (contextId) {
      if (this.contexts.has(contextId)) {
        // Reattach to existing context
        const existing = this.contexts.get(contextId)!;
        existing.lastActivity = new Date();
        return existing;
      } else {
        // Reject non-existent contextId per better API design
        throw A2AError.invalidRequest('Context not found', {
          contextId,
          hint: 'Omit contextId to create new context, or provide valid existing contextId to reattach',
        });
      }
    }

    // For new contexts, use server-generated ID per A2A spec
    const id = this.generateContextId();
    return this.createContextWithId(id);
  }

  /**
   * Gets a context by contextId
   */
  getContext(contextId: string): Context | null {
    return this.contexts.get(contextId) || null;
  }

  /**
   * Lists all active contexts
   */
  listContexts(): Context[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Updates context state
   */
  updateContextState(contextId: string, updates: Partial<ContextState>): void {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    // Merge updates into state
    if (updates.metadata) {
      context.state.metadata = {
        ...context.state.metadata,
        ...updates.metadata,
      };
    }

    if (updates.tasks) {
      context.state.tasks = updates.tasks;
    }

    if (updates.conversationHistory) {
      context.state.conversationHistory = updates.conversationHistory;
    }

    // Update activity
    context.lastActivity = new Date();

    // Emit update event
    this.emit('contextUpdated', { contextId, changes: updates });
  }

  /**
   * Adds a message to conversation history
   */
  addToHistory(contextId: string, message: ModelMessage): void {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    context.state.conversationHistory.push(message);
    context.lastActivity = new Date();
  }

  /**
   * Adds a task to the context
   */
  addTask(contextId: string, taskId: string): void {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    if (!context.state.tasks.includes(taskId)) {
      context.state.tasks.push(taskId);
    }
    context.lastActivity = new Date();
  }

  /**
   * Gets tasks for a context
   */
  getTasks(contextId: string): string[] {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }
    return context.state.tasks;
  }

  /**
   * Gets metadata for a context
   */
  getMetadata(contextId: string): Record<string, unknown> {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }
    return context.state.metadata;
  }

  /**
   * Gets conversation history for a context
   */
  getHistory(contextId: string): ModelMessage[] {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }
    return context.state.conversationHistory;
  }

  /**
   * Checks if a context is active
   */
  isContextActive(contextId: string): boolean {
    const context = this.contexts.get(contextId);
    if (!context) {
      return false;
    }
    // Consider a context active if it had activity in the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return context.lastActivity > thirtyMinutesAgo;
  }

  /**
   * Updates the last activity timestamp
   */
  updateActivity(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    context.lastActivity = new Date();
  }

  /**
   * Sets the last activity timestamp (for testing)
   */
  setLastActivity(contextId: string, timestamp: Date): void {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    context.lastActivity = timestamp;
  }

  /**
   * Saves a context to persistent storage
   */
  saveContext(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    // Deep clone the context for persistence
    this.persistedContexts.set(contextId, JSON.parse(JSON.stringify(context)) as Context);
  }

  /**
   * Loads a context from persistent storage
   */
  loadContext(contextId: string): Context | null {
    const persisted = this.persistedContexts.get(contextId);
    if (!persisted) {
      return null;
    }

    // Restore date objects
    const context: Context = {
      ...persisted,
      createdAt: new Date(persisted.createdAt),
      lastActivity: new Date(persisted.lastActivity),
      state: {
        ...persisted.state,
        // CoreMessage doesn't need date restoration - it's already in correct format
        conversationHistory: persisted.state.conversationHistory,
      },
    };

    // Add to active contexts
    this.contexts.set(contextId, context);
    return context;
  }

  /**
   * Cleans up inactive contexts
   */
  cleanupInactiveContexts(maxInactivityMinutes: number): void {
    const cutoffTime = Date.now() - maxInactivityMinutes * 60 * 1000;

    for (const [contextId, context] of this.contexts.entries()) {
      if (context.lastActivity.getTime() < cutoffTime) {
        this.contexts.delete(contextId);
      }
    }
  }

  /**
   * Deletes a context
   */
  deleteContext(contextId: string): void {
    this.contexts.delete(contextId);
    this.persistedContexts.delete(contextId);
    this.emit('contextDeleted', { contextId });
  }

  /**
   * Generates a unique context ID
   */
  /**
   * Gets or creates a context
   * This is a convenience method that explicitly handles the A2A context pattern
   */
  getOrCreateContext(contextId?: string): Context {
    // If contextId provided, try to get existing
    if (contextId) {
      const existing = this.getContext(contextId);
      if (existing) {
        existing.lastActivity = new Date();
        return existing;
      } else {
        // Reject non-existent contextId per better API design
        throw A2AError.invalidRequest('Context not found', {
          contextId,
          hint: 'Omit contextId to create new context, or provide valid existing contextId to reattach',
        });
      }
    }

    // Create new context with server-generated ID
    const id = this.generateContextId();
    return this.createContextWithId(id);
  }

  private generateContextId(): string {
    return `ctx-${uuidv7()}`;
  }
}
