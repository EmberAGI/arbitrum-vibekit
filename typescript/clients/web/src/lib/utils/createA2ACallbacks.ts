/**
 * Helper function to create A2A callbacks
 * 
 * Creates standardized callbacks for A2A handlers
 */

import { MutableRefObject } from "react";
import { A2AHandlerCallbacks } from "../handlers/BaseA2AHandler";
import { SessionStatus, TaskState } from "@/lib/types/session";

interface CreateCallbacksOptions {
  sessionId: string;
  sessions: Record<string, any>;
  sessionsWithCompleteDelegations: Set<string>;
  addMessageToSession: (sessionId: string, message: any) => string;
  updateMessageInSession: (sessionId: string, messageId: string, updates: any) => void;
  updateSessionStatus: (sessionId: string, status: SessionStatus, force?: boolean) => void;
  setSessionContextId: (sessionId: string, contextId: string) => void;
  addTask: (sessionId: string, taskId: string, state?: TaskState) => void;
  updateTaskState: (sessionId: string, taskId: string, state: TaskState, error?: string) => void;
  mapA2AStateToTaskState: (state: string) => TaskState;
  onChildTaskDetected?: (parentSessionId: string, childTaskId: string, contextId: string, metadata?: any) => void;
  addDebugLog?: (type: "info" | "success" | "warning" | "error", message: string, data?: any) => void;
  lastMessageIdRef?: MutableRefObject<string | null>;
}

export function createA2ACallbacks({
  sessionId,
  sessions,
  sessionsWithCompleteDelegations,
  addMessageToSession,
  updateMessageInSession,
  updateSessionStatus,
  setSessionContextId,
  addTask,
  updateTaskState,
  mapA2AStateToTaskState,
  onChildTaskDetected,
  addDebugLog,
  lastMessageIdRef,
}: CreateCallbacksOptions): A2AHandlerCallbacks {
  return {
    onMessage: (msgSessionId, messageId, content, sender, updates) => {
      const justSubmittedDelegations = sessionsWithCompleteDelegations.has(msgSessionId);
      const hasDashboardArtifacts = updates?.artifacts?.["strategy-dashboard-display"] ||
        updates?.artifacts?.["transaction-history-display"] ||
        updates?.artifacts?.["strategy-settings-display"] ||
        updates?.artifacts?.["strategy-policies-display"];

      if (justSubmittedDelegations && messageId && (!updates?.artifacts || (!updates.artifacts["delegations-display"] && !updates.artifacts["delegations-data"])) && !hasDashboardArtifacts) {
        console.log("[A2ACallbacks] BLOCKING update - preserving delegation artifacts after submission");
        return messageId;
      }

      if (justSubmittedDelegations && hasDashboardArtifacts) {
        console.log("[A2ACallbacks] Dashboard artifacts received - but keeping delegation flag until Continue is clicked");
      }

      let finalMessageId: string;
      if (messageId) {
        updateMessageInSession(msgSessionId, messageId, {
          content,
          sender,
          ...updates,
        });
        finalMessageId = messageId;
      } else {
        finalMessageId = addMessageToSession(msgSessionId, {
          sender,
          content,
          ...updates,
        });
      }

      if (lastMessageIdRef) {
        lastMessageIdRef.current = finalMessageId;
      }

      return finalMessageId;
    },
    onStatusUpdate: (msgSessionId, status, data) => {
      const taskState = data?.status?.state || data?.state;
      if (taskState === "completed") {
        updateSessionStatus(msgSessionId, "completed");
      } else if (taskState === "failed" || taskState === "error") {
        updateSessionStatus(msgSessionId, "error");
      } else {
        updateSessionStatus(msgSessionId, status);
      }

      const session = sessions[msgSessionId];
      if (session && session.messages.length > 0) {
        const lastMessageId = session.messages[session.messages.length - 1].id;

        if (data?.awaitingInput) {
          updateMessageInSession(msgSessionId, lastMessageId, {
            awaitingUserAction: true,
            statusData: data,
          });
          if (addDebugLog) {
            addDebugLog("info", "Task paused - awaiting user input", {
              sessionId: msgSessionId,
              inputType: data.awaitingInputType,
            });
          }
        } else if (status === "working" || status === "active") {
          updateMessageInSession(msgSessionId, lastMessageId, {
            awaitingUserAction: false,
            statusData: undefined,
          });
        }
      } else if (data?.awaitingInput && addMessageToSession) {
        addMessageToSession(msgSessionId, {
          sender: "agent",
          content: data.statusMessage?.parts?.[0]?.text || "Awaiting input...",
          awaitingUserAction: true,
          statusData: data,
        });
      }
    },
    onContextIdReceived: (msgSessionId, contextId) => {
      setSessionContextId(msgSessionId, contextId);
      if (addDebugLog) {
        addDebugLog("success", "Context ID received for session", {
          sessionId: msgSessionId,
          contextId,
        });
      }
    },
    onTaskReceived: (msgSessionId, taskId, state) => {
      const taskState = mapA2AStateToTaskState(state);
      addTask(msgSessionId, taskId, taskState);
      if (addDebugLog) {
        addDebugLog("success", "Task received for session", {
          sessionId: msgSessionId,
          taskId,
          state: taskState,
        });
      }
    },
    onTaskStateChanged: (msgSessionId, taskId, state) => {
      const taskState = mapA2AStateToTaskState(state);
      updateTaskState(msgSessionId, taskId, taskState);

      if (taskState === "completed") {
        updateSessionStatus(msgSessionId, "completed");
      } else if (taskState === "failed") {
        updateSessionStatus(msgSessionId, "error");
      }

      if (addDebugLog) {
        addDebugLog("info", "Task state changed", {
          sessionId: msgSessionId,
          taskId,
          state: taskState,
        });
      }
    },
    onChildTaskDetected: onChildTaskDetected,
    onToolInvocation: (msgSessionId, toolData) => {
      if (addDebugLog) {
        addDebugLog("info", "Tool invocation detected", {
          sessionId: msgSessionId,
          toolData,
        });
      }
    },
  };
}

