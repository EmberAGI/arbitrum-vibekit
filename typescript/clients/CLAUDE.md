# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EmberAi A2A Client - Next.js chat interface for Agent-to-Agent (A2A) communication with MCP integration. Enables real-time streaming conversations with A2A agents, workflow delegation, transaction signing, and DeFi strategy management.

**Tech Stack:**
- **Framework:** Next.js 15.5.2 (App Router, SSR enabled)
- **UI:** React 19.1.0 • TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS v4 • shadcn/ui (New York style) • Radix UI primitives
- **Icons:** Lucide React
- **Web3:** Wagmi v2.17.5 • RainbowKit v2.2.8 • viem v2.38.0
- **Protocols:** @a2a-js/sdk v0.3.4 • @modelcontextprotocol/sdk v1.19.1
- **Utils:** class-variance-authority • clsx • tailwind-merge • zod v3.25.76

## Architecture

```
Frontend (Next.js) ↔ MCP Proxy API ↔ MCP Server
       ↓
  A2A Agent (JSONRPC over HTTP + SSE streaming)
```

### Core Patterns

**1. Session Management** (src/lib/hooks/useSessionManager.ts)
- Multi-session state in `sessionStorage` with 1s debounce auto-save
- Types: `conversation` (user chats), `tool-execution` (workflows)
- Each session stores: `contextId` (A2A session ID), `agentEndpoint`, `tasks[]`, `messages[]`
- Temporary sessions: `isTemporary: true` (excluded from persistence)

**2. A2A Protocol** (src/lib/hooks/useA2ASession.ts)
- JSONRPC 2.0 over HTTP with SSE streaming
- Methods:
  - `sendMessage()`: New user message → creates task
  - `reconnectToStream()`: Resubscribe to task via `tasks/resubscribe` (page reload/tab switch)
  - `sendToActiveTask()`: Send user interactions (approvals, forms) using contextId
- SSE events: `task`, `artifact-update`, `status-update` (detects child tasks via `referenceTaskIds`)

**3. Child Task Workflow**
- Agent dispatches workflow → `status-update` contains `referenceTaskIds[]`
- `onChildTaskDetected` creates temporary tab → immediately calls `reconnectToStream(childTaskId)`
- Child inherits parent's `contextId` + `agentEndpoint`

**4. Artifacts**
- Structured data in `message.artifacts: Record<artifactId, data>`
- Append mode: `append: true` merges, `false` replaces
- Rendered via `ToolResultRenderer` → `toolComponentLoader.ts` mapping

**5. MCP Proxy** (src/app/api/mcp/route.ts)
- Next.js API proxies frontend ↔ MCP server
- Session-based transports via `mcp-session-id` header
- Supports `streamable-http` and `stdio`

## Commands

```bash
npm install              # Install dependencies
npm run dev             # Development server (localhost:3000)
npm run build           # Production build
npm run lint            # Run linter
```

**Default A2A Agent:** http://localhost:3001 (fetches `/.well-known/agent-card.json`)

## Conventions

### TypeScript (Strict Mode)
- Export prop interfaces as `{ComponentName}Props`
- Use `import type` for types, `@/` alias for imports
- No implicit `any`, explicit types required
- File naming: Components (PascalCase), utils/hooks (camelCase)

### Client Directives
Add `'use client';` for: React hooks, Browser APIs, event handlers, Web3 hooks

### Styling (Dark Mode Only)
- **Primary:** `#FD6731` (EmberAi Orange)
- **Backgrounds:** `#0a0a0a` → `#1a1a1a` → `#2a2a2a`
- **Always use `cn()`** for className merging
- Tailwind classes preferred over inline styles

### Component Templates

**Standard Component:**
```typescript
'use client';

interface MyComponentProps {
  title: string;
  onAction?: (data: any) => Promise<void>;
  className?: string;
}

export function MyComponent({ title, onAction, className }: MyComponentProps) {
  const handleAction = async () => {
    try {
      await onAction?.({ data: 'example' });
    } catch (error) {
      console.error('[MyComponent] Error:', error);
    }
  };

  return <div className={cn('base-classes', className)}>{title}</div>;
}
```

**Radix UI Component (with variants):**
```typescript
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variants = cva("base", {
  variants: { variant: { default: "...", destructive: "..." } },
  defaultVariants: { variant: "default" },
});

const Component = React.forwardRef<HTMLElement, Props>(
  ({ className, variant, ...props }, ref) => (
    <Element className={cn(variants({ variant }), className)} ref={ref} {...props} />
  )
);
Component.displayName = "Component";
```

### Best Practices
- **Error handling:** Always try/catch async, prefix logs `[ComponentName]`
- **Async:** Use async/await, `Promise.allSettled()` for parallel ops
- **Performance:** `useMemo` for computations, `useCallback` for child props
- **State:** `useState` local, `sessionStorage` persistence, `useCallback` memoization

## Key Code Patterns

### Reconnection on Load
```typescript
// Auto-reconnect incomplete sessions (page.tsx:361)
if (session.status === 'working' || session.status === 'waiting') {
  reconnectToStream({
    sessionId, agentEndpoint: session.agentEndpoint,
    contextId: session.contextId, taskId: getLatestIncompleteTaskId(sessionId)
  });
}
```

### Child Task Detection
```typescript
// useA2ASession.ts:478
if (event.status?.message?.referenceTaskIds?.length > 0) {
  onChildTaskDetected(parentSessionId, childTaskId, contextId, metadata);
}
```

### Creating Tool Components
1. Add `src/components/tools/YourTool.tsx` with `data` + `onUserAction` props
2. Register in `src/lib/toolComponentLoader.ts`
3. Export artifact from agent with matching `artifactId`

## Configuration

**Environment:** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=required`

**Tool Config** (src/config/tools.ts):
```typescript
{ id: "toolName", name: "Display Name", category: "categoryId",
  component: "ComponentName", enabled: true }
```

**MCP Servers:** src/config/servers.ts
**RainbowKit:** src/components/Providers.tsx

## Debugging

**Log Prefixes:** `[Main]` `[A2ASession]` `[SessionManager]` `[MCP Proxy]` `[MCP API]`

**Common Issues:**
- **Session not reconnecting:** Verify `contextId`, `taskId`, `agentEndpoint` stored
- **Child task not appearing:** Check `referenceTaskIds` in status-update, `onChildTaskDetected` callback provided
- **Artifacts not rendering:** Confirm `artifactId`, component registered in `toolComponentLoader.ts`

**Debug Modal:** Sidebar → "Debug" button (logs, request/response data, state changes)
