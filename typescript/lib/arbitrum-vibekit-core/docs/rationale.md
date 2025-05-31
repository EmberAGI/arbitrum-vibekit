# Arbitrum Vibekit Core – Rationale Log

> This document records the rationale behind every major design and implementation decision, as captured in the project scratchpad and reflected in the `agent.ts` class. It is intended as a living, chronological log to help new contributors understand why the system is architected as it is.

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

_This document is a living log. Please append new rationale entries as further decisions are made._
