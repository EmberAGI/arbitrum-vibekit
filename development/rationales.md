# Arbitrum Vibekit - Architectural Decision Records

> This document consolidates all architectural and implementation decisions across the Arbitrum Vibekit project. Each entry is chronologically ordered and captures the rationale behind major design choices to help contributors understand why the system is architected as it is.

---

## Initial A2A Alignment and Skill Architecture

- **Decision:** All agent skills must be defined using a strongly-typed `SkillDefinition` interface, with Zod schemas for both input and output payloads.
- **Rationale:** Ensures type safety, clear contracts, and future extensibility. Aligns with A2A protocol expectations for structured, typed data.
- **Reference:** Scratchpad §1, §2, agent.ts SkillDefinition

---

## Required Skill Metadata

- **Decision:** Each skill must include non-empty `tags` and `examples` arrays.
- **Rationale:** Provides rich metadata for LLMs and UIs, and enforces good documentation practices for all skills.
- **Reference:** Scratchpad §3, agent.ts defineSkill

---

## Zod Schema Type Constraints

- **Decision:** Only `ZodObject<ZodRawShape>` is supported for input schemas; primitive types (Boolean, Number, Enum) are explicitly rejected.
- **Rationale:** Prevents ambiguous or lossy input validation, and ensures all skills have structured, extensible input contracts.
- **Reference:** Scratchpad §3, §4.3, agent.ts defineSkill, utils.ts getMimeTypesFromZodSchema

---

## MCP Tool Wrapping and Input Validation

- **Decision:** Each skill is registered as an MCP tool, with input validation performed using the skill's Zod schema. If validation fails, the handler is not called and an MCP error is returned.
- **Rationale:** Ensures robust, predictable error handling and prevents invalid data from reaching skill logic.
- **Reference:** Scratchpad §4.5, agent.ts registerSkillsAsMcpTools

---

## A2A Task/Message Return Discipline

- **Decision:** All skill handlers must return a `Promise<Task | Message>`, never throw for operational errors. Use `createErrorTask` and `createSuccessTask` helpers for standardization.
- **Rationale:** Guarantees that all skill results are A2A-compliant and can be wrapped for MCP responses without ambiguity.
- **Reference:** Scratchpad §4.5, utils.ts, agent.ts

---

## Error Handling Philosophy

- **Decision:** Distinguish between operational errors (handled by skills, returned as failed Tasks) and unexpected crashes (caught by the MCP wrapper, returned as MCP errors). Use `VibkitError` for all operational errors.
- **Rationale:** Provides clear separation of concerns, improves debuggability, and ensures user-facing errors are meaningful.
- **Reference:** Scratchpad §4.5, agent.ts registerSkillsAsMcpTools, error.ts

---

## ID and Context ID Generation

- **Decision:** Use `nanoid` for all Task/Message IDs and context IDs, embedding the skill name and a timestamp in context IDs for traceability.
- **Rationale:** Ensures uniqueness, aids debugging, and aligns with A2A best practices for traceable workflows.
- **Reference:** Scratchpad §4.2, utils.ts createSuccessTask/createErrorTask

---

## MCP Resource Envelope Format

- **Decision:** MCP responses wrap A2A Task/Message objects as `resource` content with `application/json` MIME type, using a Tag URI for the resource.
- **Rationale:** Conforms to MCP SDK requirements and A2A protocol, while providing a standard, machine-readable envelope for downstream consumers.
- **Reference:** Scratchpad §4.1, mcpUtils.ts createMcpA2AResponse

---

## Skill Identity and Tool Naming

- **Decision:** Skills have a stable `id` field (distinct from `name`), which is used as the MCP tool name. The human-readable name is used for display and metadata.
- **Rationale:** Allows for stable references even if display names change, and aligns with A2A's `AgentSkill.id` field.
- **Reference:** Scratchpad §6.1, agent.ts SkillDefinition, AgentSkill conversion

---

## Testability and Public API

- **Decision:** The agent's `mcpServer` is public, and all core helpers are exported for use in tests and downstream agents.
- **Rationale:** Facilitates comprehensive unit and integration testing, and encourages code reuse.
- **Reference:** Scratchpad §5.3, agent.ts, utils.ts

---

## No Legacy Skill System

- **Decision:** All legacy skill registration and handler mechanisms have been removed in favor of the new, A2A-aligned system.
- **Rationale:** Reduces confusion, technical debt, and ensures all agents are built on a single, robust foundation.
- **Reference:** Scratchpad §5.1, agent.ts

---

## Static Agent.create Factory Method & AgentConfig Separation

- **Decision:** The Agent is instantiated via a static Agent.create(manifest: AgentConfig, runtimeOptions?) factory method, rather than a public constructor. AgentConfig encapsulates the agent's static definition (name, version, skills), while AgentRuntimeOptions handles dynamic server/runtime aspects (port, CORS, task store).
- **Rationale:** Promotes a clear separation of concerns between the agent's immutable definition and its runtime configuration. Enforces that essential agent properties (like skills) are provided upfront, preventing partially initialized or misconfigured agents. Simplifies the instantiation API for users of the Agent class. Allows for consistent internal construction of the A2A AgentCard.
- **Reference:** agent.ts Agent.create, AgentConfig, AgentRuntimeOptions

---

## Internal AgentCard Assembly to Bundle Skill Handlers

- **Decision:** The Agent is configured using an AgentConfig object, which contains an array of SkillDefinition objects. Each SkillDefinition includes not only the skill's metadata (name, description, schemas) but also its handler function. The A2A-compliant AgentCard (which describes the agent's skills but lacks handlers) is then constructed internally within Agent.create based on this AgentConfig.
- **Rationale:** Provides a user-friendly way to define skills and their corresponding implementation (handlers) together in a single, cohesive SkillDefinition object. Addresses the limitation of the standard A2A AgentCard, which does not have a dedicated field for associating skill handlers with their definitions. Simplifies agent setup for users, who can supply a complete definition of behavior through AgentConfig without needing a separate mechanism for handler registration. Aligns well with the MCP model where each tool call can be directly mapped to a specific skill handler, avoiding the need for a complex central routing mechanism within the agent for skill dispatch. Ensures the publicly advertised AgentCard (e.g., via /.well-known/agent.json) is accurate and A2A-compliant, while the internal agent structure manages the direct link between a skill's interface and its executable handler.
- **Reference:** agent.ts AgentConfig, SkillDefinition, Agent.create

---

## MCP Tool Description Enhancement (XML for Tags/Examples)

- **Decision:** Skill tags and examples are embedded within the MCP tool's description field using a simple XML structure (e.g., <tags><tag>...</tag></tags><examples><example>...</example></examples>), handled by formatToolDescriptionWithTagsAndExamples.
- **Rationale:** Enriches the metadata available to LLMs or other MCP clients consuming the tools, without requiring modifications or custom fields in the core MCP SDK's ToolAnnotations. Provides a structured, yet human-readable, way to convey multiple tags and examples within the existing string-based description field. Leverages existing infrastructure rather than introducing new complexities for metadata transmission.
- **Reference:** agent.ts formatToolDescriptionWithTagsAndExamples

---

## Server Lifecycle Management (start/stop methods)

- **Decision:** The Agent class provides explicit start(port) and async stop() methods for managing the agent's underlying HTTP server and SSE connections.
- **Rationale:** Offers clear and conventional control over the agent's operational state, crucial for running it as a service, for integration into larger applications, and for reliable testing (setup/teardown). Ensures graceful shutdown of network resources (HTTP server, active SSE connections), preventing issues like port conflicts or hanging processes.
- **Reference:** agent.ts start, stop

---

## Well-Known URI for Agent Discovery (/.well-known/agent.json)

- **Decision:** When started, the agent serves its AgentCard at the standard /.well-known/agent.json HTTP endpoint.
- **Rationale:** Adheres to A2A conventions for agent discovery, making it easier for other A2A-compliant systems or clients to find and understand the agent's capabilities. Provides a standardized, machine-readable mechanism for retrieving an agent's metadata without needing prior knowledge of its specific API structure beyond the base URL.
- **Reference:** agent.ts start (/.well-known/agent.json route)

---

## Extra Parameter Isolation from Skill Handlers

- **Decision:** The MCP `extra` parameter is logged for debugging in the MCP tool callback but is not forwarded to skill handlers.
- **Rationale:** This isolates skills from MCP-specific concerns, keeps their interface clean, and prevents accidental coupling to protocol-level details.
- **Reference:** agent.ts registerSkillsAsMcpTools (tool callback)

---

## Skills Map for O(1) Lookup

- **Decision:** Skills are stored internally in a `Map<string, SkillDefinition>` for efficient lookup by name during MCP tool invocation.
- **Rationale:** Provides O(1) access to skill definitions, which is more performant than iterating through arrays, especially as the number of skills grows.
- **Reference:** agent.ts (skillsMap usage)

---

## Default CORS Enabled

- **Decision:** CORS is enabled by default (`runtimeOptions.cors ?? true`) for the agent's HTTP server.
- **Rationale:** Maximizes compatibility with browser-based clients and simplifies development/testing. Can be configured or disabled via runtime options if needed.
- **Reference:** agent.ts (constructor, start method)

---

## TaskStore Abstraction (Interface-based Storage)

- **Decision:** The `TaskStore` interface and its implementations (`InMemoryTaskStore`, `FileStore`) are defined for pluggable task and message history storage, though not currently used in the agent's core logic.
- **Rationale:** Provides a foundation for future extensibility, allowing agents to persist tasks and histories in memory, on disk, or in other backends without changing agent logic.
- **Reference:** store.ts (TaskStore, InMemoryTaskStore, FileStore)

---

## Base Path Normalization

- **Decision:** The agent's `basePath` is automatically normalized to ensure consistent URL formatting (stripping leading/trailing slashes).
- **Rationale:** Prevents common URL construction errors and ensures predictable endpoint paths regardless of user input.
- **Reference:** agent.ts (constructor)

---

## Console Logging Strategy

- **Decision:** Uses `console.log` for operational events (tool registration, server start) and `console.error` for errors and debugging information.
- **Rationale:** Allows for clear separation of normal operation logs and error/debug logs, aiding in log aggregation and troubleshooting.
- **Reference:** agent.ts (registerSkillsAsMcpTools, error handling, server start/stop)

---

## HTTP Server State Validation

- **Decision:** Explicitly checks if the HTTP server is already running before starting a new instance, throwing a clear error if so.
- **Rationale:** Prevents double-start scenarios and ensures that only one server instance is active at a time, reducing the risk of port conflicts or resource leaks.
- **Reference:** agent.ts (start method)

---

## Graceful SSE Connection Management

- **Decision:** Tracks active SSE connections in a `Set`, cleans up intervals and connections on close/error, and ensures all connections are closed during shutdown.
- **Rationale:** Prevents resource leaks, ensures proper cleanup, and maintains reliability for long-lived connections.
- **Reference:** agent.ts (SSE connection management, stop method)

---

## Dynamic Tool Discovery & Adapter Application

- **Decision:** Adapters and hooks for external MCP tools must be applied _after_ runtime discovery, not at compile time, since remote tool definitions (names, schemas) are only available after a `tools/list` handshake.
- **Rationale:** Enables the framework to support arbitrary, previously-unknown tools from any MCP server, while still allowing developers to inject business logic, validation, or cross-cutting concerns (e.g., logging, paywall) via adapters and hooks. Allows wildcard/generic decorators to be applied to all tools, and supports hot-reloading if the remote tool list changes.
- **Reference:** Scratchpad §Dynamic Adapter Strategy, §Key Challenges

---

## withHooks as the Standard Hook/Adapter Utility

- **Decision:** The framework provides a single, composable utility (`withHooks`) to wrap any ToolDefinition (local or remote) with before/after hooks, ensuring a uniform extension point for all tool logic.
- **Rationale:** Simplifies the mental model for developers: all tool customization (normalization, logging, access control, etc.) uses the same API, regardless of whether the tool is local, remote, or dynamically discovered. Enables ergonomic composition and layering of adapters.
- **Reference:** Scratchpad §Key Challenges, §Lessons

---

## Registry Replacement Semantics

- **Decision:** When an adapter is applied to a tool, the registry replaces the original proxy entry (same name) so only the adapted version is exposed to the LLM. Aliasing and coexistence are not the default.
- **Rationale:** Prevents confusion, duplication, and accidental exposure of unadapted tools. Ensures that only the intended, safe, and decorated logic is available for orchestration.
- **Reference:** Scratchpad §Notes on Adapters vs. Original Tools

---

## Single Manifest for Tool Exposure

- **Decision:** Junior developers configure all tools (local and remote, with adaptation rules) in a single manifest object (e.g., `defineTools`). The framework handles registry creation, remote discovery, adaptation, and LLM exposure internally.
- **Rationale:** Reduces cognitive load and boilerplate for new contributors. Mirrors the existing skill declaration pattern, making it easy to onboard and maintain. Ensures a single source of truth for all tool exposure.
- **Reference:** Scratchpad §Simplified Developer Surface

---

## Runtime Schema Conversion for Remote Tools

- **Decision:** Remote tool input schemas (JSON Schema) are converted to Zod schemas at runtime for validation and type safety in the local framework.
- **Rationale:** Ensures that all tool invocations--local or remote--benefit from the same validation, error handling, and developer ergonomics, even when the tool's schema is not known until runtime.
- **Reference:** Scratchpad §Dynamic Adapter Strategy, §Key Challenges

---

## Skills vs Tools Distinction

- **Decision:** Skills are the externally exposed interface of the agent (as MCP tools or an A2A endpoint), while Tools are the internal, orchestratable units of business logic the agent uses to fulfill skills.
- **Rationale:** This separation prevents recursive confusion, clarifies the agent's architecture, and allows the agent to orchestrate complex workflows internally while exposing a clean, stable interface to the outside world. Skills are what the world sees; tools are what the agent uses.
- **Reference:** Scratchpad, lessons, and framework design docs.

## MCP-First, A2A-Ready Strategy

- **Decision:** The framework exposes agents as MCP servers first, using A2A Task/Message structures internally, with direct A2A protocol support planned for a future release.
- **Rationale:** MCP is widely adopted and compatible with major LLM clients today, enabling immediate utility. Using A2A structures internally future-proofs the framework for richer async, streaming, and agent-to-agent workflows as the ecosystem matures. This staged approach maximizes compatibility and minimizes risk.
- **Reference:** Scratchpad, MCP/A2A docs, project roadmap.

## Agent as Orchestrator (Middleman)

- **Decision:** The agent is responsible for interpreting incoming skill requests and orchestrating internal tools to accomplish the requested task, rather than simply forwarding calls.
- **Rationale:** This centralizes business logic, enables complex workflows, and allows the agent to mediate between external requests and internal capabilities. The agent is the 'brain' that decides how to fulfill a skill using its available tools, state, and logic.
- **Reference:** Scratchpad, lessons, rationale discussions.

## Stateless v1, State in Future Releases

- **Decision:** The initial release is stateless, with a simple context object passed through orchestration. Persistent task state, memory, and conversation history will be added in future releases.
- **Rationale:** Starting stateless keeps the framework simple and easy to reason about, enabling rapid iteration and feedback. State management is deferred to avoid premature complexity and to learn from real usage patterns.
- **Reference:** Lessons, scratchpad, incremental roadmap.

## Streaming Deferred for Simplicity

- **Decision:** Streaming (SSE, chunked responses, etc.) is not implemented in the initial release, but is planned for future versions.
- **Rationale:** Streaming adds significant complexity to both the protocol and implementation. By starting with synchronous, single-response flows, the framework can deliver value quickly and layer on streaming once the core is stable.
- **Reference:** Scratchpad, lessons, roadmap.

## Web3 as Core, Not Optional

- **Decision:** Web3 capabilities (delegation, unsigned txs, etc.) are first-class in the framework, not an optional add-on. However, these capabilities are decoupled from the core agent logic by being provided through separate MCP servers.
- **Rationale:** The primary value proposition is making it easy to build Web3 AI agents. By baking Web3 support into the ecosystem via MCP servers, the framework ensures that all agents can leverage these features out of the box, while keeping the core agent logic clean and extensible for non-Web3 use cases. This decoupling allows the agent to orchestrate Web3 actions through MCP interfaces, supporting both Web3 and non-Web3 agents with minimal friction.
- **Reference:** Scratchpad, lessons, rationale discussions.

## Incremental Protocol Adoption & Evolution

- **Decision:** The framework is designed to evolve incrementally: start with MCP exposure, add orchestration and internal tool registry, then state, streaming, and direct A2A support.
- **Rationale:** This staged approach allows for rapid delivery of value, continuous feedback, and manageable complexity. Each step is chosen to maximize compatibility, developer experience, and future extensibility.
- **Reference:** Scratchpad, roadmap, rationale discussions.

## LLM Integration Before Tool Registry

- **Decision:** LLM integration and reasoning engine (v2) must be implemented before advanced tool registry and adapters (v3).
- **Rationale:** Without the LLM reasoning engine, the agent cannot interpret skill requests or decide which tools to use. The MCP server from v1 is just an empty interface without the "brain" to process requests. Once basic LLM integration works, we can layer on sophisticated tool management, adapters, and dynamic discovery.
- **Reference:** Release plan restructuring, architectural dependencies.

## Implementation Details for Future Releases =§

Based on the scratchpad vision, here are the key implementation details planned for v2 and beyond:

### v2: LLM Integration & Reasoning Engine

- **Decision:** Implement the LLM integration and reasoning engine that interprets skill requests and coordinates execution.
- **Rationale:** Provides the essential "brain" that makes the agent functional, enabling it to understand requests and decide how to fulfill them using available tools.
- **Components:**
  - LLM integration using dependency injection (any Vercel AI SDK compatible model)
  - Basic tool abstraction for internal business logic
  - Context object for per-request data flow
  - Simple conversation flow (single-turn initially)
  - Request interpretation and tool selection logic

### v3: Tool Abstraction & Registry

- **Decision:** Every meaningful action must be implemented as a tool (local or adapter). Remote tools are surfaced through generated proxy stubs.
- **Rationale:** Provides a uniform interface for all agent capabilities, whether local business logic or remote MCP server calls.
- **Implementation:**
  - Local tools: Direct `ToolDefinition` objects with execute functions
  - Remote tools: Runtime proxy generation from `tools/list` with Zod schema conversion
  - Registry with O(1) lookup and replacement semantics (adapters replace originals)

### v3: Dynamic Adapter Strategy

- **Decision:** Four-phase process for runtime tool discovery and adaptation.
- **Rationale:** Enables adapters/hooks on tools discovered only at runtime, not compile time.
- **Phases:**
  1. **Discovery**: `registry.registerRemote(client)` fetches tool list
  2. **Matching**: Compare tool names against developer-supplied adapter config
  3. **Application**: Apply adapters/hooks, replacing original tools
  4. **Exposure**: Orchestrator uses final adapted tools

### v3: Simplified Developer Surface

- **Decision:** Single `defineTools()` manifest for all tool configuration.
- **Rationale:** Reduces cognitive load--one place to declare local tools, remote servers, and adaptation rules.
- **Example Structure:**
  ```typescript
  export const toolManifest = defineTools({
    local: [supply, withdraw],
    remote: [
      connectMcp('aave.server', {
        adapt: {
          borrow: borrowAdapter,
          '*': withLogging,
        },
      }),
    ],
  });
  ```

### v3: Hook System

- **Decision:** Standalone `withHooks(tool, {before?, after?})` utility for composable tool enhancement.
- **Rationale:** Simpler than middleware, works uniformly for local and remote tools, enables clean composition.
- **Note:** This differs from the file-local hooks mentioned in lessons--it's a wrapper pattern, not export-based.

### v4: Stateful Conversation Management

- **Decision:** Add persistent task state, memory, and conversation history management.
- **Rationale:** Enables multi-turn conversations, long-running tasks, and resumable workflows.
- **Components:**
  - Conversation history management (built on task state)
  - Per-task memory and context persistence
  - Task store abstraction (in-memory, file, etc.)
  - Multi-turn conversation flow

### Task Breakdown Mapping

From scratchpad to release plan:

- -  v1: MCP server exposure, basic skill handling
- >§ v2: LLM integration, reasoning engine, basic tools
- =' v3: Tool registry, remote proxy building, hook system, adapters
- =§ v4: Conversation history, state management, multi-turn
- <
 v5: Streaming support throughout
- >-  v6: Direct A2A transport, multi-agent coordination

## Direct OpenRouter Integration (v2)

- **Decision:** Use OpenRouter directly from `@openrouter/ai-sdk-provider` without custom LLMProvider abstraction.
- **Rationale:** Keeps v2 implementation simple and aligned with the working reference implementation (lending-agent-no-wallet). Avoids premature abstraction and reduces complexity for initial orchestration implementation.
- **Implementation:**
  ```typescript
  import { createOpenRouter } from '@openrouter/ai-sdk-provider';
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  // Use directly in generateText/streamText
  ```
- **Reference:** lending-agent-no-wallet implementation pattern

## Dependency Injection for Language Models (v2)

- **Decision:** Use dependency injection to pass any Vercel AI SDK compatible model instance to the agent, rather than hardcoding OpenRouter.
- **Rationale:** Even though v2 uses OpenRouter, this pattern keeps the agent provider-agnostic. Users can pass any compatible model (OpenAI, Anthropic, etc.), making the framework more flexible without adding complexity. Follows Vercel AI SDK design patterns.
- **Implementation:**
  ```typescript
  interface AgentRuntimeOptions {
    llm?: {
      model: LanguageModel; // Any Vercel AI SDK model instance
      systemPrompt?: string;
      tools?: Array<ReturnType<typeof tool>>;
    };
  }
  ```

## LLM Configuration Naming (v2)

- **Decision:** Name the language model configuration `llm` instead of `orchestration`.
- **Rationale:** "LLM" is clear, direct, and accurately describes what's being configured. The term "orchestration" is too narrow—this config handles the entire language model runtime including reasoning, tool usage, and response generation. Aligns with Karpathy's LLM OS concept where the LLM is the kernel.
- **Reference:** Industry standard terminology, LLM OS concepts

## Key Patterns from lending-agent-no-wallet for v2

- **Decision:** Adopt proven patterns from the reference implementation to accelerate v2 development.
- **Rationale:** The lending-agent-no-wallet provides battle-tested patterns for LLM integration, tool handling, and A2A response generation.
- **Key Patterns:**
  1. **Tool Result Extraction**: Look for `tool-result` parts in response messages that contain Task objects
  2. **System Prompt with Examples**: Include concrete `<examples>` in system prompt to guide LLM behavior
  3. **HandlerContext Pattern**: Pass request-specific context (user address, etc.) to tool handlers
  4. **Debug Logging**: Use `console.error` for all debug output to keep stdout clean
  5. **onStepFinish Callback**: Track multi-step execution progress
  6. **Stateless Conversation History**: Clear history when tasks complete to prevent context bleed
  7. **Type-Safe Tool Sets**: Define typed interfaces for tool collections
  8. **Fallback Text Responses**: Always return valid A2A Task/Message even when no tool is called
  9. **Task State Mapping**: Use appropriate A2A task states ('completed', 'failed', 'input-required')
  10. **Structured Artifacts**: Return transaction plans and other data as typed artifacts
- **Reference:** lending-agent-no-wallet implementation

## Global LLM vs Per-Skill LLM Configuration (v2)

- **Decision:** Use a single global LLM configuration for all skills in v2, with automatic skill-specific system prompt generation.
- **Rationale:**
  - **Architectural clarity**: The LLM doesn't choose which skill to execute - that's already determined by the MCP tool call
  - **Focused orchestration**: Each skill handler gets a prompt specific to its purpose and available internal tools
  - **Simplicity**: One LLM instance, but with context-aware prompts per skill
  - **Stateless design**: Each skill invocation is independent with its own conversation context
  - **Example reuse**: Skill examples guide the LLM on expected behavior for that specific skill
- **Implementation:**
  - When a skill is called via MCP, its handler creates a skill-specific system prompt
  - The prompt includes the skill's description, examples, and available internal tools
  - Each request is stateless - no conversation history persists between calls
- **Key insight:** The LLM's role is to orchestrate internal tools to fulfill a specific skill, not to route between skills
- **Future consideration:** Per-skill LLM models (not just prompts) could be added in v7+ for optimization
- **Reference:** User feedback on architecture, MCP tool invocation flow

## LLM as Skill Fulfiller, Not Skill Selector (v2)

- **Decision:** The LLM orchestrates internal tools to fulfill a specific skill, rather than choosing between skills.
- **Rationale:**
  - **Architecture alignment**: MCP tool invocation already determines which skill is being called
  - **Clearer responsibility**: The LLM focuses on HOW to accomplish the skill, not WHICH skill to use
  - **Better prompting**: Skill-specific prompts can be more focused and effective
  - **Reduced complexity**: No need for the LLM to understand the entire skill catalog
  - **Natural flow**: Client § MCP tool § Skill handler § LLM orchestration § Internal tools
- **Implementation:** Each skill handler creates its own LLM context with skill-specific prompts
- **Implications:**
  - System prompts are generated per-skill, not globally
  - Each skill invocation is stateless and independent
  - The LLM only needs to know about internal tools, not other skills
- **Reference:** User clarification about MCP tool routing, architectural analysis

## Tool Visibility in LLM System Prompts (v2)

- **Decision:** Tools are passed to LLMs through the Vercel AI SDK's native tool-calling interface.
- **Rationale:**
  - **SDK Mechanism**: Vercel AI SDK passes tools to the LLM's function/tool calling API, not by adding them to the system prompt text
  - **Modern LLM Design**: GPT-4, Claude, Gemini have dedicated tool APIs separate from the conversation
- **Reference:** Vercel AI SDK documentation, modern LLM API patterns

## Per-Skill Tool Configuration (v2)

- **Decision:** Internal tools are configured per skill rather than globally, allowing each skill to have its own specific set of tools.
- **Rationale:**
  - **Skill Specificity**: Different skills need different tools (e.g., lending vs. trading vs. analytics)
  - **Security**: Limits tool access to only what's needed for each skill
  - **Clarity**: Makes it explicit which tools are available for which skills
  - **Maintainability**: Easier to understand and modify skill-specific functionality
  - **Prevents Confusion**: LLM only sees relevant tools for the current skill
- **Implementation:**
  - Tools are defined directly on the `SkillDefinition` interface
  - Each skill handler receives only its associated tools
  - Tools are created using Vercel AI SDK's `tool` function with Zod schemas
- **Reference:** User feedback on skill-tool association, security best practices

## Tools Required on Skills (v2)

- **Decision:** Make `tools` a required property on SkillDefinition with at least one tool.
- **Rationale:**
  - **No Business Logic Without Tools**: A skill without tools can't actually execute any business logic in the LLM-powered v2
  - **Explicit Dependencies**: Makes it clear what capabilities each skill has
  - **Prevents Empty Skills**: Enforces that skills are functional, not just descriptive
  - **Simplifies Configuration**: Skills are self-contained with their tools, no separate runtime mapping needed
- **Implementation:** `defineSkill` validates that at least one tool is provided
- **Reference:** User feedback on simplicity, architectural clarity

## Simplified Tool Visibility in System Prompts (v2)

- **Decision:** Do not manually list tools in system prompts; rely on Vercel AI SDK's native tool-calling mechanism.
- **Rationale:**
  - **SDK Handles It**: Vercel AI SDK passes tools to the LLM through the proper API channels
  - **Avoid Redundancy**: No need to duplicate tool information that's already provided
  - **Simpler Prompts**: Focus prompts on skill context and examples, not implementation details
  - **Flexibility**: LLMs automatically see updated tool descriptions if they change
- **Implementation:** System prompts only include skill description, tags, and examples
- **Reference:** User feedback on keeping things simple, Vercel AI SDK best practices

## LLM-First with Optional Manual Handlers (v2)

- **Decision:** Make skill handlers optional, with LLM orchestration as the default behavior. Manual handlers become an escape hatch for bypassing the LLM.
- **Rationale:**
  - **Aligns with v2 Goal**: v2's primary purpose is adding LLM orchestration
  - **Reduces Boilerplate**: No need for placeholder handlers that just defer to LLM
  - **Clear Intent**: Handler presence explicitly signals custom logic is needed
  - **A2A Compliance**: Supports "opaque execution" - how a skill fulfills its contract is internal
  - **Mixed Usage**: Allows both LLM and manual skills in the same agent
- **Implementation:** MCP tool registration checks for handler presence; if absent, uses LLM orchestration
- **Reference:** User feedback on architecture, A2A opaque execution principle

## Minimal Context Management for v2 (v2)

- **Decision:** Implement a simple `AgentContext` interface with just a `custom` property for v2, deferring more sophisticated context features to future releases.
- **Rationale:**
  - **Simplicity First**: Avoids over-engineering for unknown requirements
  - **Real Use Case**: Addresses immediate need for tokenMap and similar data
  - **Easy to Extend**: Simple interface can grow as needs become clear
  - **Clear Separation**: Tools remain stateless, receiving but not managing context
  - **Prevents Complexity**: No lifecycle hooks, logging, or metadata in v2
- **Implementation:** `AgentContext<TCustom = any> { custom: TCustom }`
- **Reference:** User feedback on tokenMap use case, YAGNI principle

## Context Loading in start() Method (v2)

- **Decision:** Load context data during the `start()` method rather than `create()`, using an optional context provider function.
- **Rationale:**
  - **Async-Friendly**: Context loading often involves async operations (file I/O, network calls)
  - **Keeps create() Simple**: Factory method remains synchronous and fast
  - **Clear Lifecycle**: Context is part of runtime startup, not configuration
  - **Optional**: Agents without context needs can omit the provider
  - **Testable**: Easy to provide mock context in tests
- **Implementation:** `start(port: number, contextProvider?: () => Promise<TContext> | TContext)`
- **Reference:** lending-agent-no-wallet pattern, user feedback on startup sequence

## VibkitToolDefinition with Context Support (v2)

- **Decision:** Create our own `VibkitToolDefinition` interface that includes context as a second parameter to the execute function.
- **Rationale:**
  - **Vercel AI SDK Limitation**: SDK's tool function doesn't support context injection
  - **Stateless Tools**: Tools receive context but don't store it
  - **Type Safety**: Strongly typed context parameter for better DX
  - **Conversion Layer**: Agent converts Vibkit tools to SDK tools with context injection
  - **Flexibility**: Allows tools to access agent-scoped data like tokenMap
- **Implementation:** Tools have signature `execute: (args, context) => Promise<Task | Message>`
- **Reference:** User feedback on context requirements, adapter pattern

## Tools Required on Skills, Handler Optional (v2)

- **Decision:** Reverse the v1 requirement - skills must have tools but handlers are optional.
- **Rationale:**
  - **LLM Needs Tools**: Without tools, LLM orchestration can't do anything useful
  - **Enforces Functionality**: Prevents empty skills that can't execute business logic
  - **Clear Dependencies**: Makes tool requirements explicit at skill definition
  - **Validation**: `defineSkill` validates at least one tool exists
  - **Manual Override**: Handler presence bypasses LLM for specific cases
- **Implementation:** Update SkillDefinition interface and validation logic
- **Reference:** LLM-first architecture, user feedback on simplicity

## Agent Class Generics for Enhanced Type Safety (v2)

- **Decision**: The `Agent` class was made generic: `Agent<TSkillsArray extends SkillDefinition<any, TContext>[], TContext = any>`. This allows the specific types of the skills array and the custom context to be captured and enforced by the TypeScript compiler.
- **Rationale**:
  - **Improved Type Safety**: Provides strong typing for the agent's configuration, skills, and the context object passed to tools. This helps catch errors at compile-time rather than runtime.
  - **Developer Experience**: Enhances autocompletion and type inference for developers using or extending the `Agent` class, making it easier to understand what context and tool arguments are expected.
  - **Consistency**: Ensures that the types used in `SkillDefinition`, `VibkitToolDefinition`, and `AgentContext` are consistently applied and checked throughout the agent's implementation and usage.
  - **Maintainability**: Makes the codebase easier to refactor and maintain, as type relationships are explicit.
- **Reference**: `agent.ts` (`Agent` class definition), `scratchpad.md` (v2 implementation summary).

---

## Vercel AI SDK Tool Formatting for `generateText` (v2)

- **Decision**: When passing tools to Vercel AI SDK's `generateText` function, they are transformed internally into an object. In this object, keys are unique tool names, and values are the SDK-compatible tool definitions (including `description`, `parameters`, and an `execute` function that handles context injection).
- **Rationale**: This specific object-based format is a requirement of the Vercel AI SDK's `generateText` tool-calling API. Adhering to this structure is essential for the LLM to correctly recognize, interpret, and invoke the tools provided during its orchestration process. This ensures seamless integration with the SDK's tool-using capabilities. The framework handles this transformation from the array of `VibkitToolDefinition` (defined on a skill) to the required object format, abstracting this detail from the developer.
- **Reference**: `agent.ts` (within `createSkillHandler` method), Vercel AI SDK documentation.

---

## VibkitToolDefinition as Universal Tool Interface (v2.5)

- **Decision**: VibkitToolDefinition is the single, universal interface for all tools in the framework, regardless of their implementation details or origin.
- **Rationale**:
  - **Simplicity**: One interface to learn and use for all tool types
  - **Consistency**: All tools follow the same pattern whether they call MCP, execute business logic, or access databases
  - **Composability**: Any tool can be enhanced with `withHooks` or other utilities
  - **Future-proof**: Dynamically discovered tools use the same interface as manually created ones
  - **No Artificial Distinctions**: Avoids creating special cases for "MCP tools" vs "internal tools"
- **Implementation**: All tools are just VibkitToolDefinition objects with different execute implementations
- **Reference**: User feedback on tool abstraction, architectural simplification

---

## withHooks Included in Urgent Scope (v2.5)

- **Decision**: Include the `withHooks` utility in the initial lending agent implementation rather than deferring it.
- **Rationale**:
  - **Trivial Implementation**: Only ~15 lines of code
  - **Immediate Benefits**: Reduces code duplication across 6 lending tools
  - **Cleaner Architecture**: Separates cross-cutting concerns from business logic
  - **Better Testing**: Hooks can be unit tested independently
  - **No Added Complexity**: Just simple function composition
  - **Prevents Future Refactoring**: Avoids rewriting tools later to add hooks
- **Implementation**: Simple utility that takes a tool and returns an enhanced tool
- **Reference**: User analysis of implementation complexity and benefits

---

## No Special MCP Proxy Factory (v2.5)

- **Decision**: Do not create a special "MCP proxy tool factory" - just create VibkitToolDefinition implementations directly.
- **Rationale**:
  - **Unnecessary Abstraction**: MCP tools aren't special - they're just tools that happen to call MCP
  - **Consistency**: All tools are created the same way, reducing cognitive load
  - **Flexibility**: Each tool can have custom logic beyond just forwarding to MCP
  - **Clearer Intent**: The implementation shows exactly what the tool does
- **Implementation**: Create tools directly as VibkitToolDefinition objects with MCP calls in their execute method
- **Reference**: User feedback on avoiding artificial distinctions

---

## Seamless Migration Path to Dynamic Tools (v2.5)

- **Decision**: Design patterns that work identically for manually created and dynamically discovered tools.
- **Rationale**:
  - **Investment Protection**: Code written today continues to work with future dynamic discovery
  - **Same Enhancement Pattern**: `withHooks` and other utilities work on any VibkitToolDefinition
  - **Gradual Migration**: Can mix manual and dynamic tools in the same agent
  - **No Breaking Changes**: The interface remains stable across all tool sources
- **Implementation**: Both manual and dynamic tools produce VibkitToolDefinition objects
- **Reference**: Forward-looking architectural design, user concerns about refactoring

---

## Skill Input Context Enhancement (v2.5)

- **Decision:** Extended `AgentContext` to include skill input parameters, making them available to all tools via `context.skillInput`.
- **Rationale:**
  - **Essential Feature**: Tools often need access to skill-level parameters (e.g., walletAddress, user preferences)
  - **Avoids Redundancy**: Without this, every tool would need these parameters passed explicitly, adding overhead to LLM tool calls
  - **Type Safety**: Skill input type is automatically inferred from the skill's `inputSchema`, providing full type safety
  - **Clean Architecture**: Separates skill-level concerns from tool-specific arguments
  - **LLM Efficiency**: Reduces context overhead for the LLM by not requiring it to pass common parameters to every tool
- **Implementation:**
  - `AgentContext<TCustom, TSkillInput>` now has two type parameters
  - `VibkitToolDefinition` updated to include skill input type parameter
  - `createSkillHandler` passes the skill input to context when creating tool executors
  - Tools can access `context.skillInput?.walletAddress` etc. with full type inference
- **Reference:** User feedback on skill parameter access, architectural analysis of lending agent requirements

---

## Hook Return Type Flexibility (v2.5)

- **Decision:** Allow hooks to return either modified arguments OR a Task/Message to enable short-circuiting.
- **Rationale:**
  - **Early Termination**: Hooks can stop execution early if preconditions aren't met (e.g., token not found, insufficient balance)
  - **Clean Error Handling**: Instead of throwing exceptions, hooks return proper A2A Task objects with appropriate states
  - **Composability**: Multiple hooks can be chained, with any hook able to terminate the chain
  - **User Experience**: Provides clear, actionable feedback to users (e.g., "Please specify which chain for USDC")
- **Implementation:** Hook functions return `Promise<TArgs | Task | Message>` instead of just `Promise<TArgs>`
- **Reference:** Token resolution and balance check hook requirements, user experience considerations

---

## Base Tools Return Raw MCP Responses (v2.5)

- **Decision:** Base tool implementations return raw MCP responses, with response parsing handled by hooks.
- **Rationale:**
  - **Separation of Concerns**: Base tools focus solely on making MCP calls, hooks handle business logic
  - **Testability**: Raw MCP calls can be tested independently from response parsing logic
  - **Flexibility**: Different tools might need different parsing strategies for the same MCP response
  - **Reusability**: Response parsing hooks can be shared across multiple tools
  - **Type Transformation**: Allows clean transformation from MCP response types to A2A Task/Message types
- **Implementation:** Base tools have `TResult = any` and return raw MCP client responses
- **Reference:** Clean architecture principles, hook composition patterns

---

## Short-Circuit Hook Pattern for Tool Enhancement (v2.5)

- **Decision:** Implement a custom `withHooks` utility for the lending agent that allows hooks to return either modified arguments (to continue execution) or a Task/Message (to short-circuit and return immediately).
- **Rationale:**
  - **Protocol Compliance**: A2A requires all code paths to return valid Task/Message objects, not throw exceptions. This pattern ensures protocol compliance even in error cases.
  - **Clean Error Handling**: Instead of exceptions that break control flow, hooks return structured error responses with appropriate task states ('failed', 'input-required').
  - **User Experience**: Provides clear, actionable feedback (e.g., "Token 'USDC' found on multiple chains. Please specify which one.") rather than generic error messages.
  - **Early Validation**: Expensive operations (like blockchain transactions) can be prevented by early validation checks that short-circuit with informative responses.
  - **Composability**: Multiple hooks can be chained with `composeBeforeHooks`, where any hook in the chain can terminate execution by returning a Task/Message.
  - **Domain Alignment**: Lending operations have clear preconditions (token exists, sufficient balance, etc.) that map naturally to this pattern.
- **Implementation:**
  - Custom `withHooks` function that checks hook return types to determine continuation vs. short-circuit
  - Type union `Promise<TArgs | Task | Message>` for hook returns
  - Type guards to distinguish between modified arguments and protocol responses
- **Trade-offs:**
  - **Type Complexity**: The union return type requires explicit type checking, adding some complexity
  - **Mental Model**: Developers must understand the dual nature of hook returns
  - **Testing**: Tests need to cover both continuation and short-circuit paths
- **Alternatives Considered:**
  - Exception-based: Rejected due to A2A protocol requirements
  - Result wrapper pattern: Rejected as unnecessarily complex
  - Separate validation phase: Rejected as less flexible and composable
- **Reference:** Lending agent hook implementations, A2A protocol requirements, user analysis of pattern benefits

---

## MCP Client Dependency Injection for Context Providers (v2.5)

- **Decision:** Pass initialized MCP clients to context providers as a required `deps` parameter when a context provider is supplied to `agent.start()`.
- **Rationale:**
  - **Initialization Order**: Context providers often need data from MCP servers (e.g., token capabilities), but context loading happens before MCP client initialization in the original design
  - **Framework Handles Complexity**: Aligns with the principle that "framework handles complexity, agents stay simple" - the framework manages MCP lifecycle and provides ready-to-use clients
  - **Clear Contract**: When you provide a context provider, you always get deps - no ambiguity about availability
  - **No Duplicate Connections**: Avoids the anti-pattern of creating temporary MCP clients just for context loading
  - **Junior Developer Friendly**: Simple pattern - receive initialized clients, use them to fetch data
  - **Active Development Advantage**: Since the framework is under active development, we can make clean API decisions without legacy concerns
- **Implementation:**
  - Modified `agent.start()` to initialize MCP clients before calling context provider
  - Context provider signature: `(deps: { mcpClients: Record<string, Client> }) => Promise<TContext> | TContext`
  - All MCP clients from all skills are aggregated into a single map for easy access
  - The pattern naturally extends if we need to pass other framework-managed resources in the future
- **Problem Solved:** Enables the lending agent to fetch token maps from MCP during startup without violating framework principles
- **Reference:** User analysis of context loading problem, framework philosophy from lessons 6, 10, and 11

---

## Tools Enable Intent Routing and Orchestration, But Not Workflow Decomposition (v2.5)

- **Decision:** Multiple tools within a skill enable the LLM to perform intent routing AND orchestration, but workflows should be encapsulated as single tools rather than decomposed into separate tool steps.
- **Rationale:**
  - **Dual Purpose**: Tools serve two purposes - (1) intent routing to select the right action, and (2) orchestration to coordinate multiple actions
  - **Workflow Encapsulation**: Multi-step workflows that always execute together should be a single tool, not broken into parts
  - **User Flexibility**: Separate tools for actions users might request independently (supply, borrow, repay, withdraw)
  - **Composability**: Each tool represents an atomic, user-facing action that has value on its own
  - **LLM Power**: The LLM can orchestrate multiple tools, make conditional decisions, and aggregate results - but shouldn't orchestrate workflow internals
  - **Prevents Anti-Patterns**: Avoids creating tools for internal steps that users would never directly request
- **Example:** A lending skill has separate tools for supply, borrow, repay, and withdraw because users might want any individual action, and the LLM can orchestrate multiple operations (e.g., "supply ETH then borrow USDC")
- **Counter-Example:** Quote, approve, and swap steps should be a single `executeSwapWorkflow` tool, not three separate tools - the LLM shouldn't orchestrate internal workflow steps
- **Reference:** User clarification on intent routing AND orchestration, workflow encapsulation principles

---

## Single-Tool Skills Default to Tools Pattern (v2.5)

- **Decision:** Skills with only one tool should still use the tool pattern rather than manual handlers, unless the skill is truly deterministic and will never evolve.
- **Rationale:**
  - **Future Flexibility**: Easy to add more tools later without refactoring the entire skill
  - **Consistent Pattern**: All skills follow the same structure, reducing cognitive load
  - **Anticipate Growth**: Most skills that start simple eventually need additional capabilities
  - **Low Overhead**: The LLM pass-through for single-tool skills has minimal cost
  - **Clear Upgrade Path**: Going from 1 tool to N tools requires no structural changes
- **Implementation:** Developers create single-tool skills the same way as multi-tool skills
- **Manual Handler Exception**: Only use manual handlers for pure computations that will never need routing
- **Reference:** User feedback on maintaining flexibility, framework evolution patterns

---

## Tool Orchestration Encompasses Full LLM Capabilities (v2.5)

- **Decision:** The LLM's orchestration role extends beyond intent routing to include planning, sequential execution, conditional logic, and result aggregation.
- **Rationale:**
  - **Complete Picture**: Developers need to understand the full power of LLM orchestration, not just routing
  - **Real-World Complexity**: Most production skills require more than simple tool selection
  - **LLM Capabilities**: Modern LLMs can plan multi-step processes, use tool results to inform next steps, and synthesize outputs
  - **Avoid Underutilization**: Without understanding full orchestration, developers might create overly complex manual handlers
- **Orchestration Types:**
  1. **Intent Routing**: Selecting tools based on user intent
  2. **Sequential Execution**: Planning and executing multiple tools in order
  3. **Conditional Logic**: Using results to decide next actions
  4. **Result Aggregation**: Combining outputs into cohesive responses
- **Reference:** Industry best practices, GPT-4 and Claude capabilities, user clarification on orchestration

---

## One Skill = One Capability (A2A Protocol Alignment) (v2.5)

- **Decision:** Each skill must represent exactly one cohesive capability, following the A2A protocol's design philosophy.
- **Rationale:**
  - **Protocol Compliance**: A2A defines skills as high-level capabilities with clear boundaries
  - **Mental Model**: Users and other agents can easily understand what a skill does
  - **Maintainability**: Single-capability skills are easier to test, document, and evolve
  - **Prevents Bloat**: Avoids kitchen-sink skills that try to do everything
  - **Clear Contracts**: Each skill has a focused purpose that can be described in one sentence
- **Examples:**
  - ✓ "Lending Operations" - one capability with multiple related actions
  - ✓ "Token Swapping" - one capability for exchanging tokens
  - ✗ "DeFi Everything" - too broad, should be split into lending, swapping, staking skills
- **Reference:** A2A protocol specification, AgentSkill interface design

---

## Framework Designed for Junior Developer Accessibility (v2.5)

- **Decision:** The skill-tool pattern and overall framework design prioritize accessibility for junior developers while remaining powerful for advanced use cases.
- **Rationale:**
  - **Low Barrier to Entry**: Clear patterns help developers start building immediately
  - **Pit of Success**: The default patterns guide developers toward good practices
  - **Progressive Complexity**: Simple skills are simple to build, complex skills are possible
  - **Self-Documenting**: Required metadata (tags, examples) ensures good documentation practices
  - **Error Prevention**: Framework validation catches common mistakes early
- **Design Choices:**
  - Required tools array prevents empty skills
  - Clear separation of skills (external) and tools (internal)
  - Validation of schemas and metadata
  - Single defineSkill function for all skill types
- **Reference:** Framework philosophy, user emphasis on junior developer experience

---

_This document is a living log. Please append new rationale entries as further decisions are made._
