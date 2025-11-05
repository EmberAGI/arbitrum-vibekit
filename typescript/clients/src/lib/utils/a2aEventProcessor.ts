/**
 * A2A Event Processing Utilities
 * 
 * Handles processing of A2A protocol events (task, artifact-update, status-update)
 */

import { SessionStatus } from "@/lib/types/session";

export interface ArtifactData {
  artifactId: string;
  toolName: string;
  input: any;
  output: any;
  append: boolean;
  isLoading: boolean;
}

export interface EventProcessorCallbacks {
  onMessage: (
    sessionId: string,
    messageId: string,
    content: string,
    sender: "agent" | "agent-progress" | "agent-error",
    updates?: any
  ) => string;
  onStatusUpdate: (
    sessionId: string,
    status: SessionStatus,
    data?: any
  ) => void;
  onContextIdReceived: (sessionId: string, contextId: string) => void;
  onTaskReceived?: (sessionId: string, taskId: string, state: string) => void;
  onTaskStateChanged?: (
    sessionId: string,
    taskId: string,
    state: string
  ) => void;
  onChildTaskDetected?: (
    parentSessionId: string,
    childTaskId: string,
    contextId: string,
    metadata?: any
  ) => void;
  onToolInvocation?: (sessionId: string, toolData: any) => void;
}

export interface EventProcessorState {
  sessionId: string;
  contextId: string | null;
  currentAgentMessageId: string;
  reasoningText: string;
  responseText: string;
  artifactsMap: Record<string, ArtifactData>;
}

/**
 * Processes a single A2A event
 */
export async function processA2AEvent(
  event: any,
  state: EventProcessorState,
  callbacks: EventProcessorCallbacks
): Promise<void> {
  if (!event) return;

  const {
    sessionId,
    contextId,
    currentAgentMessageId,
    reasoningText,
    responseText,
    artifactsMap,
  } = state;

  console.log(
    "[A2AEventProcessor] Event:",
    event.kind,
    "for session:",
    sessionId
  );

  // Capture contextId (session ID from server)
  if (event.contextId && event.contextId !== contextId) {
    console.log(
      "[A2AEventProcessor] Received contextId for session:",
      sessionId,
      "→",
      event.contextId
    );
    callbacks.onContextIdReceived(sessionId, event.contextId);
  }

  // Handle different event kinds
  if (event.kind === "task") {
    await processTaskEvent(event, state, callbacks);
  } else if (event.kind === "artifact-update") {
    await processArtifactUpdateEvent(event, state, callbacks);
  } else if (event.kind === "status-update") {
    await processStatusUpdateEvent(event, state, callbacks);
  }
}

/**
 * Processes a task event
 */
async function processTaskEvent(
  event: any,
  state: EventProcessorState,
  callbacks: EventProcessorCallbacks
): Promise<void> {
  const { sessionId, currentAgentMessageId, artifactsMap } = state;

  console.log("[A2AEventProcessor] Task created:", event.id);

  // Capture task ID with initial state for task history
  if (event.id && callbacks.onTaskReceived) {
    const initialState = event.status?.state || "pending";
    callbacks.onTaskReceived(sessionId, event.id, initialState);
  }

  // Check for artifacts (non-streaming mode)
  if (event.artifacts && Array.isArray(event.artifacts)) {
    processArtifacts(event.artifacts, state, callbacks);
  }
}

/**
 * Processes an artifact-update event
 */
async function processArtifactUpdateEvent(
  event: any,
  state: EventProcessorState,
  callbacks: EventProcessorCallbacks
): Promise<void> {
  const { sessionId, currentAgentMessageId, artifactsMap } = state;
  const artifact = event.artifact;
  const artifactType =
    artifact?.name || artifact?.artifactId || "unknown";
  const artifactId =
    artifact?.artifactId || artifact?.id || artifactType;
  const appendMode = event.append !== false;

  if (artifact?.parts) {
    // Separate data parts from other parts
    const dataParts = artifact.parts.filter(
      (p: any) => p.kind === "data" && p.data
    );
    const hasMultipleDataParts = dataParts.length > 1;

    // Process text parts immediately (reasoning, text-response)
    for (const part of artifact.parts) {
      if (part.kind === "text" && part.text) {
        if (artifactType === "reasoning") {
          state.reasoningText += part.text;
          callbacks.onMessage(
            sessionId,
            currentAgentMessageId,
            state.responseText,
            "agent",
            {
              reasoning: state.reasoningText,
              isStreaming: true,
              artifacts: artifactsMap,
            }
          );
        } else if (artifactType === "text-response") {
          state.responseText += part.text;
          callbacks.onMessage(
            sessionId,
            currentAgentMessageId,
            state.responseText,
            "agent",
            {
              reasoning: state.reasoningText,
              isStreaming: true,
              artifacts: artifactsMap,
            }
          );
        }
      }
    }

    // Process all data parts at once
    if (dataParts.length > 0) {
      const finalToolData = processDataParts(
        dataParts,
        artifactId,
        appendMode,
        artifactsMap,
        hasMultipleDataParts
      );

      // Store artifact
      const hasData =
        finalToolData &&
        (Array.isArray(finalToolData)
          ? finalToolData.length > 0
          : Object.keys(finalToolData).length > 0);
      
      const isToolCall = artifactType.startsWith("tool-call-");
      const toolName = isToolCall
        ? artifactType.replace("tool-call-", "")
        : artifactId;

      artifactsMap[artifactId] = {
        artifactId,
        toolName,
        input: finalToolData || {},
        output: finalToolData || {},
        append: appendMode,
        isLoading: !hasData && !event.lastChunk,
      };

      callbacks.onMessage(
        sessionId,
        currentAgentMessageId,
        state.responseText,
        "agent",
        {
          reasoning: state.reasoningText,
          toolInvocation: isToolCall
            ? {
                toolName,
                input: finalToolData || {},
                output: finalToolData || {},
              }
            : undefined,
          artifacts: artifactsMap,
          isStreaming: !event.lastChunk,
        }
      );

      // Notify about tool invocation (only if has data and is a tool call)
      if (callbacks.onToolInvocation && hasData && isToolCall) {
        callbacks.onToolInvocation(sessionId, {
          toolName,
          data: finalToolData,
          artifact,
        });
      }
    }
  }

  // Mark as complete on last chunk
  if (event.lastChunk && artifactType === "text-response") {
    callbacks.onMessage(
      sessionId,
      currentAgentMessageId,
      state.responseText,
      "agent",
      {
        reasoning: state.reasoningText,
        artifacts: artifactsMap,
        isStreaming: false,
      }
    );
  }
}

/**
 * Processes a status-update event
 */
async function processStatusUpdateEvent(
  event: any,
  state: EventProcessorState,
  callbacks: EventProcessorCallbacks
): Promise<void> {
  const { sessionId, contextId, currentAgentMessageId, responseText, reasoningText } = state;

  console.log("[A2AEventProcessor] Status update:", event.status);

  // Detect child task (workflow) from referenceTaskIds
  if (
    event.status?.message?.referenceTaskIds &&
    event.status.message.referenceTaskIds.length > 0
  ) {
    const childTaskId = event.status.message.referenceTaskIds[0];
    const eventContextId = event.contextId || contextId;

    console.log(
      `[A2AEventProcessor] Child task detected in session ${sessionId}: ${childTaskId}`
    );

    if (callbacks.onChildTaskDetected && eventContextId) {
      callbacks.onChildTaskDetected(sessionId, childTaskId, eventContextId, {
        workflowName:
          event.status.message.metadata?.referencedWorkflow?.workflowName,
        description:
          event.status.message.metadata?.referencedWorkflow?.description,
        message: event.status.message,
      });
    }
  }

  // Notify about task state changes
  if (event.id && event.status?.state && callbacks.onTaskStateChanged) {
    callbacks.onTaskStateChanged(sessionId, event.id, event.status.state);
  }

  // Process artifacts if included
  if (event.artifacts && Array.isArray(event.artifacts)) {
    processArtifacts(event.artifacts, state, callbacks);
  }

  // Map task state to session status
  if (event.status?.state) {
    const stateValue = event.status.state;

    // Check for input-required or auth-required states
    if (stateValue === "input-required" || stateValue === "auth-required") {
      console.log(
        "[A2AEventProcessor] Task paused - awaiting user input:",
        stateValue
      );
      callbacks.onStatusUpdate(sessionId, "waiting", {
        awaitingInput: true,
        awaitingInputType: stateValue,
        inputSchema: event.inputSchema,
        statusMessage: event.status.message,
      });
    } else {
      const statusMap: Record<string, SessionStatus> = {
        pending: "waiting",
        working: "working",
        running: "working",
        completed: "completed",
        success: "completed",
        failed: "error",
        error: "error",
      };
      const newStatus = statusMap[stateValue] || "active";
      callbacks.onStatusUpdate(sessionId, newStatus, event.status);
    }
  }

  if (event.final) {
    console.log(
      "[A2AEventProcessor] Task completed for session:",
      sessionId
    );
    callbacks.onMessage(
      sessionId,
      currentAgentMessageId,
      responseText,
      "agent",
      {
        reasoning: reasoningText,
        isStreaming: false,
      }
    );
    callbacks.onStatusUpdate(sessionId, "active");
  }
}

/**
 * Processes data parts for artifacts
 */
function processDataParts(
  dataParts: any[],
  artifactId: string,
  appendMode: boolean,
  artifactsMap: Record<string, ArtifactData>,
  hasMultipleDataParts: boolean
): any {
  if (hasMultipleDataParts) {
    // Multiple data parts - aggregate into array
    const allData = dataParts.map(
      (p: any) => (p.data as any)?.structuredContent || p.data
    );

    if (!appendMode) {
      return allData;
    } else if (artifactsMap[artifactId]) {
      const existing = artifactsMap[artifactId];
      if (Array.isArray(existing.output)) {
        return [...existing.output, ...allData];
      } else {
        return [existing.output, ...allData];
      }
    } else {
      return allData;
    }
  } else {
    // Single data part - handle normally
    const toolData =
      (dataParts[0].data as any)?.structuredContent || dataParts[0].data;

    if (!appendMode) {
      return toolData;
    } else if (artifactsMap[artifactId]) {
      const existing = artifactsMap[artifactId];
      if (Array.isArray(existing.output)) {
        if (Array.isArray(toolData)) {
          return [...existing.output, ...toolData];
        } else {
          return [...existing.output, toolData];
        }
      } else if (Array.isArray(toolData)) {
        return [existing.output, ...toolData];
      } else if (
        typeof existing.output === "object" &&
        typeof toolData === "object"
      ) {
        return { ...existing.output, ...toolData };
      } else {
        return toolData;
      }
    } else {
      return toolData;
    }
  }
}

/**
 * Processes artifacts array (non-streaming mode)
 */
function processArtifacts(
  artifacts: any[],
  state: EventProcessorState,
  callbacks: EventProcessorCallbacks
): void {
  const { sessionId, currentAgentMessageId } = state;
  let reasoning = "";
  let response = "";
  let toolInvocation = null;

  for (const artifact of artifacts) {
    const artifactType = artifact.name || artifact.artifactId;

    if (artifact.parts) {
      for (const part of artifact.parts) {
        if (part.kind === "text" && part.text) {
          if (artifactType === "reasoning") {
            reasoning += part.text;
          } else if (artifactType === "text-response") {
            response += part.text;
          } else if (artifactType === "tool-invocation") {
            try {
              const toolData =
                part.data || JSON.parse(part.text || "{}");
              toolInvocation = {
                toolName:
                  toolData.toolName || toolData.name || "Unknown Tool",
                input: toolData.input || toolData.arguments,
                output: toolData.output || toolData.result,
              };
            } catch (error) {
              console.error(
                "[A2AEventProcessor] Failed to parse tool invocation:",
                error
              );
            }
          }
        }
      }
    }
  }

  if (currentAgentMessageId) {
    callbacks.onMessage(sessionId, currentAgentMessageId, response, "agent", {
      reasoning: reasoning || undefined,
      toolInvocation: toolInvocation || undefined,
      isStreaming: false,
    });
  }
}






