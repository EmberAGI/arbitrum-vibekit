/**
 * Message Operations Module
 *
 * Handles message CRUD operations for sessions
 */

import React from 'react';
import { SessionState, SessionMessage } from '@/lib/types/session';

export interface MessageOperations {
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
}

export function createMessageOperations(
  state: SessionState,
  setState: React.Dispatch<React.SetStateAction<SessionState>>,
): MessageOperations {
  const addMessageToSession = (
    sessionId: string,
    message: Omit<SessionMessage, 'id' | 'timestamp'>,
  ): string => {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) {
        console.warn('[MessageOperations] Cannot add message to non-existent session:', sessionId);
        return prev;
      }

      const newMessage: SessionMessage = {
        ...message,
        id: messageId,
        timestamp: new Date(),
      };

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            messages: [...session.messages, newMessage],
            updatedAt: new Date(),
            lastActivityAt: new Date(),
          },
        },
      };
    });

    return messageId;
  };

  const updateMessageInSession = (
    sessionId: string,
    messageId: string,
    updates: Partial<SessionMessage>,
  ) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) return prev;

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            messages: session.messages.map((msg) => {
              if (msg.id !== messageId) return msg;

              // Preserve delegation artifacts UNLESS we're receiving new delegation artifacts
              // (which means we're reconnecting and should replace, not merge)
              const existingArtifacts = msg.artifacts || {};
              const hasDelegations =
                existingArtifacts['delegations-display'] || existingArtifacts['delegations-data'];

              const receivingDelegations =
                updates.artifacts?.['delegations-display'] ||
                updates.artifacts?.['delegations-data'];

              let mergedArtifacts = {
                ...existingArtifacts,
                ...updates.artifacts,
              };

              // If we're receiving delegation artifacts during reconnect, replace them (don't merge)
              // This prevents duplicates when reconnecting to a session with existing delegation artifacts
              if (receivingDelegations) {
                // Keep existing non-delegation artifacts, but replace delegation artifacts
                mergedArtifacts = {
                  ...Object.fromEntries(
                    Object.entries(existingArtifacts).filter(
                      ([key]) => key !== 'delegations-display' && key !== 'delegations-data',
                    ),
                  ),
                  ...updates.artifacts,
                };
              } else if (
                hasDelegations &&
                updates.artifacts &&
                !updates.artifacts['delegations-display'] &&
                !updates.artifacts['delegations-data']
              ) {
                // If we had delegations before and they're being removed, preserve them
                mergedArtifacts = {
                  ...updates.artifacts,
                  'delegations-display': existingArtifacts['delegations-display'],
                  'delegations-data': existingArtifacts['delegations-data'],
                };
              }

              return {
                ...msg,
                ...updates,
                artifacts:
                  Object.keys(mergedArtifacts).length > 0 ? mergedArtifacts : msg.artifacts,
              };
            }),
            updatedAt: new Date(),
          },
        },
      };
    });
  };

  const clearSessionMessages = (sessionId: string) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) {
        console.warn(
          '[MessageOperations] Cannot clear messages from non-existent session:',
          sessionId,
        );
        return prev;
      }

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            messages: [],
            updatedAt: new Date(),
          },
        },
      };
    });
  };

  const removeDelegationMessages = (sessionId: string) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) {
        console.warn(
          '[MessageOperations] Cannot remove delegation messages from non-existent session:',
          sessionId,
        );
        return prev;
      }

      const filteredMessages = session.messages.filter(
        (msg) => !(msg.artifacts?.['delegations-display'] || msg.artifacts?.['delegations-data']),
      );

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            messages: filteredMessages,
            updatedAt: new Date(),
          },
        },
      };
    });
  };

  return {
    addMessageToSession,
    updateMessageInSession,
    clearSessionMessages,
    removeDelegationMessages,
  };
}
