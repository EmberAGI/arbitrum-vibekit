"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useMcp } from "use-mcp/react";
import { DynamicToolWithApprovalView } from "@/components";

// Type for JSON Schema properties
type JsonSchemaProperty = {
  type: string;
  description?: string;
  enum?: string[];
  pattern?: string;
  format?: string;
  default?: unknown;
};

type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

function ChatPage() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("darkMode");
      return saved === "true";
    }
    return false;
  });

  // Handle dark mode changes
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add("dark");
      localStorage.setItem("darkMode", "true");
    } else {
      html.classList.remove("dark");
      localStorage.setItem("darkMode", "false");
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Get MCP server URL from current domain + /mcp
  const mcpUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/mcp`;
    }
    return process.env.NEXT_PUBLIC_MCP_URL || "http://localhost:3012/mcp";
  }, []);

  // Chatbox state using Vercel AI SDK v6
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => ({
        "X-MCP-URL": mcpUrl,
      }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const chatMessages = chatHelpers.messages;
  const chatStatus = chatHelpers.status;
  const chatError = chatHelpers.error;
  const isChatLoading = chatStatus !== "ready";

  // Access sendMessage from chatHelpers
  const sendChatMessage = (chatHelpers as any).sendMessage;
  const addToolApprovalResponse = (chatHelpers as any).addToolApprovalResponse;

  // Local input state to ensure typing works regardless of hook internals
  const [localChatInput, setLocalChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Connect to MCP server
  const {
    state: mcpState,
    tools,
    resources,
    prompts,
    error: mcpError,
    retry: retryMcp,
    disconnect: disconnectMcp,
    authenticate: authenticateMcp,
    callTool,
  } = useMcp({
    url: mcpUrl,
    clientName: "Para MCP Server Chat",
    autoReconnect: true,
  });

  const [showToolsList, setShowToolsList] = useState<boolean>(false);
  const [toolFormValues, setToolFormValues] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [toolCallResults, setToolCallResults] = useState<
    Record<string, { loading: boolean; result?: unknown; error?: string }>
  >({});

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Handle tool form value changes
  const handleToolFormChange = (
    toolName: string,
    fieldName: string,
    value: unknown,
  ) => {
    setToolFormValues((prev) => ({
      ...prev,
      [toolName]: {
        ...prev[toolName],
        [fieldName]: value,
      },
    }));
  };

  // Handle tool call
  const handleCallTool = async (toolName: string) => {
    setToolCallResults((prev) => ({
      ...prev,
      [toolName]: { loading: true },
    }));

    try {
      const formData = toolFormValues[toolName] || {};
      const result = await callTool(toolName, formData);
      setToolCallResults((prev) => ({
        ...prev,
        [toolName]: { loading: false, result },
      }));
    } catch (error) {
      setToolCallResults((prev) => ({
        ...prev,
        [toolName]: {
          loading: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }));
    }
  };

  // Render form field based on schema property
  const renderFormField = (
    toolName: string,
    fieldName: string,
    property: JsonSchemaProperty,
    isRequired: boolean,
  ) => {
    const value = toolFormValues[toolName]?.[fieldName] ?? "";

    if (property.enum) {
      // Render select for enum fields
      return (
        <div key={fieldName} className="space-y-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-200">
            {fieldName}
            {isRequired && <span className="text-red-500">*</span>}
            {property.description && (
              <span className="text-gray-500 dark:text-gray-300 ml-1">
                ({property.description})
              </span>
            )}
          </label>
          <select
            value={String(value)}
            onChange={(e) =>
              handleToolFormChange(toolName, fieldName, e.target.value)
            }
            className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
            required={isRequired}
          >
            <option value="">Select...</option>
            {property.enum.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // Render input for string fields
    return (
      <div key={fieldName} className="space-y-1">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {fieldName}
          {isRequired && <span className="text-red-500">*</span>}
          {property.description && (
            <span className="text-gray-500 dark:text-gray-500 ml-1">
              ({property.description})
            </span>
          )}
        </label>
        <input
          type={property.format === "uri" ? "url" : "text"}
          value={String(value)}
          onChange={(e) =>
            handleToolFormChange(toolName, fieldName, e.target.value)
          }
          pattern={property.pattern}
          placeholder={property.description || fieldName}
          className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
          required={isRequired}
        />
        {property.pattern && (
          <div className="text-xs text-gray-500 dark:text-gray-300">
            Pattern: {property.pattern}
          </div>
        )}
      </div>
    );
  };

  // Render form based on input schema
  const renderToolForm = (tool: { name: string; inputSchema?: unknown }) => {
    if (!tool.inputSchema) return null;

    try {
      const schema = tool.inputSchema as JsonSchema;
      if (schema.type !== "object" || !schema.properties) return null;

      const properties = schema.properties;
      const required = schema.required || [];
      const callState = toolCallResults[tool.name];

      return (
        <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">
            Call Tool
          </div>
          <div className="space-y-2">
            {Object.entries(properties).map(([fieldName, property]) =>
              renderFormField(
                tool.name,
                fieldName,
                property,
                required.includes(fieldName),
              ),
            )}
            <button
              type="button"
              onClick={() => handleCallTool(tool.name)}
              disabled={callState?.loading || mcpState !== "ready"}
              className="w-full mt-2 px-3 py-1.5 text-xs rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {callState?.loading ? "Calling..." : `Call ${tool.name}`}
            </button>
            {callState?.result !== undefined &&
              (() => {
                // Extract content[0].text if available
                const result = callState.result as {
                  content?: Array<{ type: string; text: string }>;
                };
                let displayText = "";

                if (
                  result?.content &&
                  Array.isArray(result.content) &&
                  result.content.length > 0 &&
                  result.content[0]?.text
                ) {
                  const textContent = result.content[0].text;
                  // Try to parse as JSON for pretty printing, fallback to raw text
                  try {
                    const parsed = JSON.parse(textContent);
                    displayText = JSON.stringify(parsed, null, 2);
                  } catch {
                    displayText = textContent;
                  }
                } else {
                  // Fallback to full result if content structure is different
                  displayText = JSON.stringify(callState.result, null, 2);
                }

                return (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 dark:text-gray-300 cursor-pointer">
                      Result
                    </summary>
                    <pre className="mt-2 text-xs bg-green-50 dark:bg-green-900/20 p-2 rounded overflow-auto border border-green-200 dark:border-green-800">
                      {displayText}
                    </pre>
                  </details>
                );
              })()}
            {callState?.error && (
              <div className="mt-2 p-2 text-xs bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
                Error: {callState.error}
              </div>
            )}
          </div>
        </div>
      );
    } catch (error) {
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            MCP Chat & Tools
          </h1>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </div>

        {/* MCP Connection Status */}
        <div className="space-y-2 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-200">
              MCP Server Status:
            </div>
            <div
              className={`text-sm font-medium ${
                mcpState === "ready"
                  ? "text-green-600 dark:text-green-400"
                  : mcpState === "failed"
                    ? "text-red-600 dark:text-red-400"
                    : "text-yellow-600 dark:text-yellow-400"
              }`}
            >
              {mcpState === "ready"
                ? "Connected"
                : mcpState === "failed"
                  ? "Failed"
                  : mcpState === "connecting" || mcpState === "loading"
                    ? "Connecting..."
                    : mcpState === "pending_auth" ||
                        mcpState === "authenticating"
                      ? "Authenticating..."
                      : "Disconnected"}
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 font-mono">
            {mcpUrl}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={retryMcp}
              disabled={
                mcpState === "ready" ||
                mcpState === "connecting" ||
                mcpState === "loading"
              }
              className="text-xs px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={disconnectMcp}
              disabled={mcpState !== "ready"}
              className="text-xs px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Disconnect
            </button>
          </div>
          {mcpError && mcpState !== "ready" && (
            <div className="text-sm text-red-600 dark:text-red-400">
              Error: {mcpError}
            </div>
          )}
          {(mcpState === "failed" || mcpState === "pending_auth") && (
            <div className="flex gap-2">
              {mcpState === "failed" && (
                <button
                  type="button"
                  onClick={retryMcp}
                  className="text-xs px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700"
                >
                  Retry Connection
                </button>
              )}
              <button
                type="button"
                onClick={authenticateMcp}
                className="text-xs px-3 py-1 rounded bg-gray-600 text-white hover:bg-gray-700"
              >
                Authenticate
              </button>
            </div>
          )}
        </div>

        {/* Tools List */}
        {mcpState === "ready" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Available Tools ({tools.length})
                </div>
                <button
                  type="button"
                  onClick={() => setShowToolsList(!showToolsList)}
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {showToolsList ? "Hide" : "Show"}
                </button>
              </div>
              {showToolsList && (
                <>
                  {tools.length > 0 ? (
                    <div className="space-y-2">
                      {tools.map((tool) => (
                        <div
                          key={tool.name}
                          className="p-3 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        >
                          <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {tool.name}
                          </div>
                          {tool.description && (
                            <div className="text-xs text-gray-600 dark:text-gray-200 mt-1">
                              {tool.description}
                            </div>
                          )}
                          {tool.inputSchema && (
                            <>
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 dark:text-gray-300 cursor-pointer">
                                  Input Schema
                                </summary>
                                <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-auto">
                                  {JSON.stringify(tool.inputSchema, null, 2)}
                                </pre>
                              </details>
                              {renderToolForm(tool)}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-300">
                      No tools available
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Resources List */}
            {resources.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Available Resources ({resources.length})
                </div>
                <div className="space-y-1">
                  {resources.map((resource) => (
                    <div
                      key={resource.uri}
                      className="p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    >
                      <div className="font-mono text-xs text-gray-900 dark:text-gray-100">
                        {resource.uri}
                      </div>
                      {resource.name && (
                        <div className="text-xs text-gray-600 dark:text-gray-200 mt-1">
                          {resource.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prompts List */}
            {prompts.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Available Prompts ({prompts.length})
                </div>
                <div className="space-y-1">
                  {prompts.map((prompt) => (
                    <div
                      key={prompt.name}
                      className="p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    >
                      <div className="font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {prompt.name}
                      </div>
                      {prompt.description && (
                        <div className="text-xs text-gray-600 dark:text-gray-200 mt-1">
                          {prompt.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mcpState !== "ready" && mcpState !== "failed" && (
          <div className="text-sm text-gray-500 dark:text-gray-300">
            Connecting to MCP server...
          </div>
        )}

        {/* Chatbox */}
        <div className="mt-8 pt-8 border-t border-gray-300 dark:border-gray-600">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            MCP Chat
          </h2>
          <div className="flex flex-col h-[500px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                  <p className="text-sm">
                    Start a conversation with the AI assistant
                  </p>
                  <p className="text-xs mt-2">
                    Ask about available MCP tools or request to call a specific
                    tool
                  </p>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === "user"
                          ? "bg-orange-600 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {message.parts.map((part, index) => {
                          if (part.type === "text") {
                            return (
                              <ReactMarkdown
                                key={index}
                                className="markdown-content"
                                components={{
                                  p: ({ children }) => (
                                    <p className="mb-2 last:mb-0">{children}</p>
                                  ),
                                  h1: ({ children }) => (
                                    <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">
                                      {children}
                                    </h3>
                                  ),
                                  ul: ({ children }) => (
                                    <ul className="list-disc list-inside mb-2 space-y-1">
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal list-inside mb-2 space-y-1">
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li className="ml-2">{children}</li>
                                  ),
                                  code: ({ children, className, ...props }) => {
                                    const inline = (
                                      props as { inline?: boolean }
                                    ).inline;
                                    if (inline) {
                                      return (
                                        <code className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">
                                          {children}
                                        </code>
                                      );
                                    }
                                    return (
                                      <code className="block bg-gray-200 dark:bg-gray-800 p-2 rounded text-xs font-mono overflow-x-auto mb-2">
                                        {children}
                                      </code>
                                    );
                                  },
                                  pre: ({ children }) => (
                                    <pre className="mb-2">{children}</pre>
                                  ),
                                  blockquote: ({ children }) => (
                                    <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 italic my-2">
                                      {children}
                                    </blockquote>
                                  ),
                                  a: ({ children, href }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline hover:no-underline"
                                    >
                                      {children}
                                    </a>
                                  ),
                                  strong: ({ children }) => (
                                    <strong className="font-semibold">
                                      {children}
                                    </strong>
                                  ),
                                  em: ({ children }) => (
                                    <em className="italic">{children}</em>
                                  ),
                                }}
                              >
                                {part.text}
                              </ReactMarkdown>
                            );
                          }
                          if (part.type === "dynamic-tool") {
                            return (
                              <DynamicToolWithApprovalView
                                key={index}
                                invocation={part}
                                addToolApprovalResponse={
                                  addToolApprovalResponse
                                }
                              />
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {chatError && (
                <div className="flex justify-start">
                  <div className="bg-red-100 dark:bg-red-900/20 rounded-lg px-4 py-2 max-w-[80%]">
                    <div className="text-sm text-red-700 dark:text-red-400">
                      Error: {chatError.message || "Failed to send message"}
                    </div>
                  </div>
                </div>
              )}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      Thinking...
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-gray-300 dark:border-gray-600 p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!localChatInput.trim() || isChatLoading) return;

                  // Use sendMessage with text format (AI SDK v5+)
                  if (sendChatMessage) {
                    sendChatMessage({ text: localChatInput });
                    setLocalChatInput("");
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={localChatInput}
                  onChange={(e) => setLocalChatInput(e.target.value)}
                  placeholder="Type a message or ask about MCP tools..."
                  disabled={isChatLoading}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !localChatInput.trim()}
                  className="px-6 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isChatLoading ? "Sending..." : "Send"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
