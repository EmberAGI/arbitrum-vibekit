/**
 * Message Handling Hook
 * 
 * Provides reusable message handling callbacks for A2A sessions
 */

import { useCallback } from "react";
import { SessionStatus } from "@/lib/types/session";
import { TaskState } from "@/lib/types/session";

interface MessageHandlers {
  addMessageToSession: (
    sessionId: string,
    message: any
  ) => string;
  updateMessageInSession: (
    sessionId: string,
    messageId: string,
    updates: any
  ) => void;
  updateSessionStatus: (
    sessionId: string,
    status: SessionStatus,
    data?: any
  ) => void;
  sessionsWithCompleteDelegations: Set<string>;
}

export function useMessageHandlers(handlers: MessageHandlers) {
  const mapA2AStateToTaskState = useCallback((a2aState: string): TaskState => {
    switch (a2aState.toLowerCase()) {
      case "pending":
        return "pending";
      case "working":
      case "running":
        return "working";
      case "completed":
      case "success":
        return "completed";
      case "failed":
      case "error":
        return "failed";
      case "cancelled":
        return "cancelled";
      default:
        return "working";
    }
  }, []);

  const createOnMessage = useCallback(
    (
      sessionId: string,
      lastMessageIdRef: React.MutableRefObject<string | null>
    ) => {
      return (
        messageId: string,
        content: string,
        sender: "agent" | "agent-progress" | "agent-error",
        updates?: any
      ): string => {
        const justSubmittedDelegations =
          handlers.sessionsWithCompleteDelegations.has(sessionId);

        const hasDashboardArtifacts =
          updates?.artifacts?.["strategy-dashboard-display"] ||
          updates?.artifacts?.["transaction-history-display"] ||
          updates?.artifacts?.["strategy-settings-display"] ||
          updates?.artifacts?.["strategy-policies-display"];

        if (
          justSubmittedDelegations &&
          messageId &&
          (!updates?.artifacts ||
            (!updates.artifacts["delegations-display"] &&
              !updates.artifacts["delegations-data"])) &&
          !hasDashboardArtifacts
        ) {
          console.log(
            "[MessageHandlers] BLOCKING update - preserving delegation artifacts after submission"
          );
          return messageId;
        }

        if (justSubmittedDelegations && hasDashboardArtifacts) {
          console.log(
            "[MessageHandlers] Dashboard artifacts received - but keeping delegation flag until Continue is clicked"
          );
        }

        let finalMessageId: string;
        if (messageId) {
          handlers.updateMessageInSession(sessionId, messageId, {
            content,
            sender,
            ...updates,
          });
          finalMessageId = messageId;
        } else {
          finalMessageId = handlers.addMessageToSession(sessionId, {
            sender,
            content,
            ...updates,
          });
        }
        lastMessageIdRef.current = finalMessageId;
        return finalMessageId;
      };
    },
    [handlers]
  );

  const createOnStatusUpdate = useCallback(
    (
      sessionId: string,
      lastMessageIdRef: React.MutableRefObject<string | null>,
      addMessageToSession: (sessionId: string, message: any) => string
    ) => {
      return (status: SessionStatus, data?: any) => {
        const taskState = data?.status?.state || data?.state;
        if (taskState === "completed") {
          handlers.updateSessionStatus(sessionId, "completed");
        } else if (taskState === "failed" || taskState === "error") {
          handlers.updateSessionStatus(sessionId, "error");
        } else {
          handlers.updateSessionStatus(sessionId, status);
        }

        if (data?.awaitingInput) {
          if (lastMessageIdRef.current) {
            handlers.updateMessageInSession(sessionId, lastMessageIdRef.current, {
              awaitingUserAction: true,
              statusData: data,
            });
          } else {
            const messageId = addMessageToSession(sessionId, {
              sender: "agent",
              content:
                data.statusMessage?.parts?.[0]?.text || "Awaiting input...",
              awaitingUserAction: true,
              statusData: data,
            });
            lastMessageIdRef.current = messageId;
          }
        } else if (
          (status === "working" || status === "active") &&
          lastMessageIdRef.current
        ) {
          handlers.updateMessageInSession(sessionId, lastMessageIdRef.current, {
            awaitingUserAction: false,
            statusData: undefined,
          });
        }
      };
    },
    [handlers]
  );

  return {
    mapA2AStateToTaskState,
    createOnMessage,
    createOnStatusUpdate,
  };
}






