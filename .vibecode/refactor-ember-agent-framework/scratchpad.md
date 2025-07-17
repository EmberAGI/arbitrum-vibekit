# Project: Ember Agent Framework Refactoring

Last Updated: 2025-07-17T16:30:00Z
Current Role: Planner (Revised)

## Background and Motivation

The user has requested a comprehensive refactoring of existing example agents from the `typescript/examples/` folder into a new unified Ember agent in the `typescript/templates/` folder. The goal is to consolidate all functionality into a single agent with multiple skills, following the new Vibekit framework patterns. This will start with the swapping-agent-no-wallet as phase one, then progressively add other agents as skills in subsequent phases.

### Current State

- **Existing Agents** (in `typescript/examples/`):

  1. `swapping-agent-no-wallet` - Token swapping via Camelot DEX ✅ (In Scope)
  2. `lending-agent-no-wallet` - Lending operations via Aave ✅ (In Scope)
  3. `liquidity-agent-no-wallet` - Liquidity provision operations ✅ (In Scope)
  4. `pendle-agent` - Pendle protocol operations ✅ (In Scope)
  5. ~~`trendmoon-agent` - Trading analytics and predictions~~ ❌ (Out of Scope)
  6. ~~`swapping-agent` - Wallet-connected swapping~~ ❌ (Out of Scope)

- **Target Framework**: New Vibekit v2 framework using skills, tools, and context providers
- **Target Location**: `typescript/templates/ember-agent/`

## Key Challenges and Analysis

### Technical Challenges

1. **Architecture Shift**: Moving from individual agent classes with MCP servers to a unified skill-based architecture
2. **State Management**: Need to evaluate if shared context across skills is necessary (see analysis below)
3. **Tool Consolidation**: Mapping existing tool handlers to the new tool definition format with hooks support
4. **MCP Integration**: Maintaining compatibility with external MCP tools (Ember API)
5. **Encyclopedia/Documentation**: Implementing unified documentation skill with protocol-specific tools
6. **Provider Selection**: Ensuring consistent AI provider selection across all skills
7. **Error Handling**: Standardizing error responses across different skill domains
8. **Transport Upgrade**: Using new StreamableHTTPServerTransport with SSE backwards compatibility

### Design Considerations

1. **Skill Boundaries**: Each agent becomes a skill with clear capability boundaries
2. **Tool Granularity**: Determining which actions should be separate tools vs workflow tools
3. **Context Sharing**: Evaluating necessity of unified context vs skill-isolated contexts
4. **Naming Conventions**: Consistent naming for skills, tools, and context properties
5. **Configuration**: Centralized configuration for API keys, endpoints, and providers

## Analysis: Shared Context vs Skill-Isolated Contexts

### Current State Analysis

Looking at the existing agents:

- **swapping-agent-no-wallet**: Maintains tokenMap, userAddress, conversationMap, mcpClient, camelotContext
- **lending-agent-no-wallet**: Maintains tokenMap, userAddress, conversationHistory, mcpClient, aaveContext
- **liquidity-agent-no-wallet**: Maintains mcpClient, conversationHistory, camelotContext
- **pendle-agent**: Maintains mcpClient, conversationHistory

### Shared Resources

1. **MCP Client**: All agents connect to the same Ember MCP server
2. **Token Map**: Common token data used across swapping, lending, and liquidity skills
3. **User Address**: Consistent across all operations in a session

### Skill-Specific Resources

1. **Conversation History**: Each skill has different system prompts and conversation flows
2. **Documentation Context**: Camelot docs for swapping/liquidity, Aave docs for lending
3. **Protocol-Specific State**: Each skill may need different cached data

### Recommendation

**Simplified Approach**: Use the existing Vibekit context pattern:

- Shared context via `AgentContext.custom` for common resources (MCP client, token map)
- Protocol documentation loaded per tool within the documentation skill
- Each skill manages its own conversation flow through the framework's LLM orchestration

```typescript
interface EmberContext {
  // Shared across all skills
  mcpClient: Client;
  tokenMap: Record<string, Token[]>;
  userAddress?: Address;
  provider: LanguageModelV1Provider;
  // Protocol-specific docs loaded per tool in documentation skill
}
```

## Analysis: Hooks Feature Integration

### Understanding Hooks in Vibekit

The framework provides `withHooks` utility for wrapping tools with before/after logic:

- **Before hooks**: Transform input arguments, validate preconditions, load data
- **After hooks**: Transform results, add logging, update state
- **Short-circuit pattern**: Hooks can return Task/Message to terminate execution early

### How Existing Agents Can Benefit

#### Swapping Skill

```typescript
// Token resolution hook
const resolveTokensHook = async (args, context) => {
  // Convert user-friendly "USDC on ethereum" to resolved token details
  // Can return InputRequired task if ambiguous
};

// Balance check hook
const checkBalanceHook = async (args, context) => {
  // Verify user has sufficient balance
  // Return Failed task if insufficient
};

export const swapTokensTool = withHooks(baseSwapTool, {
  before: composeBeforeHooks(resolveTokensHook, checkBalanceHook),
  after: formatSwapResponseHook,
});
```

#### Lending Skill

```typescript
// Common hooks for all lending operations
const validateMarketHook = async (args, context) => {
  // Ensure market exists and is active
};

const checkHealthFactorHook = async (args, context) => {
  // For borrow/withdraw, ensure health factor remains safe
};

// Applied to multiple tools
export const borrowTool = withHooks(baseBorrowTool, {
  before: composeBeforeHooks(validateMarketHook, checkHealthFactorHook),
  after: formatLendingResponseHook,
});
```

### Benefits

1. **Code Reuse**: Common validation logic shared across tools
2. **Clean Separation**: Business logic separate from cross-cutting concerns
3. **Better Testing**: Hooks can be unit tested independently
4. **Flexible Composition**: Mix and match hooks as needed
5. **Protocol Compliance**: Ensures all error paths return valid A2A responses

## Documentation Skill Architecture: Single Skill, Multiple Tools

### Design

```typescript
export const documentationSkill = defineSkill({
  id: "documentation",
  name: "Protocol Documentation Expert",
  description: "Expert knowledge about all supported DeFi protocols",
  tags: ["docs", "help", "camelot", "aave", "pendle"],
  examples: [
    "What is Camelot DEX?",
    "How does Aave lending work?",
    "Explain Pendle PT tokens",
  ],
  inputSchema: z.object({
    question: z.string().describe("Question about any supported protocol"),
  }),
  tools: [askCamelotTool, askAaveTool, askPendleTool],
});

// Each tool has its own focused implementation
const askCamelotTool: VibkitToolDefinition = {
  name: "ask-camelot",
  description: "Answer questions about Camelot DEX",
  parameters: z.object({ question: z.string() }),
  execute: async (args, context) => {
    // Load Camelot-specific docs
    const camelotDocs = await loadCamelotDocumentation();

    // Use protocol-specific system prompt
    const { textStream } = await streamText({
      model: context.custom.provider(),
      system: `You are a Camelot DEX expert. ${camelotDocs}`,
      prompt: args.question,
    });

    // Return formatted response
  },
};
```

### Benefits

1. **Single Skill Entry Point**: User asks any protocol question to one skill
2. **Framework LLM Routes**: The internal LLM automatically selects the right tool
3. **Isolated Tool Contexts**: Each tool loads only its protocol's documentation
4. **Protocol-Specific Prompts**: Each tool can have its own expert persona
5. **Clear Tool Boundaries**: No cross-contamination between protocol docs
6. **Easy to Extend**: Adding new protocols is just adding new tools

## Transport Architecture: StreamableHTTP with SSE Backwards Compatibility

### Implementation Strategy

The `StreamableHTTPServerTransport` will be the default, running on a main `/mcp` endpoint. For backwards compatibility, the legacy `SSEServerTransport` can be enabled via a configuration flag, running in parallel on a separate `/sse` endpoint.

```typescript
// In agent.ts or server setup file
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// ... in the agent's start method
const app = express();
const mcpServer = this.mcpServer;

// Always enable StreamableHTTPServerTransport on /mcp
const httpTransport = new StreamableHTTPServerTransport();
mcpServer.connect(httpTransport);
app.post("/mcp", (req, res) => httpTransport.handleRequest(req, res));

// Conditionally enable legacy SSE transport on /sse
if (runtimeOptions.enableLegacySseTransport) {
  app.get("/sse", (req, res) => {
    const sseTransport = new SSEServerTransport("/messages", res);
    mcpServer.connect(sseTransport);
    // ... plus connection management for SSE
  });
  app.post("/messages", (req, res) => {
    // Logic to find the right SSE transport instance and handle message
  });
}
```

### Benefits

1. **Modern by Default**: New StreamableHTTP transport for better performance
2. **Backwards Compatible**: Legacy SSE available when needed via configuration
3. **Parallel Operation**: Both transports can run at the same time
4. **Clear Endpoints**: `/mcp` for modern clients, `/sse` for legacy

## Overall Suitability Review (2025-07-17)

### Strengths

1. **Framework Alignment**: The new `ember-agent` template directly integrates with the Vibekit v2 framework, ensuring consistency and ease of maintenance.
2. **Modular Design**: Each skill is a self-contained module, making it easier to add, remove, or modify skills.
3. **Tool Consolidation**: Consolidating multiple tools into a single skill reduces the number of potential points of failure and simplifies the agent's logic.
4. Transport strategy provides a future-proof default with graceful fallback for legacy clients.

### Identified Gaps

1. **Testing Strategy** – Decision made to use **Vitest** as the primary testing framework.
   - **Rationale**: Vitest offers superior performance via Vite's engine, native TypeScript/ESM support that aligns with our `tsconfig` settings, and a Jest-compatible API for a familiar developer experience. It requires minimal configuration compared to a Mocha/Chai stack.
   - **Anvil Compatibility**: Vitest works seamlessly with Anvil. Tests will execute `viem` code that communicates with an Anvil instance managed via `globalSetup` and `globalTeardown` scripts, with no conflicts.
   - **CI/GitHub Workflow Compatibility**: Vitest is CI-friendly (`vitest run --ci`) and integrates perfectly into GitHub Actions for automated testing, reporting, and coverage analysis.
2. **CI Pipeline** – Tasks to integrate linting, type-checking, build, and test suites into CI (e.g., GitHub Actions) are missing.
3. **Versioning & Releases** – No outline for semantic versioning or CHANGELOG generation for the new template.
4. **Security & Auditing** – Static analysis and dependency audit steps are unscoped.
5. **Migration Path** – While mentioned in documentation tasks, concrete scripts/examples for migrating existing deployments are not yet planned.

### Revised Hybrid Testing Strategy (2025-07-17)

Initial analysis overlooked the extensive existing `Mocha`/`Chai` test suites. The plan has been corrected to adopt a hybrid strategy, preserving the current investment in Mocha while introducing Vitest for new development.

**Coexistence Plan:**

1.  **Mocha for Existing Packages**: All current packages will continue to use their existing Mocha-based test suites (`*.test.ts`). No migration is planned at this time.
2.  **Vitest for New Development**: The new `ember-agent` will use **Vitest** for its tests, establishing it as the standard for future components.
3.  **Clear Naming Convention**: To prevent conflicts between runners, Vitest tests will use the `*.vitest.ts` extension. Mocha will continue to target `*.test.ts`.
4.  **Unified CI Execution**: The root `pnpm test` script will be configured to run _both_ Mocha and Vitest suites, ensuring complete test coverage in CI workflows.

This approach allows for incremental adoption of modern tooling without disrupting project stability.

## High-level Task Breakdown

### Phase 1: Swapping Skill & Core Framework

#### Task 1.1: Project Setup and Structure

- Description: Create the new ember-agent project structure in templates folder
- Success Criteria:
  - Directory structure created following Vibekit patterns
  - Package.json configured with correct dependencies (including latest MCP SDK)
  - TypeScript configuration set up
  - Environment variables documented
- Dependencies: None
- Status: Not Started

#### Task 1.1a: Vitest Setup for Ember Agent

- Description: Configure Vitest and testing utilities for the new `ember-agent`.
- Success Criteria:
  - `vitest` and `c8` added as dev dependencies to the root `package.json`.
  - A root `vitest.config.ts` is created, configured to only run files ending in `*.vitest.ts`.
  - `ember-agent/package.json` `test` script is set to `vitest`.
  - Root `package.json` is updated with `test:vitest` script.
- Dependencies: Task 1.1
- Status: Not Started

#### Task 1.2: Core Agent Configuration

- Description: Implement the main agent entry point with provider selection and transport
- Success Criteria:
  - Agent.create() configured with proper metadata
  - AI provider selection logic implemented
  - StreamableHTTPServerTransport as default on `/mcp`
  - Legacy SSEServerTransport available on `/sse` via `enableLegacySseTransport` flag
  - Graceful shutdown handling implemented
- Dependencies: Task 1.1
- Status: Not Started

#### Task 1.3: Context Provider Implementation

- Description: Create shared context provider for ember agent
- Success Criteria:
  - EmberContext type with shared resources
  - MCP client initialization and management
  - Token map population from Ember API
  - Context provider function for agent.start()
- Dependencies: Task 1.2
- Status: Not Started

#### Task 1.4: Swapping Skill Definition

- Description: Create the swapping skill with proper metadata
- Success Criteria:
  - Skill defined with id, name, description, tags, examples
  - Input schema defined (instruction, userAddress)
  - Tools array populated
  - No manual handler (LLM orchestration)
- Dependencies: Task 1.3
- Status: Not Started

#### Task 1.5: Swapping Tools with Hooks

- Description: Implement swap tools using hooks pattern
- Success Criteria:
  - Base swapTokens tool implementation
  - Token resolution before hook
  - Balance checking before hook
  - Response formatting after hook
  - Proper error handling and response formatting
  - Integration with Ember MCP server
- Dependencies: Task 1.4
- Status: Not Started

#### Task 1.6: Documentation Skill with Camelot Tool

- Description: Create unified documentation skill with a tool for Camelot
- Success Criteria:
  - Single documentation skill defined
  - `askCamelot` tool with Camelot-specific docs and prompts
  - Protocol-specific system prompts per tool
  - Framework LLM routes to the `askCamelot` tool
  - Natural language Q&A for Camelot
- Dependencies: Task 1.5
- Status: Not Started

#### Task 1.7: Testing and CI for Phase 1

- Description: Test and document the swapping and documentation skills
- Success Criteria:
  - Unit and integration tests for all new `ember-agent` components are written using Vitest (`*.vitest.ts`).
  - Root `pnpm test` script is updated to execute both existing Mocha tests and new Vitest tests.
  - A GitHub Actions workflow is created/updated to run `pnpm test` on pull requests.
  - README updated with Phase 1 skills and usage
- Dependencies: Task 1.6
- Status: Not Started

### Phase 2: Lending Skill Addition

#### Task 2.1: Lending Skill Definition

- Description: Create lending skill for Aave operations
- Success Criteria:
  - Skill metadata properly defined
  - Support for supply, borrow, repay, withdraw operations
  - Appropriate input schema
- Dependencies: Phase 1 completion
- Status: Not Started

#### Task 2.2: Lending Tools with Shared Hooks

- Description: Implement lending tools using hook composition
- Success Criteria:
  - Individual base tools for each lending action
  - Shared validation hooks (market validation, health factor)
  - Token resolution hooks reused from swapping
  - Balance and allowance checking
- Dependencies: Task 2.1
- Status: Not Started

#### Task 2.3: Aave Documentation Tool

- Description: Add Aave tool to the documentation skill
- Success Criteria:
  - `askAave` tool added to documentation skill
  - Aave documentation loaded and indexed
  - Protocol-specific system prompts for the tool
- Dependencies: Task 2.2
- Status: Not Started

#### Task 2.4: Testing and Documentation for Phase 2

- Description: Test and document the new lending capabilities
- Success Criteria:
  - Unit and integration tests for lending tools and hooks
  - Documentation for lending skill updated in README
- Dependencies: Task 2.3
- Status: Not Started

### Phase 3: Liquidity Skill Addition

#### Task 3.1: Liquidity Skill Definition

- Description: Create liquidity provision skill
- Success Criteria:
  - Support for add/remove liquidity
  - Camelot V3 pool operations
- Dependencies: Phase 2 completion
- Status: Not Started

#### Task 3.2: Liquidity Tools Implementation

- Description: Implement liquidity management tools
- Success Criteria:
  - Add/remove liquidity tools with appropriate hooks
  - Position tracking and analytics tools
- Dependencies: Task 3.1
- Status: Not Started

#### Task 3.3: Testing and Documentation for Phase 3

- Description: Test and document the new liquidity capabilities
- Success Criteria:
  - Unit and integration tests for liquidity tools
  - Documentation for liquidity skill updated in README
- Dependencies: Task 3.2
- Status: Not Started

### Phase 4: Pendle Skill Addition

#### Task 4.1: Pendle Skill Definition

- Description: Create Pendle protocol skill
- Success Criteria:
  - Support for PT/YT trading
  - Market operations
- Dependencies: Phase 3 completion
- Status: Not Started

#### Task 4.2: Pendle Tools Implementation

- Description: Implement Pendle-specific tools
- Success Criteria:
  - Market interaction tools
  - Hooks for PT/YT token handling
- Dependencies: Task 4.1
- Status: Not Started

#### Task 4.3: Pendle Documentation Tool

- Description: Add Pendle tool to the documentation skill
- Success Criteria:
  - `askPendle` tool added to documentation skill
  - PT/YT concepts documentation loaded
- Dependencies: Task 4.2
- Status: Not Started

#### Task 4.4: Testing and Documentation for Phase 4

- Description: Test and document the new Pendle capabilities
- Success Criteria:
  - Unit and integration tests for Pendle tools
  - Documentation for Pendle skill updated in README
- Dependencies: Task 4.3
- Status: Not Started

### Phase 5: Final Integration and Polish

#### Task 5.1: Unified Testing Suite

- Description: Comprehensive testing across all skills
- Success Criteria:
  - Cross-skill interaction tests
  - Performance benchmarks
  - Load testing under both transports
- Dependencies: All skills implemented
- Status: Not Started

#### Task 5.2: Final Documentation and Examples

- Description: Create comprehensive final documentation
- Success Criteria:
  - Final README with all skills documented
  - Complete example usage for each skill
  - Transport configuration examples
  - Migration guide from old agents
- Dependencies: Task 5.1
- Status: Not Started

## Project Status Board

### Phase 1: Swapping Skill & Core Framework

- [ ] Task 1.1: Project Setup and Structure
- [ ] Task 1.1a: Vitest Setup for Ember Agent
- [ ] Task 1.2: Core Agent Configuration
- [ ] Task 1.3: Context Provider Implementation
- [ ] Task 1.4: Swapping Skill Definition
- [ ] Task 1.5: Swapping Tools with Hooks
- [ ] Task 1.6: Documentation Skill with Camelot Tool
- [ ] Task 1.7: Testing and CI for Phase 1

### Phase 2: Lending Skill

- [ ] Task 2.1: Lending Skill Definition
- [ ] Task 2.2: Lending Tools with Shared Hooks
- [ ] Task 2.3: Aave Documentation Tool
- [ ] Task 2.4: Testing and Documentation for Phase 2

### Phase 3: Liquidity Skill

- [ ] Task 3.1: Liquidity Skill Definition
- [ ] Task 3.2: Liquidity Tools Implementation
- [ ] Task 3.3: Testing and Documentation for Phase 3

### Phase 4: Pendle Skill

- [ ] Task 4.1: Pendle Skill Definition
- [ ] Task 4.2: Pendle Tools Implementation
- [ ] Task 4.3: Pendle Documentation Tool
- [ ] Task 4.4: Testing and Documentation for Phase 4

### Phase 5: Final Integration

- [ ] Task 5.1: Unified Testing Suite
- [ ] Task 5.2: Final Documentation and Examples

## Current Status / Progress Tracking

**2024-12-29T19:45:00Z** - Plan revised based on user corrections:

- `StreamableHTTPServerTransport` to be used directly as default
- Transport config flag renamed to `enableLegacySseTransport`
- Confirmed single documentation skill with multiple tools is the correct architecture
- Phases reordered to build and test the core agent and first skill completely
- Testing and documentation integrated into each phase

## Executor's Feedback or Assistance Requests

_No feedback yet - plan pending approval_

## Lessons Learned

_To be populated during implementation_

## Rationale Log

**Decision:** Start with swapping-agent-no-wallet for Phase 1
**Rationale:** This agent has a clear, well-defined scope with two main functionalities (token swapping and DEX encyclopedia), making it ideal for establishing the patterns that will be used for other skills.
**Trade-offs:** Could have started with a simpler agent, but swapping demonstrates both tool orchestration and external MCP integration well.
**Date:** 2024-12-29

**Decision:** Use skill-based architecture with LLM orchestration
**Rationale:** Aligns with Vibekit v2 patterns, provides better modularity, and allows for more flexible agent capabilities.
**Trade-offs:** More complex initial setup vs better long-term maintainability and extensibility.
**Date:** 2024-12-29

**Decision:** Simplified context approach using existing framework patterns
**Rationale:** Uses the framework's existing `AgentContext.custom` for shared resources while leveraging built-in features for skill-specific needs. Avoids inventing new patterns.
**Trade-offs:** Less explicit separation vs simpler implementation that aligns with framework design.
**Date:** 2024-12-29

**Decision:** Use hooks pattern extensively for tool enhancement
**Rationale:** Provides clean separation of business logic from cross-cutting concerns, enables code reuse across similar tools, and ensures protocol compliance in all code paths.
**Trade-offs:** Additional abstraction layer vs significantly cleaner and more testable code.
**Date:** 2024-12-29

**Decision:** Single documentation skill with multiple protocol-specific tools
**Rationale:** Leverages framework's LLM routing, maintains protocol isolation at the tool level, provides single entry point for users. Each tool has its own context and system prompt, providing focused expertise.
**Trade-offs:** None. This is a superior design that aligns perfectly with framework capabilities.
**Date:** 2024-12-29

**Decision:** Use `StreamableHTTPServerTransport` as default with legacy SSE backwards compatibility
**Rationale:** Latest MCP SDK provides a modern, standard-compliant transport. The legacy SSE transport remains available via a configuration flag, ensuring backwards compatibility without holding back the architecture.
**Trade-offs:** Slightly more complex server setup to handle both transports vs a future-proof architecture with a clear migration path.
**Date:** 2024-12-29

**Decision:** Adopt a hybrid testing strategy: retain Mocha for existing packages and introduce Vitest for the new `ember-agent`.
**Rationale:** This approach respects the existing, stable test suites built with Mocha while allowing for the incremental adoption of a more modern, faster testing framework (Vitest) for new development. It avoids a disruptive, large-scale migration and uses a clear file-naming convention (`*.vitest.ts`) to ensure both runners can operate in the same CI pipeline without conflict.
**Trade-offs:** Introduces a second testing framework into the project, which adds a small amount of cognitive overhead. However, this is outweighed by the benefits of stability and progressive enhancement.
**Date:** 2025-07-17

## Version History

- v1.0 (2024-12-29): Initial plan created
- v1.1 (2024-12-29): Updated scope and added analysis sections
- v1.2 (2024-12-29): Revised architecture - single doc skill, direct StreamableHTTP usage
- v1.3 (2024-12-29): Revised transport architecture, reordered phases, renamed config flag
- v1.4 (2025-07-17): Overhauled testing strategy to a hybrid Mocha/Vitest approach based on codebase analysis. Removed Phase 0 and integrated test setup into Phase 1 tasks.
