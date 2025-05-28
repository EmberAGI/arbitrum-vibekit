# Vibekit Framework — Consolidated Technical Review

This document condenses all feedback from **ai-feedback.md** into a single, non-duplicative reference. It retains every substantive point while removing repetition.

---

## 1. Executive Summary

Vibekit is a lightweight, protocol-first framework for building AI agents—especially Web3-aware ones—focused on Model Context Protocol (MCP), Google-style Agent-to-Agent (A2A), and x402 monetisation. It delivers excellent developer ergonomics for junior "vibe coders" yet still aspires to enterprise robustness. To reach v1.0 the core must widen MCP/A2A coverage, harden security & testing, and formalise streaming, state and payments.

---

## 2. Key Strengths

1. **Lightweight & Familiar DX**: one-file examples, `startAgent()` bootstrap, Vercel-AI style `generateText` + `tool()` calls, clear error handling (`AgentError`). The core stays tiny yet approachable for vibe coders.
2. **Modularity & Composability**: Agents are both MCP servers and clients; tools are single-responsibility; provider/adapters pattern allows reuse; A2A and the 'Agent-as-a-Tool' model are primary composability options, with future "swarm" or external orchestrators (e.g. LangGraph) offering additional ways to compose agents.
3. **Protocol Alignment**: MCP endpoints already wired; A2A will be exposed in parallel; x402 paywall decorator integrates monetisation; Delegation Toolkit patterns uphold transaction security.
4. **Testability**: Stateless logic inside handlers, optional per-task state, and hook isolation make units easy to mock.
5. **Web3 Focus**: Lessons cover unsigned/relayed txs, caveats, fee handling and QuickNode RPC helpers.
6. **Borrowed Best Practices**: Express-like hooks, Immer for immutable state (as a peer dependency), OpenAI-style guardrails, Vercel AI streaming ethos, and Google A2A envelope ideas.

---

## 3. Major Gaps & Improvement Areas

1. **Incomplete MCP Surface**
   • Tool schemas not exposed in `/mcp/list_tools`.
   • No streaming chunk format or manifest file.
2. **A2A Shortfalls**
   • Missing signed envelopes, ACK/NACK, long-running task polling, resume tokens.
3. **Typed Validation**
   • Zod/JSON-Schema mentioned but not enforced; arg/result types are `any`.
4. **State Management Nuances**
   • Global store is OK but needs _task-scoped namespaces_ to avoid collisions & simplify eviction. Immer should be a **peer dependency** used by state helpers.
5. **Duplicate Utilities Across Agents**
   • Examples show reimplementation of: QuickNode chain mapping, capability caching. These specific utilities are outside Vibekit's direct scope and could be user-provided, separate libraries, or MCP tools.
   • `conversationHistory` management, SSE + MCP server bootstrap, and Stdio MCP client wiring also show duplication and _should_ be addressed by framework helpers (e.g., core state management for history, adapter packages for server/client wiring).
6. **Security Beyond Tx Signing**
   • Input sanitisation, ACLs, rate-limiting, agent identity, abuse prevention only hinted.
7. **Testing & Observability**
   • Absent mock agents, LLM stubs, tracing, OpenTelemetry wiring, end-to-end examples.
8. **Developer Tooling**
   • Lack of CLI scaffolder (`vibe new`), hot-reload, Swagger UI, or test harness.
9. **Documentation Consistency**
   • Docs reference fields (`ctx.taskId`, reducers) not present in code; more diagrams desired.

---

## 4. MCP & A2A Compliance Audit

| Feature                            | Status                                       |
| ---------------------------------- | -------------------------------------------- |
| `/mcp/list_tools` & `/invoke_tool` | ✔ basic                                      |
| Tool JSON Schemas                  | ✖ missing                                    |
| Streaming Responses                | ✖ no SSE/iterable support                    |
| `.well-known/ai-plugin.json`       | ✖ none                                       |
| A2A Envelope (task_id, sig)        | ✖ none                                       |
| Task polling / heartbeat           | ✖ none                                       |
| x402 Invoice JSON                  | ✔ decorator exists but needs standard format |

---

## 5. Architectural Recommendations

1. **Protocol-First Packages**
   • `@vibekit/core`: pure ESM; exports `defineTool`, base `ToolContext` (including access to `conversationHistory` and other task-scoped state), protocol types (MCP/A2A basics), Zod-to-JSON schema helpers, hook mechanism, and task-scoped state helpers (using Immer as peer dep).
   • `@vibekit/express` & `@vibekit/next`: thin HTTP/Edge adapters with built-in SSE routing for MCP/A2A.
2. **Typed Tool Definition**
   ```ts
   export const priceFeed = defineTool({
     name: "price_feed",
     description: "Return latest price",
     schema: z.object({ symbol: z.string() }),
     async *execute({ symbol }) {
       /* stream or return */
     },
   });
   ```
   Auto-publish schema via `/mcp/list_tools`.
3. **Streaming by Default**
   Adopt Vercel AI SDK's `streamText()` & `ReadableStream` helpers; Express adapter switches when `Accept: text/event-stream`.
4. **A2A Transport (Minimal)**
   • Endpoints: `POST /a2a/enqueue`, `GET /a2a/task/:id`.
   • JSON Web Signature envelope: `{id,parentId,from,to,createdAt,payload,sig}`.
5. **State & Memory**
   • Keep a _single_ store but namespace by `taskId`; expose `ctx.memory.get()/set()` and `ctx.history.add()/get()` helpers. `conversationHistory` is a standard part of task-scoped memory. These helpers should use Immer (peer dependency) for state updates.
6. **Shared Agent Utilities**
   • `createMcpSseServer()` (part of `@vibekit/express` or `@vibekit/next`): Bootstraps Express/Next.js with MCP/A2A routes and SSE.
   • Conversational features (like LLM interaction via `generateText`) would leverage the core-managed `conversationHistory` (via `ctx.history`). A `BaseConversationAgent` or specific utilities for this could be user-space or documented recipes, building upon the core history management.
7. **Payment & Security Decorators (Core x402 Support)**
   • `withPaywall(feeSpec)` validates x402 (core feature); `withDelegation()` verifies MetaMask caveats (can be an optional helper/decorator if it brings external dependencies).
   • Decorators should be composable.
8. **Testing Harness**
   • Vitest presets `mockAgent()` / `mockLLM()`; `collectStream()` helper; CLI `vibe test`.
9. **CLI & DX**
   • `vibe new price-agent` scaffolds files; `vibe play` REPL; Swagger at `/docs`.
10. **LangGraph Compatibility (No internal DAG)**
    • Vibekit itself will _not_ implement a graph builder—tools may embed LangGraph as needed. Integration with LangGraph can be achieved by users wrapping Vibekit tools as custom LangGraph nodes (documentation should provide an example).

---

## 6. Immediate Low-Hanging PRs

1. Add `ctx.taskId` and propagate through lifecycle.
2. Swap `any` for Zod-derived generics in `ToolCtx`.
3. Emit JSON Schemas and serve via `/mcp/list_tools`.
4. Implement SSE/iterable streaming for tool results.
5. Stub A2A envelope + in-memory task store.
6. Integrate x402 paywall logic (e.g., `withPaywall` decorator, invoice validation) as a core framework feature.
7. Introduce Vitest and convert lesson snippets into tests.
8. Create CLI scaffold command with ts-morph templates.

---

## 7. Conclusion

Vibekit already nails the **"easy for juniors"** brief and demonstrates thoughtful protocol alignment. To reach full MCP & A2A compliance and production robustness it must:
• formalise schemas & streaming,
• harden security & payments,
• add first-class testing & observability, and
• ship CLI + graph orchestration adapters.
Doing so while staying framework-agnostic will keep Vibekit a nimble, composable choice that can plug into LangGraph, Vercel AI or any future ecosystem with minimal friction.
