"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Bot,
  User,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader,
} from "lucide-react";
import DOMPurify from "dompurify";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StreamingMessage } from "@/components/StreamingMessage";
import { MessageList } from "@/components/MessageList";
import { useMCPConnection } from "@/lib/hooks/useMCPConnection";
import { useSessionManager } from "@/lib/hooks/useSessionManager";
import { useA2AHandler } from "@/lib/hooks/useA2AHandler";
import { A2AHandlerCallbacks } from "@/lib/handlers/BaseA2AHandler";
import { createA2ACallbacks } from "@/lib/utils/createA2ACallbacks";
import { loadServerConfig } from "@/config/servers";
import { MCPServer } from "@/lib/types/mcp";
import ConversationalPromptInput from "@/components/ConversationalPromptInput";
import { PromptTemplate } from "@/config/prompts";
import { ToolResultRenderer } from "@/components/ToolResultRenderer";
import { WorkflowApprovalHandler } from "@/components/tools/WorkflowApprovalHandler";
import { StrategyOverview } from "@/components/tools/StrategyOverview";
import { SplashScreen } from "@/components/SplashScreen";
import { AppSidebar } from "@/components/AppSidebar";
import { DebugModal } from "@/components/DebugModal";
import { Session, TaskState, createTaskInfo } from "@/lib/types/session";

interface DebugLog {
  timestamp: Date;
  type: "info" | "success" | "warning" | "error";
  message: string;
  data?: any;
}

export default function Home() {
  const [agentCardUrl, setAgentCardUrl] = useState(
    process.env.NEXT_PUBLIC_AGENT_CARD_URL || "http://localhost:3001"
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(
    {},
  );
  const [messageMetadata, setMessageMetadata] = useState<
    Record<string, string>
  >({});
  const [showSplash, setShowSplash] = useState(true);
  const [showOverview, setShowOverview] = useState(false); // Don't show overview automatically - user must click
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [isA2AConnected, setIsA2AConnected] = useState(false);
  const [isA2AConnecting, setIsA2AConnecting] = useState(false);
  const [agentCard, setAgentCard] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [agentEndpoint, setAgentEndpoint] = useState<string>("");
  const [workflowChildSessions, setWorkflowChildSessions] = useState<Record<string, string>>({});  // Maps childTaskId to childSessionId
  const [sessionsWithCompleteDelegations, setSessionsWithCompleteDelegations] = useState<Set<string>>(() => {
    // Load from localStorage on mount (only in browser)
    if (typeof window === 'undefined') return new Set();
    const stored = localStorage.getItem('ember-complete-delegations');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  }); // Track sessions with complete delegations

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedChildTasksRef = useRef<Set<string>>(new Set());
  const lastMessageIdRefs = useRef<Map<string, string | null>>(new Map());

  // Save complete delegations to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ember-complete-delegations', JSON.stringify(Array.from(sessionsWithCompleteDelegations)));
    }
  }, [sessionsWithCompleteDelegations]);

  // Session management
  const {
    sessions,
    activeSessionId,
    activeSession,
    sessionOrder,
    createSession,
    switchSession,
    closeSession,
    updateSessionStatus,
    addMessageToSession,
    updateMessageInSession,
    clearSessionMessages,
    removeDelegationMessages,
    setSessionContextId,
    getSessionContextId,
    setSessionAgentEndpoint,
    addTask,
    updateTaskState,
    getLatestIncompleteTaskId,
  } = useSessionManager();

  // A2A handler communication (routes to Chat or Workflow handler)
  const {
    sendMessage: sendA2AMessage,
    reconnectToStream,
    sendToActiveTask,
    isProcessing,
  } = useA2AHandler();

  // MCP connection
  const {
    connectionState: mcpConnectionState,
    connect: connectMCP,
    getPrompt,
    handleCompletion,
    completionsSupported,
  } = useMCPConnection();

  const serverConfig = useMemo(() => loadServerConfig(), []);
  const hasAttemptedMCPAutoConnectRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages]);

  // Hide splash screen when there are messages in the active session
  useEffect(() => {
    if (activeSession && activeSession.messages.length > 0) {
      setShowSplash(false);
    } else if (
      activeSession &&
      activeSession.messages.length === 0 &&
      !showSplash
    ) {
      // Show splash for empty sessions
      setShowSplash(true);
    }
  }, [activeSession?.messages.length, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Automatically show dashboard when dashboard artifacts are received
  useEffect(() => {
    if (!activeSession || activeSession.messages.length === 0) return;

    // Check if any message has dashboard artifacts
    const messageWithDashboard = activeSession.messages.find((msg: any) =>
      msg.artifacts?.["strategy-dashboard-display"]
    );

    if (messageWithDashboard) {
      const hasStrategyDashboard = true;
      const canShowOverview =
        hasStrategyDashboard && !messageWithDashboard.awaitingUserAction;

      // Automatically show overview when dashboard artifacts are received
      if (canShowOverview && !showOverview) {
        console.log("[Main] Dashboard artifacts detected, automatically showing overview");
        setShowOverview(true);
      }
    }
  }, [activeSession?.messages, activeSession?.id, showOverview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add debug log helper
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
    [],
  );

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  // Helper to map A2A task state to our TaskState enum
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
        return "working"; // Default to working for unknown states
    }
  }, []);

  // Handle child task detection - create new tab and resubscribe
  // Defined early to avoid initialization order issues
  const handleChildTask = useCallback(
    (
      parentSessionId: string,
      childTaskId: string,
      contextId: string,
      metadata?: any,
    ) => {
      // Check if we've already processed this child task
      if (processedChildTasksRef.current.has(childTaskId)) {
        console.log(
          "[Main] Child task already processed, skipping:",
          childTaskId,
        );
        return;
      }

      // Mark this child task as processed
      processedChildTasksRef.current.add(childTaskId);

      const workflowName = metadata?.workflowName || "Workflow";

      // Track the last message ID for this session
      let lastMessageIdRef: string | null = null;

      console.log("[Main] ===== CHILD TASK DETECTED =====");
      console.log("[Main] Parent Session:", parentSessionId);
      console.log("[Main] Child Task ID:", childTaskId);
      console.log("[Main] Context ID:", contextId);
      console.log("[Main] Workflow Name:", workflowName);

      // Get parent session info
      const parentSession = sessions[parentSessionId];
      if (!parentSession) {
        console.error("[Main] ❌ Parent session not found:", parentSessionId);
        return;
      }

      const parentAgentEndpoint = parentSession.agentEndpoint || agentEndpoint;
      if (!parentAgentEndpoint) {
        console.error("[Main] ❌ No agent endpoint available");
        return;
      }

      console.log("[Main] ✅ Parent Agent Endpoint:", parentAgentEndpoint);

      // Create a new session for the child task (will persist to localStorage for sidebar visibility)
      const childSessionId = createSession({
        type: "conversation",
        title: workflowName,
        isTemporary: false, // Persist child workflow tabs so they appear in sidebar after refresh
        parentSessionId: parentSessionId, // Link to parent session to prevent auto-switching
      });

      console.log(
        "[Main] ✅ Child Session Created:",
        childSessionId,
      );

      // Copy connection details from parent
      setSessionContextId(childSessionId, contextId);
      setSessionAgentEndpoint(childSessionId, parentAgentEndpoint);

      // Add the child task to the session
      addTask(childSessionId, childTaskId, "working");

      console.log(
        "[Main] ✅ Session setup complete, initiating reconnection...",
      );

      addDebugLog("info", "Child session created, connecting to A2A...", {
        childSessionId,
        childTaskId,
        contextId,
        parentAgentEndpoint,
      });

      // Store the mapping of childTaskId to childSessionId for navigation later
      console.log('[Main] Storing workflowChildSessions mapping:', {
        childTaskId,
        childSessionId,
        previousMappings: workflowChildSessions
      });
      setWorkflowChildSessions(prev => {
        const updated = {
          ...prev,
          [childTaskId]: childSessionId
        };
        console.log('[Main] Updated workflowChildSessions:', updated);
        return updated;
      });

      // Clear any existing messages before reconnecting to prevent duplicates
      console.log('[Main] Clearing existing messages from child session:', childSessionId);
      clearSessionMessages(childSessionId);

      // Update the parent session's workflow dispatch artifact to include childSessionId
      // This allows the WorkflowDispatched component to navigate to the child session
      const parentMessages = parentSession.messages;
      if (parentMessages && parentMessages.length > 0) {
        console.log('[Main] Searching through', parentMessages.length, 'messages for workflow dispatch artifact');

        // Search through all messages to find the workflow dispatch artifact
        let foundAndUpdated = false;
        for (let i = parentMessages.length - 1; i >= 0; i--) {
          const message = parentMessages[i];
          if (message.artifacts) {
            const hasWorkflowDispatch = Object.values(message.artifacts).some(
              (artifact: any) => artifact.toolName === 'dispatch_workflow_usdai_points_trading_strateg'
            );

            if (hasWorkflowDispatch) {
              console.log('[Main] Found workflow dispatch artifact in message', i, 'messageId:', message.id);
              const updatedArtifacts = { ...message.artifacts };

              Object.keys(updatedArtifacts).forEach(artifactId => {
                const artifact = updatedArtifacts[artifactId];
                if (artifact.toolName === 'dispatch_workflow_usdai_points_trading_strateg') {
                  console.log('[Main] Updating artifact with childSessionId:', {
                    artifactId,
                    childSessionId,
                    childTaskId,
                    currentOutput: artifact.output,
                    currentInput: artifact.input
                  });

                  // Create new artifact with childSessionId
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

                  console.log('[Main] Updated artifact:', updatedArtifacts[artifactId]);
                }
              });

              // Trigger a re-render by updating the message
              console.log('[Main] Calling updateMessageInSession for message:', message.id);
              updateMessageInSession(parentSessionId, message.id, {
                artifacts: updatedArtifacts
              });

              foundAndUpdated = true;
              break; // Found and updated, no need to continue
            }
          }
        }

        if (!foundAndUpdated) {
          console.warn('[Main] ⚠️ Could not find workflow dispatch artifact in any message!');
        } else {
          console.log('[Main] ✅ Successfully updated workflow dispatch artifact with childSessionId');
        }
      }

      // Don't immediately switch to child session - let user click "Configure strategy" button
      // switchSession(childSessionId);

      // IMPORTANT: Reconnect immediately - don't wait for auto-reconnect
      // This ensures the child session gets the workflow stream
      console.log("[Main] 🔌 About to call reconnectToStream...");
      console.log("[Main] reconnectToStream type:", typeof reconnectToStream);
      console.log("[Main] reconnectToStream exists:", !!reconnectToStream);

      if (!reconnectToStream) {
        console.error("[Main] ❌ reconnectToStream is undefined!");
        addDebugLog("error", "reconnectToStream function not available", {
          childSessionId,
          childTaskId,
        });
        return;
      }

      try {
        console.log("[Main] Calling reconnectToStream with params:", {
          sessionId: childSessionId,
          agentEndpoint: parentAgentEndpoint,
          contextId: contextId,
          taskId: childTaskId,
        });

        // Get or create child session
        let childSession = sessions[childSessionId];
        if (!childSession) {
          childSession = {
            id: childSessionId,
            agentEndpoint: parentAgentEndpoint,
            contextId,
            tasks: [createTaskInfo(childTaskId, "working")],
            parentSessionId,
            type: "conversation",
            status: "working",
            title: workflowName,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastActivityAt: new Date(),
            messages: [],
            isMinimized: false,
          } as Session;
        }

        const lastMessageIdRef = { current: lastMessageIdRefs.current.get(childSessionId) || null };

        const callbacks = createA2ACallbacks({
          sessionId: childSessionId,
          sessions,
          sessionsWithCompleteDelegations,
          addMessageToSession,
          updateMessageInSession,
          updateSessionStatus,
          setSessionContextId,
          addTask,
          updateTaskState,
          mapA2AStateToTaskState,
          onChildTaskDetected: handleChildTask,
          addDebugLog,
          lastMessageIdRef,
        });

        // Update ref when message ID changes
        const originalOnMessage = callbacks.onMessage;
        callbacks.onMessage = (sessionId, messageId, content, sender, updates) => {
          const result = originalOnMessage(sessionId, messageId, content, sender, updates);
          if (result) {
            lastMessageIdRefs.current.set(sessionId, result);
          }
          return result;
        };

        reconnectToStream(childSession, callbacks);

        console.log("[Main] ✅ reconnectToStream called successfully");
        addDebugLog("success", "Child task reconnection initiated", {
          childSessionId,
          childTaskId,
        });
      } catch (error) {
        console.error("[Main] ❌ Error calling reconnectToStream:", error);
        addDebugLog("error", "Failed to reconnect to child task", {
          error: error instanceof Error ? error.message : String(error),
          childSessionId,
          childTaskId,
        });
      }
    },
    [
      sessions,
      agentEndpoint,
      createSession,
      setSessionContextId,
      setSessionAgentEndpoint,
      addTask,
      addDebugLog,
      updateSessionStatus,
      switchSession,
      reconnectToStream,
      addMessageToSession,
      updateMessageInSession,
      clearSessionMessages,
      updateTaskState,
      mapA2AStateToTaskState,
    ],
  );

  // Auto-connect to A2A on mount
  useEffect(() => {
    const autoConnect = async () => {
      if (!isA2AConnected && !isA2AConnecting && agentCardUrl) {
        await handleConnect();
      }
    };
    autoConnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reconnect to incomplete sessions on mount or when A2A connects
  useEffect(() => {
    if (!isA2AConnected || !agentEndpoint || !activeSessionId) return;

    const session = sessions[activeSessionId];
    if (!session || !session.contextId) return;

    // NEVER auto-reconnect to main chat sessions
    if (session.isMainChat) {
      console.log("[Main] Never auto-reconnect to main chat session");
      return;
    }

    // Don't auto-reconnect if session has no tasks yet (newly created child session)
    if (session.tasks.length === 0) {
      console.log(
        "[Main] Skipping auto-reconnect for session with no tasks:",
        activeSessionId,
      );
      return;
    }

    // Don't auto-reconnect if we're already processing
    if (isProcessing(activeSessionId)) {
      console.log(
        "[Main] Skipping auto-reconnect - already processing:",
        activeSessionId,
      );
      return;
    }

    // Check if session needs reconnection
    const needsReconnection =
      (session.status === "working" || session.status === "waiting");

    if (needsReconnection) {
      console.log(
        "[Main] Auto-reconnecting to incomplete session on load:",
        activeSessionId,
      );
      addDebugLog("info", "Auto-reconnecting to incomplete session", {
        sessionId: activeSessionId,
        status: session.status,
        contextId: session.contextId,
      });

      // Clear messages for child sessions before reconnecting
      // UNLESS they have complete delegations waiting for Continue
      if (session.parentSessionId && !sessionsWithCompleteDelegations.has(activeSessionId)) {
        console.log('[Main] Clearing messages from child session before auto-reconnect:', activeSessionId);
        clearSessionMessages(activeSessionId);
      } else if (session.parentSessionId && sessionsWithCompleteDelegations.has(activeSessionId)) {
        console.log('[Main] NOT clearing messages - session has complete delegations waiting for Continue');
      }

      // Reconnect to the stream
      const latestIncompleteTaskId = getLatestIncompleteTaskId(activeSessionId);
      
      if (!session) return;

      const lastMessageIdRef = { current: lastMessageIdRefs.current.get(activeSessionId) || null };

      const callbacks = createA2ACallbacks({
        sessionId: activeSessionId,
        sessions,
        sessionsWithCompleteDelegations,
        addMessageToSession,
        updateMessageInSession,
        updateSessionStatus,
        setSessionContextId,
        addTask,
        updateTaskState,
        mapA2AStateToTaskState,
        onChildTaskDetected: handleChildTask,
        addDebugLog,
        lastMessageIdRef,
      });

      // Update ref when message ID changes
      const originalOnMessage = callbacks.onMessage;
      callbacks.onMessage = (sessionId, messageId, content, sender, updates) => {
        const result = originalOnMessage(sessionId, messageId, content, sender, updates);
        if (result) {
          lastMessageIdRefs.current.set(sessionId, result);
        }
        return result;
      };

      reconnectToStream(session, callbacks);
    }
  }, [
    isA2AConnected,
    agentEndpoint,
    activeSessionId,
    sessions,
    isProcessing,
    sessionsWithCompleteDelegations,
    reconnectToStream,
    getLatestIncompleteTaskId,
    updateMessageInSession,
    addMessageToSession,
    clearSessionMessages,
    updateSessionStatus,
    setSessionContextId,
    mapA2AStateToTaskState,
    addDebugLog,
    handleChildTask,
  ]); // All dependencies for reconnect effect
  useEffect(() => {
    if (hasAttemptedMCPAutoConnectRef.current) {
      return;
    }

    const attemptMCPAutoConnect = () => {
      if (hasAttemptedMCPAutoConnectRef.current) return;

      if (
        mcpConnectionState.status === "disconnected" ||
        mcpConnectionState.status === "error"
      ) {
        const defaultServerId = serverConfig.defaultServer;
        const defaultServer = defaultServerId
          ? serverConfig.servers[defaultServerId]
          : undefined;

        if (defaultServer) {
          hasAttemptedMCPAutoConnectRef.current = true;
          console.log("[Main] Connecting to MCP server:", defaultServer);
          connectMCP(defaultServer as MCPServer);
        } else {
          console.warn("[Main] No default MCP server configured");
        }
      }
    };

    if (document.readyState === "complete") {
      attemptMCPAutoConnect();
    } else {
      window.addEventListener("load", attemptMCPAutoConnect, { once: true });
      return () => window.removeEventListener("load", attemptMCPAutoConnect);
    }
  }, [mcpConnectionState.status, serverConfig, connectMCP]);

  const handleConnect = async () => {
    if (!agentCardUrl.trim()) {
      alert("Please enter an agent card URL.");
      return;
    }

    let url = agentCardUrl.trim();
    if (!/^[a-zA-Z]+:\/\//.test(url)) {
      url = "http://" + url;
    }

    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
        throw new Error("Protocol must be http or https.");
      }
    } catch (error) {
      alert(
        "Invalid URL. Please enter a valid URL starting with http:// or https://.",
      );
      return;
    }

    setIsA2AConnecting(true);
    addDebugLog("info", "Starting connection", { url, customHeaders });

    try {
      // Fetch agent card
      const agentCardUrlFull = url.endsWith("/")
        ? `${url}.well-known/agent-card.json`
        : `${url}/.well-known/agent-card.json`;

      addDebugLog("info", "Fetching agent card", { agentCardUrlFull });

      const response = await fetch(agentCardUrlFull, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...customHeaders,
        },
        mode: "cors",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch agent card: ${response.status} ${response.statusText}`,
        );
      }

      const agentCardData = await response.json();
      addDebugLog("success", "Agent card fetched", agentCardData);
      setAgentCard(agentCardData);

      // Extract A2A endpoint from agent card
      const a2aEndpoint = agentCardData.a2a?.endpoint || `${url}/a2a`;
      setAgentEndpoint(a2aEndpoint);

      // Check if agent supports streaming
      const supportsStreaming = agentCardData.capabilities?.streaming === true;
      addDebugLog("success", "Connected to A2A agent", {
        endpoint: a2aEndpoint,
        supportsStreaming,
      });

      setIsA2AConnected(true);
      setIsA2AConnecting(false);

      // Update active session with agent endpoint
      if (activeSessionId) {
        updateSessionStatus(activeSessionId, "active");
        // Store agent endpoint in session for reconnection
        setSessionAgentEndpoint(activeSessionId, a2aEndpoint);
      }
    } catch (error) {
      setIsA2AConnecting(false);
      addDebugLog("error", "Connection failed", { error });
      alert(
        `Connection failed: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const handlePromptSubmit = async (
    prompt: string,
    template?: PromptTemplate,
    parameters?: Record<string, string>,
  ) => {
    if (!prompt.trim() || !isA2AConnected || !activeSessionId || !agentEndpoint)
      return;

    // Hide splash screen on first message
    if (showSplash) {
      setShowSplash(false);
    }

    const sanitizedMessage = DOMPurify.sanitize(prompt);
    if (!sanitizedMessage.trim()) {
      return;
    }

    // Merge template parameters with message metadata
    const combinedMetadata = {
      ...messageMetadata,
      ...(parameters || {}),
    };

    console.log(
      "[Main] Prompt submitted:",
      prompt,
      "Session:",
      activeSessionId,
    );

    // Add user message to session
    addMessageToSession(activeSessionId, {
      sender: "user",
      content: sanitizedMessage,
    });

    // Update session status
    updateSessionStatus(activeSessionId, "working");

    // Store agent endpoint in session for future reconnection
    setSessionAgentEndpoint(activeSessionId, agentEndpoint);

    // Get session
    const session = activeSession!;
    if (!session) return;

    // Update session with agent endpoint if needed
    const updatedSession = {
      ...session,
      agentEndpoint: session.agentEndpoint || agentEndpoint,
    };

    // Send message via A2A handler (router will choose Chat or Workflow handler)
    const callbacks = createA2ACallbacks({
      sessionId: activeSessionId,
      sessions,
      sessionsWithCompleteDelegations,
      addMessageToSession,
      updateMessageInSession,
      updateSessionStatus,
      setSessionContextId,
      addTask,
      updateTaskState,
      mapA2AStateToTaskState,
      onChildTaskDetected: handleChildTask,
      addDebugLog,
    });

    await sendA2AMessage(
      updatedSession,
      callbacks,
      sanitizedMessage,
      combinedMetadata,
    );
    };

  const handleSwitchSession = useCallback(
    (sessionId: string) => {
      switchSession(sessionId);

      // Reset overview when switching sessions (user must explicitly click to view it)
      setShowOverview(false);

      // Check if the session we're switching to has messages
      const targetSession = sessions[sessionId];
      if (targetSession && targetSession.messages.length === 0) {
        setShowSplash(true);
      } else {
        setShowSplash(false);
      }

      // Check if session needs reconnection
      const session = sessions[sessionId];
      if (
        session &&
        session.contextId &&
        agentEndpoint &&
        session.tasks.length > 0
      ) {
        const needsReconnection =
          (session.status === "working" || session.status === "waiting") &&
          !isProcessing(sessionId);

        // Don't reconnect to main chat sessions
        if (needsReconnection && !session.isMainChat) {
          console.log("[Main] Reconnecting to child session:", sessionId);
          addDebugLog("info", "Reconnecting to incomplete child session", {
            sessionId,
            status: session.status,
            contextId: session.contextId,
          });

          // Clear messages for child sessions before reconnecting
          // UNLESS they have complete delegations waiting for Continue
          if (session.parentSessionId && !sessionsWithCompleteDelegations.has(sessionId)) {
            console.log('[Main - Switch] Clearing messages from child session before reconnect:', sessionId);
            clearSessionMessages(sessionId);
          } else if (session.parentSessionId && sessionsWithCompleteDelegations.has(sessionId)) {
            console.log('[Main - Switch] NOT clearing messages - session has complete delegations waiting for Continue');
          }

          // Reconnect to the stream
          const latestIncompleteTaskId = getLatestIncompleteTaskId(sessionId);
          const targetSession = sessions[sessionId];
          
          if (!targetSession) return;

          const lastMessageIdRef = { current: lastMessageIdRefs.current.get(sessionId) || null };

          const callbacks = createA2ACallbacks({
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
            onChildTaskDetected: handleChildTask,
            addDebugLog,
            lastMessageIdRef,
          });

          // Update ref when message ID changes
          const originalOnMessage = callbacks.onMessage;
          callbacks.onMessage = (msgSessionId, messageId, content, sender, updates) => {
            const result = originalOnMessage(msgSessionId, messageId, content, sender, updates);
            if (result) {
              lastMessageIdRefs.current.set(msgSessionId, result);
            }
            return result;
          };

          reconnectToStream(targetSession, callbacks);
        }
      }
    },
    [
      switchSession,
      sessions,
      agentEndpoint,
      isProcessing,
      reconnectToStream,
      addMessageToSession,
      updateMessageInSession,
      clearSessionMessages,
      updateSessionStatus,
      setSessionContextId,
      addTask,
      updateTaskState,
      getLatestIncompleteTaskId,
      mapA2AStateToTaskState,
      handleChildTask,
      addDebugLog,
    ],
  );

  const handleCloseSession = (sessionId: string) => {
    // Remove from complete delegations set if present
    setSessionsWithCompleteDelegations(prev => {
      const newSet = new Set(prev);
      newSet.delete(sessionId);
      return newSet;
    });

    closeSession(sessionId);
    // Note: After closing, useEffect will handle showing splash if needed
  };

  const handleCreateSession = () => {
    const newSessionId = createSession({
      type: "conversation",
      title: "New Conversation",
    });
    // New sessions have no messages, so splash will be shown by useEffect
    setShowSplash(true);
  };

  // Handle navigation to parent session (from child delegation view)
  const handleNavigateToParent = useCallback(() => {
    if (!activeSessionId) return;

    const currentSession = sessions[activeSessionId];
    if (!currentSession?.parentSessionId) return;

    console.log("[Main] User clicked Continue - checking for dashboard artifacts");

    // Check if we have dashboard artifacts in any message
    const hasDashboardArtifacts = currentSession.messages.some((msg: any) =>
      msg.artifacts?.["strategy-dashboard-display"]
    );

    if (!hasDashboardArtifacts) {
      console.log("[Main] No dashboard artifacts found - need to fetch from server");
      // TODO: Could trigger a refresh here if needed
    }

    // Remove this session from the set of sessions with complete delegations
    setSessionsWithCompleteDelegations(prev => {
      const newSet = new Set(prev);
      newSet.delete(activeSessionId);
      return newSet;
    });

    // Remove ALL messages with delegation artifacts from this session
    // This prevents them from being saved to localStorage and showing up on reconnect
    removeDelegationMessages(activeSessionId);

    // Update the session status to completed - this moves it to "Completed Strategies"
    // Force the status update to ensure it sticks (prevent any overwrites from status callbacks)
    console.log("[Main] Updating session status to completed (forced):", activeSessionId);
    updateSessionStatus(activeSessionId, "completed", true);

    // Show the overview in the current session
    console.log("[Main] Setting showOverview to true");
    setShowOverview(true);
  }, [activeSessionId, sessions, removeDelegationMessages, updateSessionStatus]);

  // Handle user interaction from custom components
  const handleUserAction = useCallback(
    async (data: any) => {
      if (!activeSessionId || !agentEndpoint) {
        console.error(
          "[Main] Cannot send user action - no active session or endpoint",
        );
        return;
      }

      const session = activeSession!;
      if (!session) return;

      // Check if this is a delegation submission
      if (data.delegations && Array.isArray(data.delegations)) {
        console.log("[Main] Delegation submission detected - marking session as having complete delegations");
        setSessionsWithCompleteDelegations(prev => new Set(prev).add(activeSessionId));
      }

      console.log("[Main] User action from component:", data);
      addDebugLog("info", "User interaction from component", {
        sessionId: activeSessionId,
        data,
      });

      try {
        const callbacks = createA2ACallbacks({
          sessionId: activeSessionId,
          sessions,
          sessionsWithCompleteDelegations,
          addMessageToSession,
          updateMessageInSession,
          updateSessionStatus,
          setSessionContextId,
          addTask,
          updateTaskState,
          mapA2AStateToTaskState,
          onChildTaskDetected: handleChildTask,
          addDebugLog,
        });

        await sendToActiveTask(
          session,
          callbacks,
          data,
        );
        addDebugLog("success", "User interaction sent successfully", {
          sessionId: activeSessionId,
        });
      } catch (error) {
        addDebugLog("error", "Failed to send user interaction", {
          error,
        });
      }
    },
    [
      activeSessionId,
      agentEndpoint,
      getSessionContextId,
      sendToActiveTask,
      addDebugLog,
      addMessageToSession,
      updateMessageInSession,
      updateSessionStatus,
    ],
  );

  return (
    <div className="flex h-screen bg-[#0a0a0a] p-4">
      {/* Container with padding */}
      <div className="flex flex-1 bg-[#1a1a1a] rounded-lg overflow-hidden">
        {/* Sidebar */}
        <AppSidebar
          isA2AConnected={isA2AConnected}
          isA2AConnecting={isA2AConnecting}
          mcpConnectionStatus={mcpConnectionState.status}
          mcpToolsCount={mcpConnectionState.tools.length}
          mcpPromptsCount={mcpConnectionState.prompts.length}
          mcpResourcesCount={mcpConnectionState.resources.length}
          mcpTemplatesCount={mcpConnectionState.resourceTemplates.length}
          onShowConnection={() => setShowConnection(!showConnection)}
          onShowSettings={() => setShowSettings(!showSettings)}
          showConnection={showConnection}
          showSettings={showSettings}
          onShowDebug={() => setShowDebugModal(true)}
          debugLogsCount={debugLogs.length}
          sessions={sessions}
          activeSessionId={activeSessionId}
          sessionOrder={sessionOrder}
          onSwitchSession={handleSwitchSession}
          onCloseSession={handleCloseSession}
          onCreateSession={handleCreateSession}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          {/* Connection Panel - Collapsible */}
          {showConnection && (
            <Card
              className="m-4 mb-0"
              style={{ backgroundColor: "#2a2a2a", border: "none" }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm">
                  Agent Connection
                </CardTitle>
                <CardDescription className="text-gray-400 text-xs">
                  Connect to an A2A agent to start communicating
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Agent Card URL (e.g., https://dev.emberai.xyz)"
                    value={agentCardUrl}
                    onChange={(e) => setAgentCardUrl(e.target.value)}
                    disabled={isA2AConnecting}
                    className="flex-1"
                    style={{
                      backgroundColor: "#1a1a1a",
                      borderColor: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "none",
                    }}
                  />
                  <Button
                    onClick={handleConnect}
                    disabled={isA2AConnecting || !agentCardUrl.trim()}
                    style={{
                      backgroundColor: "#FD6731",
                      borderColor: "#FD6731",
                      border: "none",
                    }}
                  >
                    {isA2AConnecting ? "Connecting..." : "Connect"}
                  </Button>
                </div>

                {isA2AConnected && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="success"
                      className="flex items-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Connected
                    </Badge>
                    {agentCard && (
                      <span className="text-sm text-gray-400">
                        Agent: {agentCard.name} v{agentCard.version}
                      </span>
                    )}
                  </div>
                )}

                {validationErrors.length > 0 && (
                  <div className="mt-2 p-3 bg-yellow-900/20 border-none rounded-md">
                    <h4 className="text-yellow-400 font-medium mb-2 text-xs">
                      Validation Warnings:
                    </h4>
                    <ul className="text-xs text-yellow-300 space-y-1">
                      {validationErrors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Settings Panel - Collapsible */}
          {showSettings && (
            <div className="m-4 mb-0">
              <SettingsPanel
                customHeaders={customHeaders}
                setCustomHeaders={setCustomHeaders}
                messageMetadata={messageMetadata}
                setMessageMetadata={setMessageMetadata}
              />
            </div>
          )}

          {/* Main view - Splash, Chat, or Overview */}
          <div
            className="flex-1 flex flex-col"
            style={{ minHeight: 0, overflow: "hidden" }}
          >
            {(showSplash || !activeSession) && !activeSession?.parentSessionId ? (
              <SplashScreen
                onSubmit={(message) => handlePromptSubmit(message)}
              />
            ) : (
              (() => {
                // Check if we should show the overview
                const lastMessage =
                  activeSession.messages[activeSession.messages.length - 1];
                const hasStrategyDashboard =
                  lastMessage?.artifacts?.["strategy-dashboard-display"];
                const canShowOverview =
                  hasStrategyDashboard && !lastMessage.awaitingUserAction;

                if (canShowOverview && showOverview && lastMessage.artifacts) {
                  // Show overview instead of chat
                  return (
                    <StrategyOverview
                      artifacts={lastMessage.artifacts}
                      onToggleView={() => setShowOverview(false)}
                    />
                  );
                }

                // Show regular chat interface
                return (
                  <>
                    {/* View Dashboard button hidden per user request */}
                    {/* {canShowOverview && (
                      <div className="flex-shrink-0 px-8 pt-6 pb-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowOverview(true)}
                          className="text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
                        >
                          <svg
                            className="w-4 h-4 mr-2"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <rect
                              x="2"
                              y="2"
                              width="5"
                              height="5"
                              rx="1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="9"
                              y="2"
                              width="5"
                              height="5"
                              rx="1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="2"
                              y="9"
                              width="5"
                              height="5"
                              rx="1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="9"
                              y="9"
                              width="5"
                              height="5"
                              rx="1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                          </svg>
                          View Dashboard
                        </Button>
                      </div>
                    )} */}
                    <div
                      className={`flex-1 overflow-y-auto smooth-transition ${!!activeSession.parentSessionId ? '' : 'space-y-4 p-6'}`}
                      style={{ backgroundColor: "#1a1a1a", minHeight: 0 }}
                    >
                      {(() => {
                        // Check if child session should show overview
                        if (activeSession.parentSessionId && showOverview) {
                          const messageWithDashboard = activeSession.messages.find((msg: any) =>
                            msg.artifacts?.["strategy-dashboard-display"]
                          );

                          if (messageWithDashboard?.artifacts) {
                            return (
                              <StrategyOverview
                                artifacts={messageWithDashboard.artifacts}
                                onToggleView={() => setShowOverview(false)}
                              />
                            );
                          }
                        }

                        // Render messages
                        return activeSession.messages.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-center text-gray-400">
                            <div>
                              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>
                                {activeSession.parentSessionId
                                  ? "Loading workflow..."
                                  : "No messages yet. Start chatting with the agent."}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <MessageList
                            messages={activeSession.messages}
                            isChildSession={!!activeSession.parentSessionId}
                            onUserAction={handleUserAction}
                            onNavigate={switchSession}
                            workflowChildSessions={workflowChildSessions}
                            sessions={sessions}
                            sessionOrder={sessionOrder}
                            sessionsWithCompleteDelegations={sessionsWithCompleteDelegations}
                            activeSessionId={activeSessionId}
                            onNavigateToParent={handleNavigateToParent}
                          />
                        );
                      })()}
                      <div ref={messagesEndRef} />
                    </div>
                  </>
                );
              })()
            )}
          </div>

          {/* Chat Input - Only show for main chat or when not in overview mode */}
          {(() => {
            const lastMessage =
              activeSession?.messages[activeSession.messages.length - 1];
            const hasStrategyDashboard =
              lastMessage?.artifacts?.["strategy-dashboard-display"];
            const canShowOverview =
              hasStrategyDashboard && !lastMessage?.awaitingUserAction;

            // Don't show input when in overview mode
            if (canShowOverview && showOverview) return null;

            // Only show chat input for chat sessions (not workflows)
            // Workflows have parentSessionId or type === "tool-execution"
            if (!activeSession) return null;
            const isWorkflow = activeSession.parentSessionId || activeSession.type === "tool-execution";
            if (isWorkflow) {
              return null;
            }

            return (
              <div
                className="relative p-4 bg-[#1a1a1a]"
                style={{ zIndex: 10, flexShrink: 0 }}
              >
                <ConversationalPromptInput
                  onSubmit={handlePromptSubmit}
                  placeholder="Type your message or use a prompt template..."
                  handleCompletion={handleCompletion}
                  completionsSupported={
                    completionsSupported &&
                    mcpConnectionState.status === "connected"
                  }
                  isConnected={mcpConnectionState.status === "connected"}
                  disabled={!isA2AConnected || !activeSession}
                  mcpPrompts={mcpConnectionState.prompts}
                  onGetPrompt={getPrompt}
                />
              </div>
            );
          })()}
        </div>
      </div>

      {/* Debug Modal */}
      {process.env.NEXT_PUBLIC_DEBUG_MODE === 'true' && (
        <DebugModal
          isOpen={showDebugModal}
          onClose={() => setShowDebugModal(false)}
          logs={debugLogs}
          onClearLogs={clearDebugLogs}
        />
      )}
    </div>
  );
}
