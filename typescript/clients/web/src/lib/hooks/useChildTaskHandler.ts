/**
 * Child Task Handler Hook
 *
 * Handles detection and creation of child workflow sessions
 */

import { useCallback, useRef } from 'react';
import { Session, TaskState } from '@/lib/types/session';
import { A2AHandlerCallbacks } from '@/lib/handlers/BaseA2AHandler';

interface UseChildTaskHandlerProps {
  sessions: Record<string, Session>;
  agentEndpoint: string;
  createSession: (options: any) => string;
  setSessionContextId: (sessionId: string, contextId: string) => void;
  setSessionAgentEndpoint: (sessionId: string, agentEndpoint: string) => void;
  addTask: (sessionId: string, taskId: string, state?: TaskState) => void;
  clearSessionMessages: (sessionId: string) => void;
  updateMessageInSession: (sessionId: string, messageId: string, updates: any) => void;
  updateSessionStatus: (sessionId: string, status: any, force?: boolean) => void;
  reconnectToStream: (session: Session, callbacks: A2AHandlerCallbacks) => Promise<void>;
  sessionsWithCompleteDelegations: Set<string>;
  mapA2AStateToTaskState: (state: string) => TaskState;
  addDebugLog: (type: string, message: string, data?: any) => void;
}

export function useChildTaskHandler({
  sessions,
  agentEndpoint,
  createSession,
  setSessionContextId,
  setSessionAgentEndpoint,
  addTask,
  clearSessionMessages,
  updateMessageInSession,
  updateSessionStatus,
  reconnectToStream,
  sessionsWithCompleteDelegations,
  mapA2AStateToTaskState,
  addDebugLog,
}: UseChildTaskHandlerProps) {
  const processedChildTasksRef = useRef<Set<string>>(new Set());
  const lastMessageIdRefs = useRef<Map<string, string | null>>(new Map());

  const handleChildTask = useCallback(
    (parentSessionId: string, childTaskId: string, contextId: string, metadata?: any) => {
      // Check if we've already processed this child task
      if (processedChildTasksRef.current.has(childTaskId)) {
        console.log('[ChildTaskHandler] Child task already processed, skipping:', childTaskId);
        return;
      }

      // Mark this child task as processed
      processedChildTasksRef.current.add(childTaskId);

      const workflowName = metadata?.workflowName || 'Workflow';

      console.log('[ChildTaskHandler] ===== CHILD TASK DETECTED =====');
      console.log('[ChildTaskHandler] Parent Session:', parentSessionId);
      console.log('[ChildTaskHandler] Child Task ID:', childTaskId);
      console.log('[ChildTaskHandler] Context ID:', contextId);
      console.log('[ChildTaskHandler] Workflow Name:', workflowName);

      // Get parent session info
      const parentSession = sessions[parentSessionId];
      if (!parentSession) {
        console.error('[ChildTaskHandler] ❌ Parent session not found:', parentSessionId);
        return;
      }

      const parentAgentEndpoint = parentSession.agentEndpoint || agentEndpoint;
      if (!parentAgentEndpoint) {
        console.error('[ChildTaskHandler] ❌ No agent endpoint available');
        return;
      }

      // Create a new session for the child task
      const childSessionId = createSession({
        type: 'conversation',
        title: workflowName,
        isTemporary: false,
        parentSessionId: parentSessionId,
      });

      console.log('[ChildTaskHandler] ✅ Child Session Created:', childSessionId);

      // Copy connection details from parent
      setSessionContextId(childSessionId, contextId);
      setSessionAgentEndpoint(childSessionId, parentAgentEndpoint);

      // Add the child task to the session
      addTask(childSessionId, childTaskId, 'working');

      addDebugLog('info', 'Child session created, connecting to A2A...', {
        childSessionId,
        childTaskId,
        contextId,
        parentAgentEndpoint,
      });

      // Clear any existing messages before reconnecting
      clearSessionMessages(childSessionId);

      // Update the parent session's workflow dispatch artifact
      const parentMessages = parentSession.messages;
      if (parentMessages && parentMessages.length > 0) {
        for (let i = parentMessages.length - 1; i >= 0; i--) {
          const message = parentMessages[i];
          if (message.artifacts) {
            const hasWorkflowDispatch = Object.values(message.artifacts).some(
              (artifact: any) =>
                artifact.toolName === 'dispatch_workflow_usdai_points_trading_strateg',
            );

            if (hasWorkflowDispatch) {
              const updatedArtifacts = { ...message.artifacts };

              Object.keys(updatedArtifacts).forEach((artifactId) => {
                const artifact = updatedArtifacts[artifactId];
                if (artifact.toolName === 'dispatch_workflow_usdai_points_trading_strateg') {
                  updatedArtifacts[artifactId] = {
                    ...artifact,
                    output: {
                      ...(artifact.output || {}),
                      childSessionId,
                      childTaskId,
                    },
                    input: {
                      ...(artifact.input || {}),
                      childSessionId,
                      childTaskId,
                    },
                  };
                }
              });

              updateMessageInSession(parentSessionId, message.id, {
                artifacts: updatedArtifacts,
              });
              break;
            }
          }
        }
      }

      // Reconnect immediately to get the workflow stream
      const childSession =
        sessions[childSessionId] ||
        ({
          id: childSessionId,
          agentEndpoint: parentAgentEndpoint,
          contextId,
          tasks: [{ taskId: childTaskId, state: 'working' }],
          parentSessionId,
          type: 'conversation',
        } as Session);

      reconnectToStream(childSession, {
        onMessage: (sessionId, messageId, content, sender, updates) => {
          const justSubmittedDelegations = sessionsWithCompleteDelegations.has(sessionId);
          const hasDashboardArtifacts =
            updates?.artifacts?.['strategy-dashboard-display'] ||
            updates?.artifacts?.['transaction-history-display'] ||
            updates?.artifacts?.['strategy-settings-display'] ||
            updates?.artifacts?.['strategy-policies-display'];

          if (
            justSubmittedDelegations &&
            messageId &&
            (!updates?.artifacts ||
              (!updates.artifacts['policy-display'] && !updates.artifacts['policy-data'])) &&
            !hasDashboardArtifacts
          ) {
            console.log(
              '[ChildTaskHandler] BLOCKING update - preserving delegation artifacts after submission',
            );
            return messageId;
          }

          let finalMessageId: string;
          if (messageId) {
            updateMessageInSession(sessionId, messageId, {
              content,
              sender,
              ...updates,
            });
            finalMessageId = messageId;
          } else {
            // This would need addMessageToSession - we'll handle it in the main component
            finalMessageId = messageId;
          }
          lastMessageIdRefs.current.set(sessionId, finalMessageId);
          return finalMessageId;
        },
        onStatusUpdate: (sessionId, status, data) => {
          const taskState = data?.status?.state || data?.state;
          if (taskState === 'completed') {
            updateSessionStatus(sessionId, 'completed');
          } else if (taskState === 'failed' || taskState === 'error') {
            updateSessionStatus(sessionId, 'error');
          } else {
            updateSessionStatus(sessionId, status);
          }

          if (data?.awaitingInput) {
            const lastMessageId = lastMessageIdRefs.current.get(sessionId);
            if (lastMessageId) {
              updateMessageInSession(sessionId, lastMessageId, {
                awaitingUserAction: true,
                statusData: data,
              });
            }
          } else if (status === 'working' || status === 'active') {
            const lastMessageId = lastMessageIdRefs.current.get(sessionId);
            if (lastMessageId) {
              updateMessageInSession(sessionId, lastMessageId, {
                awaitingUserAction: false,
                statusData: undefined,
              });
            }
          }
        },
        onContextIdReceived: (sessionId, newContextId) => {
          setSessionContextId(sessionId, newContextId);
        },
        onTaskReceived: (sessionId, taskId, state) => {
          const taskState = mapA2AStateToTaskState(state);
          addTask(sessionId, taskId, taskState);
        },
        onTaskStateChanged: (sessionId, taskId, state) => {
          const taskState = mapA2AStateToTaskState(state);
          // updateTaskState would be needed here
          if (taskState === 'completed') {
            updateSessionStatus(sessionId, 'completed');
          } else if (taskState === 'failed') {
            updateSessionStatus(sessionId, 'error');
          }
        },
        onChildTaskDetected: handleChildTask,
        onToolInvocation: (sessionId, toolData) => {
          addDebugLog('info', 'Tool invocation in child task', {
            sessionId,
            toolData,
          });
        },
      });

      addDebugLog('success', 'Child task reconnection initiated', {
        childSessionId,
        childTaskId,
      });
    },
    [
      sessions,
      agentEndpoint,
      createSession,
      setSessionContextId,
      setSessionAgentEndpoint,
      addTask,
      clearSessionMessages,
      updateMessageInSession,
      updateSessionStatus,
      reconnectToStream,
      sessionsWithCompleteDelegations,
      mapA2AStateToTaskState,
      addDebugLog,
    ],
  );

  return { handleChildTask };
}
