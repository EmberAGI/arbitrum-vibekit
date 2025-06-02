# Release Plan: Arbitrum Vibekit Core

This document outlines the staged evolution of the framework, with each release building on the last to deliver increasing capability while maintaining simplicity and rapid iteration.

---

## v1: MCP Server, Skills, Stateless, Agent as Orchestrator **✔️**

**Status:** **DONE ✔️** — The current foundation is complete and nothing is missing from v1.

**Key Features:**

- Expose agent as an MCP server (MCP tools = skills)
- Skills are the only externally visible interface
- Agent acts as orchestrator, interpreting skill requests and calling internal logic
- Stateless: no persistent memory or task state
- Web3 support is core (delegation, unsigned txs, etc.)

**Rationale:**

- Immediate compatibility with LLM clients (Claude, Cursor, etc.)
- Simplicity for junior devs and LLM pair programming
- Fastest path to value and feedback

**Deferred:**

- Internal tool registry
- Stateful tasks, memory, streaming, direct A2A

---

## v2: LLM Integration & Reasoning Engine 🧠

**Key Features:**

- **LLM integration** using dependency injection (any Vercel AI SDK compatible model)
- **LLM-first skills** - handlers are optional, LLM orchestration is the default
- **Manual handler escape hatch** - when provided, bypasses LLM orchestration
- **Minimal context management** - simple `AgentContext<TCustom>` for passing data like tokenMap
- **Context loading on start()** - async context provider function during agent startup
- **VibkitToolDefinition** - tools receive `(args, context)` for stateless execution
- **Tools required per skill** - each skill must define at least one tool for its business logic
- Simple **conversation flow** (single-turn request/response, stateless)

**Architecture Highlights:**

- Skills can omit handlers and rely purely on LLM orchestration
- Mix of LLM and manual skills in the same agent
- Context loaded during `start()`, not `create()` to keep factory method simple
- Tools remain stateless but can access agent-scoped context
- Each skill invocation is independent (no conversation history)

**Example v2 Usage:**

```typescript
// LLM-orchestrated skill (no handler)
const lendingSkill = defineSkill({
  id: "lending",
  tools: [borrowTool, supplyTool], // Required
  // No handler - uses LLM
});

// Manual skill (with handler)
const healthSkill = defineSkill({
  id: "health",
  tools: [], // Can be empty for manual
  handler: async () => createSuccessTask("OK", "health"), // Bypasses LLM
});

// Agent with context
const agent = Agent.create(
  { skills: [lendingSkill, healthSkill] },
  {
    llm: { model: openrouter("gemini-2.5-flash") },
  }
);

await agent.start(3000, async () => ({
  tokenMap: await loadTokenMap(),
}));
```

**Rationale:**

- **LLM-first aligns with v2's primary goal** of adding orchestration
- **Optional handlers reduce boilerplate** while allowing escape hatches
- **Minimal context avoids over-engineering** for unknown requirements
- **Start-time loading** supports async operations naturally
- **Stateless design** keeps complexity low for initial release

**Deferred:**

- Advanced tool registry and adapters (v3)
- Remote MCP tool connections (v3)
- Sophisticated context features (lifecycle hooks, metadata)
- Stateful conversation management (v4)
- Streaming support (v5)

---

## Comprehensive v2 Test Coverage (Post-v3)

To ensure the v2 core is robust and production-ready, the following additional tests should be implemented after v3 is complete. These tests focus on edge cases, error handling, and utility completeness for LLM orchestration, context, validation, and agent robustness.

### LLM Orchestration Edge Cases

- Tool execution failure in LLM path: Simulate a tool's `execute` throwing or rejecting during LLM orchestration. Assert proper error task/message is returned.
- LLM (`generateText`) failure: Simulate `generateText` throwing or rejecting. Assert agent returns a proper error task/message.
- Malformed tool arguments from LLM: Simulate LLM returning tool calls with invalid/malformed arguments. Assert input validation catches this and returns an error.
- Multiple tool calls in a single LLM step: Simulate LLM returning multiple tool calls in one step. Assert all are executed and results handled correctly.
- LLM returns unexpected/empty response: Simulate LLM returning an empty or unexpected response structure. Assert agent returns a fallback message or error.

### A2A Result Extraction

- LLM returns a JSON-encoded Task/Message: Simulate LLM returning a stringified JSON Task or Message. Assert `extractA2AResult` parses and returns the correct structure.
- LLM returns non-JSON text: Simulate LLM returning plain text (not JSON). Assert a valid A2A Message is created with the text.

### Context Handling

- Context not provided: Start agent without a context provider and ensure tools still receive a valid (possibly empty) context object.
- Context provider throws: Simulate the context provider function throwing an error. Assert agent fails to start and error is surfaced.

### Skill/Tool Validation

- Skill with invalid tool (e.g., missing description/parameters/execute): Attempt to define a skill with an invalid tool definition. Assert validation fails.
- Skill with duplicate tool descriptions: Define a skill with two tools having the same description. Assert tool registration and LLM orchestration handle this gracefully.

### Manual Handler Path

- Manual handler throws: Simulate a manual handler throwing an error. Assert error is caught and a proper error task/message is returned.
- Manual handler returns invalid A2A object: Simulate a manual handler returning an invalid object (not a Task/Message). Assert agent returns an error.

### MCP Tool Registration

- Skill with special characters in tags/examples: Register a skill with tags/examples containing XML special characters. Assert `formatToolDescriptionWithTagsAndExamples` escapes or handles them correctly.
- Skill with very large examples/tags: Register a skill with a large number of tags/examples. Assert registration and description formatting work and do not truncate or error.

### Utility Functions

- getInputMimeType with nested/complex schemas: Test with nested Zod objects/arrays to ensure correct MIME type is derived.

### General Robustness

- Agent restart: Start and stop the agent multiple times in a row. Assert resources are cleaned up and no errors are thrown.
- Concurrent skill invocations: Simulate multiple concurrent invocations of the same skill. Assert context and tool execution are isolated and correct.

---

## v3: Tool Registry, Discovery & Advanced Adapters 🔧

**Key Features:**

- Full **internal tool registry** (defineTools manifest)
- **Remote tool discovery** via MCP client connections
- **Advanced tool adapters** (wrapping, hooks, before/after)
- **Dynamic tool registration** at runtime
- **Hot-reload** of tools and adapters
- **Simplified developer surface** for tool configuration

**Rationale:**

- Now that orchestration works, we can add sophisticated tool management
- Enables complex workflows and tool composition
- Dynamic discovery allows integration with any MCP server
- Hot-reload improves developer experience

**Deferred:**

- Persistent state, streaming, direct A2A

---

## v4: Stateful Tasks, Memory, Conversation History 💾

**Key Features:**

- Add persistent task state and memory (per-task context)
- Conversation history management
- Task store abstraction (in-memory, file, etc.)
- Multi-turn conversations
- More advanced error handling and observability

**Rationale:**

- Enables multi-turn, long-running, and resumable tasks
- Supports richer agent behaviors and user experiences
- Builds on the orchestration foundation from v2

**Deferred:**

- Streaming, direct A2A, agent swarms

---

## v5: Streaming, SSE, Chunked Responses 🌊

**Key Features:**

- Add streaming support (SSE, chunked responses, multipart artifacts)
- Support for partial/completed task updates
- Improved LLM and UI integration for real-time feedback

**Rationale:**

- Enables responsive, interactive agent experiences
- Aligns with A2A/MCP protocol evolution

**Deferred:**

- Direct A2A protocol, agent swarms

---

## v6: Direct A2A Protocol, Agent Swarms 🤝

**Key Features:**

- Expose direct A2A protocol endpoints (JSON-RPC, SSE, etc.)
- Support for agent swarms, multi-agent orchestration
- Full compliance with latest MCP and A2A specs

**Rationale:**

- Unlocks full agent-to-agent workflows and composability
- Enables advanced use cases and ecosystem integration

**Deferred:**

- N/A (future features to be planned as needed)

---

## v7: Per-Skill LLM Configuration (Future) 🎯

**Potential Features:**

- **Per-skill LLM override**: Each skill can specify its own model
- **Skill-specific system prompts**: Domain-optimized prompting
- **Cost optimization**: Use cheaper models for simple skills
- **Performance tuning**: Heavy models for complex reasoning
- **Isolated contexts**: Prevent cross-skill prompt pollution

**Why Deferred:**

- Adds significant complexity to v2's simple model
- Requires sophisticated skill routing logic
- May break conversation continuity
- Current global approach works well for most use cases
- Can always be added based on real usage patterns

**Example Future API:**

```typescript
defineSkill({
  id: "complex-analysis",
  // ... other fields
  llmConfig: {
    model: openrouter("openai/gpt-4"),
    systemPrompt: "You are a financial analyst...",
  },
});
```

---

# End of Release Plan
