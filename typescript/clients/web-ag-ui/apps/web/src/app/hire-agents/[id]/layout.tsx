/**
 * Layout for agent detail pages.
 *
 * Agent context is automatically derived from the URL path by AgentContext
 * and CopilotKitWithDynamicAgent. This layout just renders children.
 *
 * The URL path (e.g., /hire-agents/agent-polymarket) determines:
 * 1. Which LangGraph backend receives requests (via CopilotKitWithDynamicAgent)
 * 2. Which agent state is managed (via AgentContext's useAgentIdFromUrl)
 */
export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
