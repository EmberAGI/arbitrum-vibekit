import type { ModelMessage } from 'ai';

import type { ContextManager } from '../../../src/a2a/sessions/manager.js';
import type { Context } from '../../../src/a2a/sessions/types.js';

/**
 * Mock ContextManager for testing
 */
export class MockContextManager implements Partial<ContextManager> {
  private contexts = new Map<string, Context>();
  private histories = new Map<string, ModelMessage[]>();

  createContextWithId(contextId: string): Context {
    if (!this.contexts.has(contextId)) {
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
      this.histories.set(contextId, []);
    }
    return this.contexts.get(contextId)!;
  }

  getOrCreateContext(contextId?: string): Context {
    const id = contextId || `ctx-${Date.now()}`;
    return this.createContextWithId(id);
  }

  getContext(contextId: string): Context | null {
    return this.contexts.get(contextId) || null;
  }

  // Provide createContext to align with real interface
  createContext(contextId?: string): Context {
    const id = contextId || `ctx-${Date.now()}`;
    return this.createContextWithId(id);
  }

  addToHistory(contextId: string, message: ModelMessage): void {
    const history = this.histories.get(contextId) || [];
    history.push(message);
    this.histories.set(contextId, history);

    // Also update context state
    const context = this.contexts.get(contextId);
    if (context) {
      context.state.conversationHistory = history;
    }
  }

  getHistory(contextId: string): ModelMessage[] {
    return this.histories.get(contextId) || [];
  }

  // Align with real interface: update context state
  updateContextState(contextId: string, updates: Partial<Context['state']>): void {
    const context = this.contexts.get(contextId) || this.createContextWithId(contextId);
    if (updates.tasks) {
      context.state.tasks = [...updates.tasks];
    }
    if (updates.metadata) {
      context.state.metadata = { ...context.state.metadata, ...updates.metadata };
    }
    if (updates.conversationHistory) {
      context.state.conversationHistory = [...updates.conversationHistory];
      this.histories.set(contextId, [...updates.conversationHistory]);
    }
    context.lastActivity = new Date();
    this.contexts.set(contextId, context);
  }

  // Align with real interface: add a task to the context
  addTask(contextId: string, taskId: string): void {
    const context = this.contexts.get(contextId) || this.createContextWithId(contextId);
    if (!context.state.tasks.includes(taskId)) {
      context.state.tasks.push(taskId);
    }
    context.lastActivity = new Date();
    this.contexts.set(contextId, context);
  }

  listContexts(): Context[] {
    return Array.from(this.contexts.values());
  }

  getMetadata(contextId: string): Record<string, unknown> {
    const context = this.contexts.get(contextId);
    return context ? context.state.metadata : {};
  }

  isContextActive(contextId: string): boolean {
    return this.contexts.has(contextId);
  }

  updateActivity(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.lastActivity = new Date();
    }
  }

  setLastActivity(contextId: string, timestamp: Date): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.lastActivity = timestamp;
    }
  }

  saveContext(_contextId: string): void {
    // No-op for mock
  }

  loadContext(contextId: string): Context | null {
    return this.getContext(contextId);
  }

  deleteContext(contextId: string): void {
    this.contexts.delete(contextId);
    this.histories.delete(contextId);
  }

  on(): this {
    return this;
  }

  emit(): boolean {
    return true;
  }

  getTasks(contextId: string): string[] {
    const context = this.contexts.get(contextId);
    if (!context) {
      return [];
    }
    return context.state.tasks;
  }

  // Helper for tests to inspect state
  getAllContexts(): Map<string, Context> {
    return this.contexts;
  }

  reset(): void {
    this.contexts.clear();
    this.histories.clear();
  }

  cleanupInactiveContexts(_maxInactivityMinutes: number): void {
    // No-op for mock
  }
}
