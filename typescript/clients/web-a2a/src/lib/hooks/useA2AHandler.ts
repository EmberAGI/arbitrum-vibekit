/**
 * useA2AHandler Hook
 *
 * Provides A2A handler interface using the router pattern
 */

import { useCallback, useRef, useEffect } from 'react';
import { A2AHandlerRouter } from '../handlers/A2AHandlerRouter';
import { A2AHandlerCallbacks } from '../handlers/BaseA2AHandler';
import { Session } from '@/lib/types/session';

interface UseA2AHandlerReturn {
  sendMessage: (
    session: Session,
    callbacks: A2AHandlerCallbacks,
    message: string,
    metadata?: Record<string, string>,
  ) => Promise<void>;
  reconnectToStream: (session: Session, callbacks: A2AHandlerCallbacks) => Promise<void>;
  sendToActiveTask: (
    session: Session,
    callbacks: A2AHandlerCallbacks,
    data: any,
    metadata?: Record<string, string>,
  ) => Promise<void>;
  isProcessing: (sessionId: string) => boolean;
}

export function useA2AHandler(): UseA2AHandlerReturn {
  const routerRef = useRef<A2AHandlerRouter>(new A2AHandlerRouter());
  const processingSessionsRef = useRef<Set<string>>(new Set());

  // Cleanup on unmount - abort all active requests
  useEffect(() => {
    return () => {
      // Clear all handlers, which will abort their active requests
      routerRef.current.clear();
      processingSessionsRef.current.clear();
    };
  }, []);

  const sendMessage = useCallback(
    async (
      session: Session,
      callbacks: A2AHandlerCallbacks,
      message: string,
      metadata?: Record<string, string>,
    ) => {
      const handler = routerRef.current.getHandler(session, callbacks);
      processingSessionsRef.current.add(session.id);

      try {
        await handler.sendMessage(message, metadata);
      } finally {
        processingSessionsRef.current.delete(session.id);
      }
    },
    [],
  );

  const reconnectToStream = useCallback(
    async (session: Session, callbacks: A2AHandlerCallbacks) => {
      const handler = routerRef.current.getHandler(session, callbacks);
      processingSessionsRef.current.add(session.id);

      try {
        await handler.reconnectToStream();
      } finally {
        processingSessionsRef.current.delete(session.id);
      }
    },
    [],
  );

  const sendToActiveTask = useCallback(
    async (
      session: Session,
      callbacks: A2AHandlerCallbacks,
      data: any,
      metadata?: Record<string, string>,
    ) => {
      const handler = routerRef.current.getHandler(session, callbacks);
      processingSessionsRef.current.add(session.id);

      try {
        await handler.sendToActiveTask(data, metadata);
      } finally {
        processingSessionsRef.current.delete(session.id);
      }
    },
    [],
  );

  const isProcessing = useCallback((sessionId: string): boolean => {
    return processingSessionsRef.current.has(sessionId);
  }, []);

  return {
    sendMessage,
    reconnectToStream,
    sendToActiveTask,
    isProcessing,
  };
}
