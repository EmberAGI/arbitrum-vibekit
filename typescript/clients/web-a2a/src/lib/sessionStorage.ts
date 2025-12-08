/**
 * Session Storage - LocalStorage persistence layer
 *
 * Handles saving and loading sessions to/from localStorage with proper serialization
 */

import { Session, SessionState } from './types/session';

const STORAGE_KEY = 'ember-sessions';
const MAX_SESSIONS = 50; // Limit stored sessions to prevent storage overflow

/**
 * Serialize dates and other non-JSON types for storage
 */
function serializeSession(session: Session): any {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    messages: session.messages.map((msg) => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
    })),
    toolMetadata: session.toolMetadata
      ? {
          ...session.toolMetadata,
          startedAt: session.toolMetadata.startedAt.toISOString(),
          completedAt: session.toolMetadata.completedAt?.toISOString(),
        }
      : undefined,
  };
}

/**
 * Deserialize dates and other non-JSON types from storage
 */
function deserializeSession(data: any): Session {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    lastActivityAt: new Date(data.lastActivityAt),
    messages: data.messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    })),
    toolMetadata: data.toolMetadata
      ? {
          ...data.toolMetadata,
          startedAt: new Date(data.toolMetadata.startedAt),
          completedAt: data.toolMetadata.completedAt
            ? new Date(data.toolMetadata.completedAt)
            : undefined,
        }
      : undefined,
  };
}

/**
 * Save sessions to localStorage
 */
export function saveSessions(state: SessionState): void {
  try {
    // Filter out temporary sessions (e.g., child workflow tabs)
    const persistentSessionIds = state.sessionOrder.filter(
      (id) => !state.sessions[id]?.isTemporary,
    );

    // Limit number of sessions stored
    const sessionIds = persistentSessionIds.slice(-MAX_SESSIONS);
    const sessionsToStore: Record<string, any> = {};

    sessionIds.forEach((id) => {
      if (state.sessions[id]) {
        sessionsToStore[id] = serializeSession(state.sessions[id]);
      }
    });

    const dataToStore = {
      sessions: sessionsToStore,
      activeSessionId: state.activeSessionId,
      sessionOrder: sessionIds,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    console.log(
      '[SessionStorage] Saved sessions:',
      sessionIds.length,
      '(excluded',
      persistentSessionIds.length -
        sessionIds.length +
        state.sessionOrder.length -
        persistentSessionIds.length,
      'temporary)',
    );
  } catch (error) {
    console.error('[SessionStorage] Failed to save sessions:', error);
    // If quota exceeded, try clearing old sessions
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      try {
        clearOldSessions();
      } catch (clearError) {
        console.error('[SessionStorage] Failed to clear old sessions:', clearError);
      }
    }
  }
}

/**
 * Load sessions from localStorage
 */
export function loadSessions(): SessionState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const data = JSON.parse(stored);
    const sessions: Record<string, Session> = {};

    Object.entries(data.sessions).forEach(([id, sessionData]) => {
      try {
        sessions[id] = deserializeSession(sessionData);
      } catch (error) {
        console.error(`[SessionStorage] Failed to deserialize session ${id}:`, error);
      }
    });

    console.log('[SessionStorage] Loaded sessions:', Object.keys(sessions).length);

    return {
      sessions,
      activeSessionId: data.activeSessionId,
      sessionOrder: data.sessionOrder || Object.keys(sessions),
    };
  } catch (error) {
    console.error('[SessionStorage] Failed to load sessions:', error);
    return null;
  }
}

/**
 * Clear all stored sessions
 */
export function clearSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[SessionStorage] Cleared all sessions');
  } catch (error) {
    console.error('[SessionStorage] Failed to clear sessions:', error);
  }
}

/**
 * Clear old sessions to free up space
 */
function clearOldSessions(): void {
  const state = loadSessions();
  if (!state) return;

  // Keep only the 20 most recent sessions
  const recentSessionIds = state.sessionOrder.slice(-20);
  const sessions: Record<string, Session> = {};

  recentSessionIds.forEach((id) => {
    if (state.sessions[id]) {
      sessions[id] = state.sessions[id];
    }
  });

  saveSessions({
    sessions,
    activeSessionId: state.activeSessionId,
    sessionOrder: recentSessionIds,
  });
}

/**
 * Save a single session (optimized for frequent updates)
 */
export function saveSession(session: Session): void {
  try {
    const state = loadSessions();
    if (state) {
      state.sessions[session.id] = session;
      if (!state.sessionOrder.includes(session.id)) {
        state.sessionOrder.push(session.id);
      }
      saveSessions(state);
    }
  } catch (error) {
    console.error('[SessionStorage] Failed to save single session:', error);
  }
}

/**
 * Delete a specific session
 */
export function deleteSession(sessionId: string): void {
  try {
    const state = loadSessions();
    if (state) {
      delete state.sessions[sessionId];
      state.sessionOrder = state.sessionOrder.filter((id) => id !== sessionId);
      if (state.activeSessionId === sessionId) {
        state.activeSessionId = state.sessionOrder[state.sessionOrder.length - 1] || null;
      }
      saveSessions(state);
    }
  } catch (error) {
    console.error('[SessionStorage] Failed to delete session:', error);
  }
}
