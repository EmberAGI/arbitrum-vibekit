import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Context, ContextManager as IContextManager } from './types.js';

// Context management is handled at the application level, not by A2A SDK.
// A2A SDK manages tasks and contextId, but context persistence is our responsibility.

/**
 * Unit tests for Context Manager behavior
 * Tests observable outcomes of context management, not internal implementation
 * Following TDD principles: testing WHAT the system does, not HOW
 */
describe('Context Manager', () => {
  let contextManager: IContextManager;

  beforeEach(async () => {
    const { ContextManager } = await import('./manager.js');
    contextManager = new ContextManager() as IContextManager;
  });

  describe('context creation behavior', () => {
    it('should create new context with unique identifier', () => {
      // Given a request to create a new context
      // When creating context without specific ID
      const context = contextManager.createContext();

      // Then context should be created with unique ID
      expect(context).toBeDefined();
      expect(context.contextId).toBeDefined();
      expect(typeof context.contextId).toBe('string');
    });

    it('should generate server-side contextId when none provided per A2A spec', () => {
      // Given no specific context ID is provided
      // When creating context without contextId
      const context = contextManager.createContext();

      // Then context should be created with server-generated ID
      expect(context.contextId).toBeDefined();
      expect(typeof context.contextId).toBe('string');
      expect(context.contextId).toMatch(/^[a-zA-Z0-9-_]+$/); // Valid ID format
    });

    it('should allow reattachment to existing session with contextId', () => {
      // Given a context already exists (server-generated ID)
      const firstContext = contextManager.createContext();
      const contextId = firstContext.contextId;

      // Add some state to the session
      contextManager.addTask(contextId, 'task-1');
      contextManager.updateContextState(contextId, {
        metadata: { user: 'test-user' },
      });

      // When trying to create/reattach with same contextId
      const reattachedContext = contextManager.createContext(contextId);

      // Then it should return the same session (reattachment)
      expect(reattachedContext.contextId).toBe(contextId);
      expect(reattachedContext.state.tasks).toContain('task-1');
      expect(reattachedContext.state.metadata.user).toBe('test-user');

      // And activity should be updated
      expect(reattachedContext.lastActivity.getTime()).toBeGreaterThanOrEqual(
        firstContext.lastActivity.getTime(),
      );
    });

    it('should make new context ready for use', () => {
      // When creating a new context
      const context = contextManager.createContext();

      // Then context should be ready to accept tasks and messages
      expect(context).toBeDefined();
      contextManager.addTask(context.contextId, 'test-task');
      const tasks = contextManager.getTasks(context.contextId);
      expect(tasks).toContain('test-task');
    });

    it('should throw error when client provides non-existent contextId', () => {
      // Given a non-existent contextId from client
      const nonExistentId = 'ctx-client-provided-123';

      // When creating session with non-existent contextId
      // Then server should throw error per better API design
      expect(() => contextManager.createContext(nonExistentId)).toThrow('Context not found');

      // And error should include helpful information
      try {
        contextManager.createContext(nonExistentId);
      } catch (error: unknown) {
        const typedError = error as Error & {
          code: number;
          data: { contextId: string; hint: string };
        };
        expect(typedError.code).toBe(-32600);
        expect(typedError.data).toEqual({
          contextId: nonExistentId,
          hint: 'Omit contextId to create new context, or provide valid existing contextId to reattach',
        });
      }
    });

    it('should handle getOrCreateContext for new contexts', () => {
      // Given no existing context
      // When calling getOrCreateContext without contextId
      const context = contextManager.getOrCreateContext();

      // Then a new context should be created
      expect(context).toBeDefined();
      expect(context.contextId).toBeDefined();
      expect(context.state.tasks).toEqual([]);
    });

    it('should handle getOrCreateSession for existing sessions', () => {
      // Given an existing session
      const existingContext = contextManager.createContext();
      const contextId = existingContext.contextId;
      contextManager.addTask(contextId, 'existing-task');

      // When calling getOrCreateSession with existing contextId
      const context = contextManager.getOrCreateContext(contextId);

      // Then the existing session should be returned
      expect(context.contextId).toBe(contextId);
      expect(context.state.tasks).toContain('existing-task');
    });

    it('should throw error when getOrCreateSession called with non-existent contextId', () => {
      // Given a non-existent contextId
      const nonExistentId = 'ctx-nonexistent-999';

      // When calling getOrCreateSession with non-existent contextId
      // Then should throw error for invalid contextId
      expect(() => contextManager.getOrCreateContext(nonExistentId)).toThrow('Context not found');

      // And error should be properly formatted
      try {
        contextManager.getOrCreateContext(nonExistentId);
      } catch (error: unknown) {
        const typedError = error as Error & { code: number; data: { contextId: string } };
        expect(typedError.code).toBe(-32600);
        expect(typedError.data.contextId).toBe(nonExistentId);
      }
    });
  });

  describe('session access behavior', () => {
    it('should provide access to existing session', () => {
      // Given a created session
      const created = contextManager.createContext();

      // When retrieving session
      const retrieved = contextManager.getContext(created.contextId);

      // Then session should be retrieved
      expect(retrieved).toBeDefined();
      expect(retrieved.contextId).toBe(created.contextId);
    });

    it('should return null for non-existent context', () => {
      // When retrieving non-existent context
      const context = contextManager.getContext('ctx-nonexistent');

      // Then null should be returned
      expect(context).toBeNull();
    });

    it('should list available contexts', () => {
      // Given multiple active contexts exist
      const context1 = contextManager.createContext();
      const context2 = contextManager.createContext();
      const context3 = contextManager.createContext();

      // When listing contexts
      const contexts = contextManager.listContexts();

      // Then all contexts should be available
      expect(contexts.length).toBeGreaterThanOrEqual(3);
      const contextIds = contexts.map((s: Context) => s.contextId);
      expect(contextIds).toContain(context1.contextId);
      expect(contextIds).toContain(context2.contextId);
      expect(contextIds).toContain(context3.contextId);
    });
  });

  describe('session operations', () => {
    it('should update session metadata', () => {
      // Given a session
      const context = contextManager.createContext();

      // When updating session state
      contextManager.updateContextState(context.contextId, {
        metadata: { user: 'test-user' },
      });

      // Then metadata should be accessible
      const metadata = contextManager.getMetadata(context.contextId);
      expect(metadata.user).toBe('test-user');
    });

    it('should track conversation history', () => {
      // Given a session
      const context = contextManager.createContext();

      // When adding to conversation history
      contextManager.addToHistory(context.contextId, {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      });
      contextManager.addToHistory(context.contextId, {
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date(),
      });

      // Then conversation should be preserved
      const history = contextManager.getHistory(context.contextId);
      expect(history.length).toBe(2);
      expect(history[0].content).toBe('Hello');
      expect(history[1].content).toBe('Hi there!');
    });

    it('should associate tasks with session', () => {
      // Given a session
      const context = contextManager.createContext();

      // When adding tasks to session
      contextManager.addTask(context.contextId, 'task-1');
      contextManager.addTask(context.contextId, 'task-2');

      // Then tasks should be accessible for the session
      const tasks = contextManager.getTasks(context.contextId);
      expect(tasks).toContain('task-1');
      expect(tasks).toContain('task-2');
    });

    it('should update last activity timestamp', async () => {
      // Given a session
      const context = contextManager.createContext();
      const _initialActivity = context.lastActivity;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // When updating activity
      contextManager.updateActivity(context.contextId);

      // Then activity should be recorded
      const isActive = contextManager.isContextActive(context.contextId);
      expect(isActive).toBe(true);
    });
  });

  describe('session isolation behavior', () => {
    it('should isolate tasks between different user sessions', () => {
      // Given two separate user sessions
      const context1 = contextManager.createContext();
      const context2 = contextManager.createContext();
      const userContext1 = context1.contextId;
      const userContext2 = context2.contextId;

      // When user 1 creates tasks
      contextManager.addTask(userContext1, 'user1-task-1');
      contextManager.addTask(userContext1, 'user1-task-2');

      // And user 2 creates different tasks
      contextManager.addTask(userContext2, 'user2-task-1');

      // Then each user can only access their own tasks
      const user1Tasks = contextManager.getTasks(userContext1);
      const user2Tasks = contextManager.getTasks(userContext2);

      // User 1 sees only their tasks
      expect(user1Tasks).toContain('user1-task-1');
      expect(user1Tasks).toContain('user1-task-2');
      expect(user1Tasks).not.toContain('user2-task-1');

      // User 2 sees only their tasks
      expect(user2Tasks).toContain('user2-task-1');
      expect(user2Tasks).not.toContain('user1-task-1');
      expect(user2Tasks).not.toContain('user1-task-2');
    });

    it('should isolate state between sessions', () => {
      // Given two sessions
      const context1 = contextManager.createContext();
      const context2 = contextManager.createContext();

      // When modifying each session's state
      contextManager.updateContextState(context1.contextId, {
        metadata: { value: 'session1' },
      });
      contextManager.updateContextState(context2.contextId, {
        metadata: { value: 'session2' },
      });

      // Then states should be isolated
      const updated1 = contextManager.getContext(context1.contextId);
      const updated2 = contextManager.getContext(context2.contextId);

      expect(updated1?.state.metadata.value).toBe('session1');
      expect(updated2?.state.metadata.value).toBe('session2');
    });

    it('should isolate tasks between sessions', () => {
      // Given two sessions with tasks
      const context1 = contextManager.createContext();
      const context2 = contextManager.createContext();

      contextManager.addTask(context1.contextId, 'task-a');
      contextManager.addTask(context1.contextId, 'task-b');
      contextManager.addTask(context2.contextId, 'task-c');

      // Then tasks should be isolated
      const updated1 = contextManager.getContext(context1.contextId);
      const updated2 = contextManager.getContext(context2.contextId);

      expect(updated1?.state.tasks).toEqual(['task-a', 'task-b']);
      expect(updated2?.state.tasks).toEqual(['task-c']);
    });

    it('should isolate conversation history', () => {
      // Given two sessions with conversations
      const context1 = contextManager.createContext();
      const context2 = contextManager.createContext();

      contextManager.addToHistory(context1.contextId, {
        role: 'user',
        content: 'Message in session 1',
        timestamp: new Date(),
      });
      contextManager.addToHistory(context2.contextId, {
        role: 'user',
        content: 'Message in session 2',
        timestamp: new Date(),
      });

      // Then conversations should be isolated
      const updated1 = contextManager.getContext(context1.contextId);
      const updated2 = contextManager.getContext(context2.contextId);

      expect(updated1?.state.conversationHistory[0]?.content).toBe('Message in session 1');
      expect(updated2?.state.conversationHistory[0]?.content).toBe('Message in session 2');
    });
  });

  describe('session persistence and reattachment', () => {
    it('should support session persistence within agent uptime', () => {
      // Given a session with activity (per PRD line 21)
      const context = contextManager.createContext();
      const contextId = context.contextId;

      // When adding state and tasks
      contextManager.updateContextState(contextId, {
        metadata: { workflow: 'gmx-trading' },
      });
      contextManager.addTask(contextId, 'task-persist-1');
      contextManager.addToHistory(contextId, {
        role: 'user',
        content: 'Open position',
        timestamp: new Date(),
      });

      // Then session should be reattachable within agent uptime
      const reattached = contextManager.getContext(contextId);
      expect(reattached).toBeDefined();
      expect(reattached?.state.metadata.workflow).toBe('gmx-trading');
      expect(reattached?.state.tasks).toContain('task-persist-1');
      expect(reattached?.state.conversationHistory.length).toBe(1);
    });

    it('should allow reattachment to existing context by contextId', () => {
      // Given an existing context
      const originalContext = contextManager.createContext();
      const contextId = originalContext.contextId;
      contextManager.addTask(contextId, 'original-task');

      // When client reattaches with same contextId
      const reattached = contextManager.createContext(contextId);

      // Then existing session state should be accessible (reattachment per A2A)
      expect(reattached).toBeDefined();
      expect(reattached.contextId).toBe(contextId);
      expect(reattached.state.tasks).toContain('original-task');

      // And new activity should update the session
      contextManager.addTask(contextId, 'new-task');
      const updated = contextManager.getContext(contextId);
      expect(updated?.state.tasks).toContain('original-task');
      expect(updated?.state.tasks).toContain('new-task');
    });

    it('should persist session data', () => {
      // Given a session with data
      const context = contextManager.createContext();
      contextManager.updateContextState(context.contextId, {
        metadata: { important: 'data' },
      });
      contextManager.addToHistory(context.contextId, {
        role: 'user',
        content: 'Important message',
        timestamp: new Date(),
      });

      // When saving session
      contextManager.saveContext(context.contextId);

      // Then session should be persisted
      const loaded = contextManager.loadContext(context.contextId);
      expect(loaded).toBeDefined();
      expect(loaded?.state.metadata.important).toBe('data');
      expect(loaded?.state.conversationHistory[0]?.content).toBe('Important message');
    });

    it('should handle context not found on load', () => {
      // When loading non-existent context
      const context = contextManager.loadContext('ctx-notfound');

      // Then null should be returned
      expect(context).toBeNull();
    });
  });

  describe('session cleanup', () => {
    it.skip('should not automatically cleanup sessions per A2A requirements', () => {
      // Given an old inactive session
      const oldContext = contextManager.createContext();

      // Simulate old last activity
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      contextManager.setLastActivity(oldContext.contextId, oldTime);

      // When running cleanup
      contextManager.cleanupInactiveContexts(60); // 60 minute timeout

      // Then old session should be removed
      const retrieved = contextManager.getContext(oldContext.contextId);
      expect(retrieved).toBeNull();
    });

    it('should keep active contexts during cleanup', () => {
      // Given an active context
      const activeContext = contextManager.createContext();

      // When running cleanup
      contextManager.cleanupInactiveContexts(60);

      // Then active context should remain
      const retrieved = contextManager.getContext(activeContext.contextId);
      expect(retrieved).toBeDefined();
    });

    it('should cleanup session resources', () => {
      // Given a session with resources
      const context = contextManager.createContext();
      contextManager.addTask(context.contextId, 'task-1');
      contextManager.addTask(context.contextId, 'task-2');

      // When deleting session
      contextManager.deleteContext(context.contextId);

      // Then session and resources should be cleaned
      const retrieved = contextManager.getContext(context.contextId);
      expect(retrieved).toBeNull();
    });
  });

  describe('session events', () => {
    it('should emit context created event', () => {
      // Given event listener
      const listener = vi.fn();
      contextManager.on('contextCreated', listener);

      // When creating context
      const context = contextManager.createContext();

      // Then event should be emitted
      expect(listener).toHaveBeenCalledWith({
        contextId: context.contextId,
        context,
      });
    });

    it('should emit session updated event', () => {
      // Given a session and listener
      const context = contextManager.createContext();
      const listener = vi.fn();
      contextManager.on('contextUpdated', listener);

      // When updating session
      contextManager.updateContextState(context.contextId, {
        metadata: { updated: true },
      });

      // Then event should be emitted
      expect(listener).toHaveBeenCalledWith({
        contextId: context.contextId,
        changes: expect.objectContaining({
          metadata: { updated: true },
        }) as Partial<{ metadata: Record<string, unknown> }>,
      });
    });

    it('should emit session deleted event', () => {
      // Given a session and listener
      const context = contextManager.createContext();
      const listener = vi.fn();
      contextManager.on('contextDeleted', listener);

      // When deleting session
      contextManager.deleteContext(context.contextId);

      // Then event should be emitted
      expect(listener).toHaveBeenCalledWith({
        contextId: context.contextId,
      });
    });
  });

  describe('task de-duplication', () => {
    it('should not add duplicate tasks to context', () => {
      // Given a context with a task
      const context = contextManager.createContext();
      contextManager.addTask(context.contextId, 'task-1');

      // When adding the same task again
      contextManager.addTask(context.contextId, 'task-1');

      // Then task list should contain only one instance
      const tasks = contextManager.getTasks(context.contextId);
      expect(tasks).toEqual(['task-1']);
      expect(tasks.length).toBe(1);
    });

    it('should allow different tasks to be added', () => {
      // Given a context
      const context = contextManager.createContext();

      // When adding multiple different tasks
      contextManager.addTask(context.contextId, 'task-1');
      contextManager.addTask(context.contextId, 'task-2');
      contextManager.addTask(context.contextId, 'task-3');

      // Then all tasks should be present
      const tasks = contextManager.getTasks(context.contextId);
      expect(tasks).toEqual(['task-1', 'task-2', 'task-3']);
    });
  });

  describe('metadata merge behavior', () => {
    it('should merge metadata non-destructively', () => {
      // Given a context with existing metadata
      const context = contextManager.createContext();
      contextManager.updateContextState(context.contextId, {
        metadata: { key1: 'value1', key2: 'value2' },
      });

      // When updating with partial metadata
      contextManager.updateContextState(context.contextId, {
        metadata: { key2: 'updated', key3: 'value3' },
      });

      // Then metadata should be merged without losing key1
      const metadata = contextManager.getMetadata(context.contextId);
      expect(metadata).toEqual({
        key1: 'value1',
        key2: 'updated',
        key3: 'value3',
      });
    });

    it('should allow metadata to be extended incrementally', () => {
      // Given a context
      const context = contextManager.createContext();

      // When updating metadata in multiple steps
      contextManager.updateContextState(context.contextId, {
        metadata: { workflow: 'swap' },
      });
      contextManager.updateContextState(context.contextId, {
        metadata: { chain: 'arbitrum' },
      });
      contextManager.updateContextState(context.contextId, {
        metadata: { protocol: 'uniswap' },
      });

      // Then all metadata should be present
      const metadata = contextManager.getMetadata(context.contextId);
      expect(metadata).toEqual({
        workflow: 'swap',
        chain: 'arbitrum',
        protocol: 'uniswap',
      });
    });
  });

  describe('conversation history replacement', () => {
    it('should replace entire conversation history when updated', () => {
      // Given a context with existing conversation history
      const context = contextManager.createContext();
      contextManager.addToHistory(context.contextId, {
        role: 'user',
        content: 'First message',
        timestamp: new Date(),
      });
      contextManager.addToHistory(context.contextId, {
        role: 'assistant',
        content: 'First response',
        timestamp: new Date(),
      });

      // When updating conversation history via updateContextState
      const newHistory = [
        {
          role: 'user' as const,
          content: 'Replaced message',
        },
      ];

      contextManager.updateContextState(context.contextId, {
        conversationHistory: newHistory,
      });

      // Then history should be completely replaced
      const history = contextManager.getHistory(context.contextId);
      expect(history).toEqual(newHistory);
      expect(history.length).toBe(1);
    });

    it('should allow clearing conversation history', () => {
      // Given a context with conversation history
      const context = contextManager.createContext();
      contextManager.addToHistory(context.contextId, {
        role: 'user',
        content: 'Message',
        timestamp: new Date(),
      });

      // When updating with empty history array
      contextManager.updateContextState(context.contextId, {
        conversationHistory: [],
      });

      // Then history should be empty
      const history = contextManager.getHistory(context.contextId);
      expect(history).toEqual([]);
    });
  });

  describe('persistence date restoration', () => {
    it('should restore Date objects after loading from persistence', () => {
      // Given a context with specific timestamps
      const context = contextManager.createContext();
      const createdAt = context.createdAt;
      const lastActivity = context.lastActivity;

      // When saving and loading context
      contextManager.saveContext(context.contextId);
      const loaded = contextManager.loadContext(context.contextId);

      // Then Date objects should be restored (not strings)
      expect(loaded).toBeDefined();
      expect(loaded?.createdAt).toBeInstanceOf(Date);
      expect(loaded?.lastActivity).toBeInstanceOf(Date);

      // And timestamps should match original
      expect(loaded?.createdAt.getTime()).toBe(createdAt.getTime());
      expect(loaded?.lastActivity.getTime()).toBe(lastActivity.getTime());
    });

    it('should preserve conversation history structure after persistence roundtrip', () => {
      // Given a context with conversation history
      const context = contextManager.createContext();
      contextManager.addToHistory(context.contextId, {
        role: 'user',
        content: 'Test message',
      });
      contextManager.addToHistory(context.contextId, {
        role: 'assistant',
        content: [{ type: 'text', text: 'Test response' }],
      });

      // When saving and loading
      contextManager.saveContext(context.contextId);
      const loaded = contextManager.loadContext(context.contextId);

      // Then conversation history should be preserved exactly
      expect(loaded?.state.conversationHistory).toHaveLength(2);
      expect(loaded?.state.conversationHistory[0]).toMatchObject({
        role: 'user',
        content: 'Test message',
      });
      expect(loaded?.state.conversationHistory[1]).toMatchObject({
        role: 'assistant',
        content: [{ type: 'text', text: 'Test response' }],
      });
    });
  });
});
