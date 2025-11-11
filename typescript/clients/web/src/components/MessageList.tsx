/**
 * Message List Component
 * 
 * Renders messages for a session
 */

import React from "react";
import { MessageSquare, Bot, User, AlertCircle, Loader } from "lucide-react";
import { StreamingMessage } from "@/components/StreamingMessage";
import { ToolResultRenderer } from "@/components/ToolResultRenderer";
import { WorkflowApprovalHandler } from "@/components/tools/WorkflowApprovalHandler";
import { SessionMessage } from "@/lib/types/session";

interface MessageListProps {
  messages: SessionMessage[];
  isChildSession: boolean;
  onUserAction: (data: any) => Promise<void>;
  onNavigate: (sessionId: string) => void;
  workflowChildSessions: Record<string, string>;
  sessions: Record<string, any>;
  sessionOrder: string[];
  sessionsWithCompleteDelegations: Set<string>;
  activeSessionId: string | null;
  onNavigateToParent: () => void;
}

export function MessageList({
  messages,
  isChildSession,
  onUserAction,
  onNavigate,
  workflowChildSessions,
  sessions,
  sessionOrder,
  sessionsWithCompleteDelegations,
  activeSessionId,
  onNavigateToParent,
}: MessageListProps) {
  // Handle empty message state
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center text-gray-400">
        <div>
          <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>
            {isChildSession
              ? "Loading workflow..."
              : "No messages yet. Start chatting with the agent."}
          </p>
        </div>
      </div>
    );
  }

  // For child sessions: render only artifacts, centered
  if (isChildSession) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="w-full max-w-2xl px-6">
          {messages.map((message) => {
            const artifacts: React.ReactNode[] = [];

            // Tool Invocation (backward compatibility)
            if (message.toolInvocation && !message.artifacts) {
              artifacts.push(
                <ToolResultRenderer
                  key={`tool-${message.id}`}
                  toolName={message.toolInvocation.toolName}
                  result={
                    message.toolInvocation.output ||
                    message.toolInvocation.input
                  }
                  onUserAction={onUserAction}
                  onNavigate={onNavigate}
                  workflowChildSessions={workflowChildSessions}
                  sessions={sessions}
                  sessionOrder={sessionOrder}
                />
              );
            }

            // Multiple Artifacts (new multi-artifact support)
            if (message.artifacts && Object.keys(message.artifacts).length > 0) {
              Object.values(message.artifacts)
                .filter((artifact: any) => {
                  const overviewArtifacts = [
                    "strategy-dashboard-display",
                    "transaction-history-display",
                    "strategy-settings-display",
                    "strategy-policies-display",
                  ];

                  if (overviewArtifacts.includes(artifact.artifactId)) {
                    return false;
                  }

                  const skipArtifacts = [
                    "delegations-display",
                    "delegations-data",
                  ];
                  if (skipArtifacts.includes(artifact.artifactId)) {
                    return false;
                  }

                  return true;
                })
                .forEach((artifact: any) => {
                  artifacts.push(
                    <ToolResultRenderer
                      key={artifact.artifactId}
                      toolName={artifact.toolName}
                      result={artifact.output || artifact.input}
                      isLoading={artifact.isLoading}
                      onUserAction={onUserAction}
                      onNavigate={onNavigate}
                      workflowChildSessions={workflowChildSessions}
                      sessions={sessions}
                      sessionOrder={sessionOrder}
                    />
                  );
                });
            }

            // Workflow Approval Handler
            const hasDelegationDisplay =
              message.artifacts?.["delegations-display"];
            const hasDelegationData = message.artifacts?.["delegations-data"];
            const hasAwaitingAction =
              message.awaitingUserAction && message.statusData;
            const isCompleteDelegationSession = activeSessionId
              ? sessionsWithCompleteDelegations.has(activeSessionId)
              : false;

            const shouldRenderWorkflow =
              hasDelegationDisplay ||
              hasDelegationData ||
              hasAwaitingAction ||
              isCompleteDelegationSession;

            if (shouldRenderWorkflow) {
              artifacts.push(
                <WorkflowApprovalHandler
                  key={`workflow-${message.id}`}
                  schema={
                    message.statusData?.statusMessage?.parts?.[0]?.metadata
                      ?.schema
                  }
                  statusMessage={message.statusData?.statusMessage}
                  artifacts={message.artifacts}
                  onUserAction={onUserAction}
                  onNavigateToParent={onNavigateToParent}
                />
              );
            }

            return artifacts.length > 0 ? (
              <div key={message.id} className="space-y-4">
                {artifacts}
              </div>
            ) : null;
          })}
        </div>
      </div>
    );
  }

  // For regular chat sessions: render normally with text
  return (
    <>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex items-start gap-3 message-fade-in ${
            message.sender === "user" ? "justify-end" : "justify-start"
          }`}
        >
          {message.sender !== "user" && (
            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
              {message.sender === "agent-error" ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : (
                <Bot className="w-4 h-4 text-blue-400" />
              )}
            </div>
          )}

          <div className="max-w-[70%] space-y-2">
            {/* Reasoning Indicator */}
            {message.reasoning && message.isStreaming && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader className="w-4 h-4 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}

            {/* Main Response */}
            {message.content && (
              <StreamingMessage
                content={message.content}
                isStreaming={message.isStreaming || false}
                sender={message.sender}
              />
            )}

            {/* Tool Invocation */}
            {message.toolInvocation && !message.artifacts && (
              <div className="mt-2 component-fade-in">
                <ToolResultRenderer
                  toolName={message.toolInvocation.toolName}
                  result={
                    message.toolInvocation.output ||
                    message.toolInvocation.input
                  }
                  onUserAction={onUserAction}
                  onNavigate={onNavigate}
                  workflowChildSessions={workflowChildSessions}
                  sessions={sessions}
                  sessionOrder={sessionOrder}
                />
              </div>
            )}

            {/* Multiple Artifacts */}
            {message.artifacts &&
              Object.keys(message.artifacts).length > 0 && (
                <div className="mt-2 space-y-2 component-fade-in">
                  {Object.values(message.artifacts)
                    .filter((artifact: any) => {
                      const overviewArtifacts = [
                        "strategy-dashboard-display",
                        "transaction-history-display",
                        "strategy-settings-display",
                        "strategy-policies-display",
                      ];

                      if (overviewArtifacts.includes(artifact.artifactId)) {
                        return false;
                      }

                      const skipArtifacts = [
                        "delegations-display",
                        "delegations-data",
                      ];
                      if (skipArtifacts.includes(artifact.artifactId)) {
                        return false;
                      }

                      return true;
                    })
                    .map((artifact: any) => (
                      <ToolResultRenderer
                        key={artifact.artifactId}
                        toolName={artifact.toolName}
                        result={artifact.output || artifact.input}
                        isLoading={artifact.isLoading}
                        onUserAction={onUserAction}
                        onNavigate={onNavigate}
                        workflowChildSessions={workflowChildSessions}
                        sessions={sessions}
                        sessionOrder={sessionOrder}
                      />
                    ))}
                </div>
              )}

            {/* Workflow Approval Handler */}
            {(() => {
              const hasDelegationDisplay =
                message.artifacts?.["delegations-display"];
              const hasDelegationData =
                message.artifacts?.["delegations-data"];
              const hasAwaitingAction =
                message.awaitingUserAction && message.statusData;
              const shouldRender =
                hasDelegationDisplay ||
                hasDelegationData ||
                hasAwaitingAction;

              return shouldRender ? (
                <div className="mt-2 component-fade-in">
                  <WorkflowApprovalHandler
                    schema={
                      message.statusData?.statusMessage?.parts?.[0]?.metadata
                        ?.schema
                    }
                    statusMessage={message.statusData?.statusMessage}
                    artifacts={message.artifacts}
                    onUserAction={onUserAction}
                    onNavigateToParent={onNavigateToParent}
                  />
                </div>
              ) : null;
            })()}

            {/* Metadata */}
            {message.sender !== "user" && (
              <div className="flex items-center justify-between px-4">
                <span className="text-xs text-gray-400">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {message.sender === "user" && (
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      ))}
    </>
  );
}



