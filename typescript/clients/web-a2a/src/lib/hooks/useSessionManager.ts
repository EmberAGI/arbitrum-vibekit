/**
 * Session Manager Hook
 *
 * Orchestrates multiple concurrent sessions (conversations and tool executions)
 * with persistence, context separation, and seamless switching
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Session,
  SessionState,
  SessionStatus,
  SessionMessage,
  CreateSessionOptions,
  generateSessionId,
  TaskState,
} from '@/lib/types/session';
import { saveSessions, loadSessions } from '@/lib/sessionStorage';
import { createSessionOperations } from './sessionOperations';
import { createMessageOperations } from './messageOperations';
import { createTaskOperations } from './taskOperations';

interface UseSessionManagerReturn {
  // Session management
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  activeSession: Session | null;
  sessionOrder: string[];

  // Actions
  createSession: (options: CreateSessionOptions) => string;
  switchSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  updateSessionStatus: (sessionId: string, status: SessionStatus, force?: boolean) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;

  // Message management
  addMessageToSession: (
    sessionId: string,
    message: Omit<SessionMessage, 'id' | 'timestamp'>,
  ) => string;
  updateMessageInSession: (
    sessionId: string,
    messageId: string,
    updates: Partial<SessionMessage>,
  ) => void;
  clearSessionMessages: (sessionId: string) => void;
  removeDelegationMessages: (sessionId: string) => void;

  // Context management
  setSessionContextId: (sessionId: string, contextId: string) => void;
  getSessionContextId: (sessionId: string) => string | null;
  setSessionAgentEndpoint: (sessionId: string, agentEndpoint: string) => void;

  // Task management
  addTask: (sessionId: string, taskId: string, state?: TaskState) => void;
  updateTaskState: (sessionId: string, taskId: string, state: TaskState, error?: string) => void;
  getLatestIncompleteTaskId: (sessionId: string) => string | null;

  // Tool execution helpers
  createToolExecutionSession: (
    toolName: string,
    taskId: string,
    parentSessionId?: string,
    metadata?: any,
  ) => string;
}

const INITIAL_STATE: SessionState = {
  sessions: {},
  activeSessionId: null,
  sessionOrder: [],
};

export function useSessionManager(): UseSessionManagerReturn {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const isInitializedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    if (isInitializedRef.current) return;

    console.log('[SessionManager] Initializing...');
    const loadedState = loadSessions();

    if (loadedState && Object.keys(loadedState.sessions).length > 0) {
      console.log(
        '[SessionManager] Restored',
        Object.keys(loadedState.sessions).length,
        'sessions',
      );

      // Ensure at least one session is marked as main chat
      const hasMainChat = Object.values(loadedState.sessions).some((session) => session.isMainChat);

      if (!hasMainChat) {
        // Find the oldest conversation session and mark it as main chat
        const oldestConversation = Object.values(loadedState.sessions)
          .filter((session) => session.type === 'conversation')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

        if (oldestConversation) {
          console.log(
            '[SessionManager] Marking oldest conversation as main chat:',
            oldestConversation.id,
          );
          loadedState.sessions[oldestConversation.id].isMainChat = true;
          loadedState.sessions[oldestConversation.id].title = 'Chat';
        }
      }

      setState(loadedState);
    } else {
      // Create initial conversation session (main chat)
      console.log('[SessionManager] No saved sessions, creating initial conversation');
      const initialSession: Session = {
        id: generateSessionId('conversation'),
        type: 'conversation',
        status: 'idle',
        title: 'Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivityAt: new Date(),
        contextId: null,
        agentEndpoint: null,
        tasks: [],
        messages: [],
        isMinimized: false,
        isMainChat: true,
      };

      setState({
        sessions: { [initialSession.id]: initialSession },
        activeSessionId: initialSession.id,
        sessionOrder: [initialSession.id],
      });
    }

    isInitializedRef.current = true;
  }, []);

  // Auto-save sessions with debouncing
  const scheduleSave = useCallback((newState: SessionState) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveSessions(newState);
      saveTimeoutRef.current = null;
    }, 1000);
  }, []);

  // Save on state change
  useEffect(() => {
    if (isInitializedRef.current) {
      scheduleSave(state);
    }
  }, [state, scheduleSave]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (isInitializedRef.current) {
        saveSessions(state);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create operation modules
  const sessionOps = createSessionOperations(state, setState);
  const messageOps = createMessageOperations(state, setState);
  const taskOps = createTaskOperations(state, setState);

  const createToolExecutionSession = useCallback(
    (toolName: string, taskId: string, parentSessionId?: string, metadata?: any): string => {
      const title = metadata?.workflowName || toolName;

      return sessionOps.createSession({
        type: 'tool-execution',
        title,
        toolMetadata: {
          toolName,
          taskId,
          workflowName: metadata?.workflowName,
          description: metadata?.description || 'Tool execution',
          parentSessionId,
          startedAt: new Date(),
        },
      });
    },
    [sessionOps],
  );

  const activeSession = state.activeSessionId ? state.sessions[state.activeSessionId] : null;

  return {
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    activeSession,
    sessionOrder: state.sessionOrder,
    createSession: sessionOps.createSession,
    switchSession: sessionOps.switchSession,
    closeSession: sessionOps.closeSession,
    updateSessionStatus: sessionOps.updateSessionStatus,
    updateSessionTitle: sessionOps.updateSessionTitle,
    addMessageToSession: messageOps.addMessageToSession,
    updateMessageInSession: messageOps.updateMessageInSession,
    clearSessionMessages: messageOps.clearSessionMessages,
    removeDelegationMessages: messageOps.removeDelegationMessages,
    setSessionContextId: sessionOps.setSessionContextId,
    getSessionContextId: sessionOps.getSessionContextId,
    setSessionAgentEndpoint: sessionOps.setSessionAgentEndpoint,
    addTask: taskOps.addTask,
    updateTaskState: taskOps.updateTaskState,
    getLatestIncompleteTaskId: taskOps.getLatestIncompleteTaskId,
    createToolExecutionSession,
  };
}
