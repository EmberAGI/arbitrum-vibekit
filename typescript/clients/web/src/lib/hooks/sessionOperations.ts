/**
 * Session Operations Module
 * 
 * Handles session CRUD operations
 */

import React from "react";
import { Session, SessionState, CreateSessionOptions, generateSessionId } from "@/lib/types/session";
import { deleteSession as deleteStoredSession } from "@/lib/sessionStorage";

export interface SessionOperations {
  createSession: (options: CreateSessionOptions) => string;
  switchSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  updateSessionStatus: (
    sessionId: string,
    status: Session["status"],
    force?: boolean
  ) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  setSessionContextId: (sessionId: string, contextId: string) => void;
  getSessionContextId: (sessionId: string) => string | null;
  setSessionAgentEndpoint: (sessionId: string, agentEndpoint: string) => void;
}

export function createSessionOperations(
  state: SessionState,
  setState: React.Dispatch<React.SetStateAction<SessionState>>
): SessionOperations {
  const createSession = (options: CreateSessionOptions): string => {
    const sessionId = generateSessionId(options.type);
    const now = new Date();

    const newSession: Session = {
      id: sessionId,
      type: options.type,
      status: "idle",
      title: options.title,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      contextId: options.contextId || null,
      agentEndpoint: options.agentEndpoint || null,
      tasks: [],
      messages: [],
      toolMetadata: options.toolMetadata,
      isMinimized: false,
      isTemporary: options.isTemporary || false,
      isMainChat: options.isMainChat || false,
      parentSessionId: options.parentSessionId,
    };

    const shouldAutoSwitch = !options.parentSessionId && !options.isTemporary;

    setState((prev) => ({
      sessions: {
        ...prev.sessions,
        [sessionId]: newSession,
      },
      activeSessionId: shouldAutoSwitch ? sessionId : prev.activeSessionId,
      sessionOrder: [...prev.sessionOrder, sessionId],
    }));

    return sessionId;
  };

  const switchSession = (sessionId: string) => {
    setState((prev) => {
      if (!prev.sessions[sessionId]) {
        console.warn(
          "[SessionOperations] Cannot switch to non-existent session:",
          sessionId
        );
        return prev;
      }

      return {
        ...prev,
        activeSessionId: sessionId,
      };
    });
  };

  const closeSession = (sessionId: string) => {
    setState((prev) => {
      const newSessions = { ...prev.sessions };
      delete newSessions[sessionId];

      const newSessionOrder = prev.sessionOrder.filter(
        (id) => id !== sessionId
      );
      let newActiveSessionId = prev.activeSessionId;

      if (prev.activeSessionId === sessionId) {
        newActiveSessionId =
          newSessionOrder[newSessionOrder.length - 1] || null;
      }

      if (newSessionOrder.length === 0) {
        const newSession: Session = {
          id: generateSessionId("conversation"),
          type: "conversation",
          status: "idle",
          title: "New Conversation",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActivityAt: new Date(),
          contextId: null,
          agentEndpoint: null,
          tasks: [],
          messages: [],
          isMinimized: false,
        };

        return {
          sessions: { [newSession.id]: newSession },
          activeSessionId: newSession.id,
          sessionOrder: [newSession.id],
        };
      }

      return {
        sessions: newSessions,
        activeSessionId: newActiveSessionId,
        sessionOrder: newSessionOrder,
      };
    });
  };

  const updateSessionStatus = (
    sessionId: string,
    status: Session["status"],
    force: boolean = false
  ) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) {
        console.warn(
          "[SessionOperations] Cannot update status - session not found:",
          sessionId
        );
        return prev;
      }

      if (session.status === "completed" && !force && status !== "error") {
        return prev;
      }

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            status,
            updatedAt: new Date(),
            lastActivityAt: new Date(),
          },
        },
      };
    });
  };

  const updateSessionTitle = (sessionId: string, title: string) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) return prev;

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            title,
            updatedAt: new Date(),
          },
        },
      };
    });
  };

  const setSessionContextId = (sessionId: string, contextId: string) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) return prev;

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            contextId,
            updatedAt: new Date(),
          },
        },
      };
    });
  };

  const getSessionContextId = (sessionId: string): string | null => {
    return state.sessions[sessionId]?.contextId || null;
  };

  const setSessionAgentEndpoint = (
    sessionId: string,
    agentEndpoint: string
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
            agentEndpoint,
            updatedAt: new Date(),
          },
        },
      };
    });
  };

  return {
    createSession,
    switchSession,
    closeSession,
    updateSessionStatus,
    updateSessionTitle,
    setSessionContextId,
    getSessionContextId,
    setSessionAgentEndpoint,
  };
}

