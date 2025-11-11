"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ChatMessage {
  id: string;
  sender: "user" | "agent" | "agent-progress" | "agent-error";
  content: string;
  timestamp: Date;
  validationErrors?: string[];
  isHtml?: boolean;
  isStreaming?: boolean;
  reasoning?: string;
  toolInvocation?: {
    toolName: string;
    input: any;
    output: any;
  };
}

interface DebugLog {
  timestamp: Date;
  type: "info" | "success" | "warning" | "error";
  message: string;
  data?: any;
}

interface UseA2AClientReturn {
  isConnected: boolean;
  isConnecting: boolean;
  messages: ChatMessage[];
  agentCard: any;
  validationErrors: string[];
  debugLogs: DebugLog[];
  connect: (
    url: string,
    customHeaders: Record<string, string>
  ) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: string, metadata: Record<string, string>) => void;
  addMessage: (
    sender: ChatMessage["sender"],
    content: string,
    validationErrors?: string[],
    isHtml?: boolean
  ) => void;
  clearDebugLogs: () => void;
}

export function useA2AClient(): UseA2AClientReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentCard, setAgentCard] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);

  const agentEndpointRef = useRef<string>("");
  const contextIdRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const reasoningTextRef = useRef<string>("");
  const responseTextRef = useRef<string>("");

  const addDebugLog = useCallback(
    (type: DebugLog["type"], message: string, data?: any) => {
      const log: DebugLog = {
        timestamp: new Date(),
        type,
        message,
        data,
      };
      setDebugLogs((prev) => [...prev, log].slice(-50));
    },
    []
  );

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  const addMessage = useCallback(
    (
      sender: ChatMessage["sender"],
      content: string,
      validationErrors: string[] = [],
      isHtml = false
    ) => {
      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender,
        content,
        timestamp: new Date(),
        validationErrors,
        isHtml,
      };
      setMessages((prev) => [...prev, newMessage]);
      return newMessage.id;
    },
    []
  );

  const updateMessage = useCallback(
    (messageId: string, updates: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
      );
    },
    []
  );

  const processArtifacts = useCallback(
    (artifacts: any[]) => {
      addDebugLog("info", "Processing artifacts from task", {
        artifactsCount: artifacts.length,
        artifacts,
      });

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
                  const toolData = part.data || JSON.parse(part.text || "{}");
                  toolInvocation = {
                    toolName:
                      toolData.toolName || toolData.name || "Unknown Tool",
                    input: toolData.input || toolData.arguments,
                    output: toolData.output || toolData.result,
                  };
                } catch (error) {
                  console.error(
                    "[A2A] Failed to parse tool invocation:",
                    error
                  );
                }
              }
            }
          }
        }
      }

      if (currentMessageIdRef.current) {
        updateMessage(currentMessageIdRef.current, {
          reasoning: reasoning || undefined,
          content: response,
          toolInvocation: toolInvocation || undefined,
          isStreaming: false,
        });
      }
    },
    [addDebugLog, updateMessage]
  );

  const connect = useCallback(
    async (url: string, customHeaders: Record<string, string>) => {
      if (isConnecting || isConnected) return;

      setIsConnecting(true);
      setMessages([]);
      setAgentCard(null);
      setValidationErrors([]);
      addDebugLog("info", "Starting connection", { url, customHeaders });

      try {
        // Fetch agent card
        const agentCardUrl = url.endsWith("/")
          ? `${url}.well-known/agent-card.json`
          : `${url}/.well-known/agent-card.json`;

        addDebugLog("info", "Fetching agent card", { agentCardUrl });

        const response = await fetch(agentCardUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...customHeaders,
          },
          mode: "cors",
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch agent card: ${response.status} ${response.statusText}`
          );
        }

        const agentCardData = await response.json();
        addDebugLog("success", "Agent card fetched", agentCardData);
        setAgentCard(agentCardData);

        // Extract A2A endpoint from agent card
        const a2aEndpoint = agentCardData.a2a?.endpoint || `${url}/a2a`;
        agentEndpointRef.current = a2aEndpoint;

        // Check if agent supports streaming
        const supportsStreaming =
          agentCardData.capabilities?.streaming === true;
        addDebugLog("success", "Connected to A2A agent", {
          endpoint: a2aEndpoint,
          supportsStreaming,
        });

        setIsConnected(true);
        setIsConnecting(false);
        addMessage("agent", "Connected to A2A agent");
      } catch (error) {
        setIsConnecting(false);
        addDebugLog("error", "Connection failed", { error });
        addMessage(
          "agent-error",
          `Connection failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
    [isConnecting, isConnected, addDebugLog, addMessage]
  );

  const disconnect = useCallback(() => {
    const hadSession = !!contextIdRef.current;
    const sessionId = contextIdRef.current;

    agentEndpointRef.current = "";
    setIsConnected(false);
    setIsConnecting(false);
    setMessages([]);
    setAgentCard(null);
    setValidationErrors([]);
    contextIdRef.current = null;
    currentMessageIdRef.current = null;
    reasoningTextRef.current = "";
    responseTextRef.current = "";

    addDebugLog("info", "Disconnected from A2A agent", {
      hadSession,
      clearedSessionId: sessionId,
      message: hadSession
        ? `Session ${sessionId} cleared`
        : "No active session to clear",
    });
  }, [addDebugLog]);

  const sendMessage = useCallback(
    async (message: string, metadata: Record<string, string>) => {
      if (!isConnected || !message.trim() || !agentEndpointRef.current) return;

      const messageId = `msg-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      addDebugLog("info", "Sending message", {
        message,
        messageId,
        contextId: contextIdRef.current,
        hasExistingContext: !!contextIdRef.current,
        isFirstMessage: !contextIdRef.current,
        metadata,
      });

      // Add user message
      addMessage("user", message);

      // Initialize refs for streaming
      reasoningTextRef.current = "";
      responseTextRef.current = "";
      currentMessageIdRef.current = addMessage("agent", "");
      updateMessage(currentMessageIdRef.current, {
        isStreaming: true,
        reasoning: "",
        content: "",
      });

      // Prepare JSONRPC request
      const messagePayload: any = {
        role: "user",
        parts: [{ kind: "text", text: message }],
        messageId,
        metadata,
      };

      // Only include contextId if we have one (don't send null on first message)
      if (contextIdRef.current) {
        messagePayload.contextId = contextIdRef.current;
      }

      const request = {
        jsonrpc: "2.0",
        id: messageId,
        method: "message/stream",
        params: {
          message: messagePayload,
          configuration: {
            acceptedOutputModes: ["text/plain"],
          },
        },
      };

      addDebugLog("info", "Request payload prepared", {
        includesContextId: !!messagePayload.contextId,
        contextIdValue: messagePayload.contextId || "none (first message)",
        requestId: messageId,
        endpoint: agentEndpointRef.current,
      });

      try {
        // Make fetch request with SSE
        const response = await fetch(agentEndpointRef.current, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Process SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventDataBuffer = "";

        if (!reader) {
          throw new Error("No response body");
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Process any remaining event data
            if (eventDataBuffer.trim()) {
              try {
                const result = JSON.parse(eventDataBuffer.replace(/\n$/, ""));
                const event = result.result;
                if (event) {
                  await processEvent(event);
                }
              } catch (error) {
                addDebugLog("error", "Failed to parse final SSE data", {
                  error,
                });
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process line by line
          let lineEndIndex;
          while ((lineEndIndex = buffer.indexOf("\n")) >= 0) {
            const line = buffer.substring(0, lineEndIndex).trim();
            buffer = buffer.substring(lineEndIndex + 1);

            if (line === "") {
              // Empty line means end of SSE event
              if (eventDataBuffer) {
                try {
                  addDebugLog("info", "Raw SSE event data buffer", {
                    eventDataBuffer,
                    length: eventDataBuffer.length,
                  });
                  const result = JSON.parse(eventDataBuffer.replace(/\n$/, ""));
                  addDebugLog("info", "Parsed SSE result", {
                    hasError: !!result.error,
                    hasResult: !!result.result,
                    result: result,
                  });

                  if (result.error) {
                    addDebugLog("error", "Agent error from SSE", result.error);
                    updateMessage(currentMessageIdRef.current!, {
                      content: `Error: ${result.error.message}`,
                      isStreaming: false,
                    });
                  } else {
                    const event = result.result;
                    if (event) {
                      await processEvent(event);
                    }
                  }
                } catch (error) {
                  addDebugLog("error", "Failed to parse SSE data", { error });
                }
                eventDataBuffer = "";
              }
            } else if (line.startsWith("data:")) {
              // Accumulate data lines
              eventDataBuffer += line.substring(5).trimStart() + "\n";
            }
            // Ignore comment lines (starting with :) and other SSE fields
          }
        }

        // Helper function to process a single event
        async function processEvent(event: any) {
          if (!event) return;

          // DEBUG: Log the full event to see what we're receiving
          addDebugLog("info", `Event kind: ${event.kind}`, {
            kind: event.kind,
            hasArtifacts: !!event.artifacts,
            artifactsCount: event.artifacts?.length,
            fullEvent: event,
          });

          // Update contextId (session ID for conversation persistence)
          if (event.contextId) {
            if (event.contextId !== contextIdRef.current) {
              const oldContextId = contextIdRef.current;
              contextIdRef.current = event.contextId;
              addDebugLog("success", "Session ID captured and stored", {
                oldContextId,
                newContextId: event.contextId,
                eventKind: event.kind,
                isFirstSession: !oldContextId,
                message: oldContextId
                  ? `Session ID updated from ${oldContextId} to ${event.contextId}`
                  : `First session ID received: ${event.contextId}`,
              });
            }
          } else {
            // Log if we expected a contextId but didn't get one
            if (!contextIdRef.current) {
              addDebugLog("warning", "No contextId in event", {
                eventKind: event.kind,
                hasContextRef: !!contextIdRef.current,
                message:
                  "Server did not provide a contextId - session may not persist",
              });
            }
          }

          // Handle different event kinds
          if (event.kind === "task") {
            addDebugLog("info", "Task created", {
              taskId: event.id,
              hasArtifacts: !!event.artifacts,
              artifactsCount: event.artifacts?.length || 0,
              artifacts: event.artifacts,
              fullTask: event,
            });

            // Check if task has artifacts (non-streaming mode)
            if (event.artifacts && Array.isArray(event.artifacts)) {
              addDebugLog("info", "Processing artifacts from task event", {
                artifactsCount: event.artifacts.length,
                artifacts: event.artifacts,
              });
              processArtifacts(event.artifacts);
            }
          } else if (event.kind === "artifact-update") {
            const artifact = event.artifact;
            const artifactType =
              artifact?.name || artifact?.artifactId || "unknown";

            addDebugLog("info", `Processing artifact: ${artifactType}`, {
              artifactType,
              hasArtifact: !!artifact,
              hasParts: !!artifact?.parts,
              partsLength: artifact?.parts?.length,
            });

            if (artifact?.parts) {
              for (const part of artifact.parts) {
                if (part.kind === "text" && part.text) {
                  if (artifactType === "reasoning") {
                    reasoningTextRef.current += part.text;
                    updateMessage(currentMessageIdRef.current!, {
                      reasoning: reasoningTextRef.current,
                      isStreaming: true,
                    });
                  } else if (artifactType === "text-response") {
                    responseTextRef.current += part.text;
                    updateMessage(currentMessageIdRef.current!, {
                      content: responseTextRef.current,
                      isStreaming: true,
                    });
                  } else if (artifactType === "tool-invocation") {
                    // Handle tool invocation
                    try {
                      const toolData =
                        part.data || JSON.parse(part.text || "{}");
                      updateMessage(currentMessageIdRef.current!, {
                        toolInvocation: {
                          toolName:
                            toolData.toolName ||
                            toolData.name ||
                            "Unknown Tool",
                          input: toolData.input || toolData.arguments,
                          output: toolData.output || toolData.result,
                        },
                        isStreaming: true,
                      });
                    } catch (error) {
                      addDebugLog("error", "Failed to parse tool invocation", {
                        error,
                      });
                    }
                  }
                } else if (part.kind === "data" && part.data) {
                  // Handle data parts (e.g., tool call results)
                  const isToolCall = artifactType.startsWith("tool-call-");
                  if (isToolCall) {
                    const toolName = artifactType.replace("tool-call-", "");

                    // Extract structured content if available
                    const toolData =
                      (part.data as any)?.structuredContent || part.data;

                    // Only update if we have actual data (not empty object)
                    const hasData =
                      toolData && Object.keys(toolData).length > 0;

                    addDebugLog(
                      "info",
                      `Tool call data received: ${toolName}`,
                      {
                        toolName,
                        hasData,
                        data: toolData,
                        description: artifact.description,
                      }
                    );

                    if (hasData) {
                      updateMessage(currentMessageIdRef.current!, {
                        toolInvocation: {
                          toolName: toolName,
                          input: toolData,
                          output: toolData,
                        },
                        isStreaming: !event.lastChunk,
                      });
                    }
                  }
                }
              }
            }

            // Mark as complete on last chunk
            if (event.lastChunk && artifactType === "text-response") {
              updateMessage(currentMessageIdRef.current!, {
                isStreaming: false,
              });
            }
          } else if (event.kind === "status-update") {
            addDebugLog("info", "Status update", {
              status: event.status,
              final: event.final,
              hasArtifacts: !!event.artifacts,
              artifactsCount: event.artifacts?.length || 0,
              artifacts: event.artifacts,
              fullStatusUpdate: event,
            });

            // Check if status-update has artifacts (some agents send them here)
            if (event.artifacts && Array.isArray(event.artifacts)) {
              addDebugLog("info", "Processing artifacts from status-update", {
                artifactsCount: event.artifacts.length,
                artifacts: event.artifacts,
              });
              processArtifacts(event.artifacts);
            }

            if (event.final) {
              addDebugLog("success", "Task completed", event);
              updateMessage(currentMessageIdRef.current!, {
                isStreaming: false,
              });

              // Reset refs
              currentMessageIdRef.current = null;
              reasoningTextRef.current = "";
              responseTextRef.current = "";
            }
          }
        }

        addDebugLog("info", "Stream ended");
      } catch (error) {
        addDebugLog("error", "Failed to send message", { error });
        if (currentMessageIdRef.current) {
          updateMessage(currentMessageIdRef.current, {
            content: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
            isStreaming: false,
          });
        }
      }
    },
    [isConnected, addDebugLog, addMessage, updateMessage, processArtifacts]
  );

  useEffect(() => {
    return () => {
      agentEndpointRef.current = "";
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    messages,
    agentCard,
    validationErrors,
    debugLogs,
    connect,
    disconnect,
    sendMessage,
    addMessage,
    clearDebugLogs,
  };
}
