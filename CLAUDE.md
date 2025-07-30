# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arbitrum Vibekit is a polyglot toolkit for building smart, autonomous DeFi agents using the Model Context Protocol (MCP). It enables "vibe coding" - AI-assisted development where developers guide AI through natural language to build DeFi agents that can perform complex on-chain operations.

## Key Commands

### Development Commands

```bash
# Bootstrap dependencies (run from typescript/ directory)
pnpm install

# Build all packages in the workspace
pnpm build

# Run linting across the workspace
pnpm lint
pnpm lint:fix

# Run tests
pnpm test              # Runs both vitest and anvil tests
pnpm test:vitest       # Runs vitest tests only (*.vitest.ts files)
pnpm test:anvil        # Runs anvil-based tests for agents

# Run a single vitest test file
pnpm vitest run path/to/test.vitest.ts

# Run a single mocha test file
pnpm mocha 'dist/test/**/*.test.js' --grep "test name"

# Start local blockchain for testing
pnpm start:anvil       # Starts Anvil fork
pnpm start:mainnet     # Starts mainnet fork

# Docker operations
docker compose up      # Start web frontend and default agents
docker compose build   # Build all services
docker compose down    # Stop all services
```

### Agent Development Commands

```bash
# Run agent in development mode (from agent directory)
pnpm dev

# Build agent
pnpm build

# Test agent
pnpm test
```

## Architecture & Framework

### V2 Framework (Current)

- **Location**: `typescript/templates/` - Production-ready agent templates
- **Core Library**: `arbitrum-vibekit-core` - V2 framework with skills, tools, hooks, context providers
- **Architecture**: Skills-first design where skills expose capabilities and contain tools for implementation
- **Transport**: StreamableHTTP (default) with SSE backwards compatibility
- **Key Pattern**: LLM orchestration - let AI route intents to appropriate tools

### Legacy Architecture

- **Location**: `typescript/examples/` - Older patterns, use templates for new development
- **Note**: Examples use older architecture, always prefer V2 templates

### Core Concepts

1. **Skills**: High-level capabilities exposed as MCP tools (e.g., "Lending Operations")
2. **Tools**: Internal actions that implement skills (e.g., supply, borrow, repay)
3. **Hooks**: Cross-cutting concerns (logging, validation, transformation)
4. **Context Providers**: Shared state and dependencies across tools
5. **MCP Integration**: Every agent is an MCP server and can consume other MCP tools

### Testing Strategy

- **Vitest**: For V2 agents in templates (files ending in `.vitest.ts`)
- **Mocha**: For legacy agents in examples
- **Integration Tests**: Use real MCP connections and LLM calls
- **Unit Tests**: Mock external dependencies

### Key Dependencies

- **AI**: Vercel AI SDK with provider selector (OpenRouter, OpenAI, xAI, Anthropic)
- **MCP**: @modelcontextprotocol/sdk with StreamableHTTP transport
- **Blockchain**: Viem for Ethereum interactions
- **Build**: pnpm workspace, TypeScript with ESM modules

### Environment Configuration

Required environment variables:

- `EMBER_ENDPOINT`: MCP endpoint for Ember API
- `RPC_URL`: EVM RPC endpoint
- `AUTH_SECRET`: For web frontend authentication
- AI Provider keys: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, etc.

### Docker Integration

- Agents are containerized with Dockerfile and Dockerfile.prod
- Configure in `compose.yml` and `agents-config.ts` for web frontend
- Each agent runs on its own port (3001-3010 range)

## Development Standards

### Best Practices

1. Always use pnpm (never npm)
2. Use workspace protocol (`workspace:*`) for internal dependencies
3. Follow ESM module patterns (use `.js` extensions in imports)
4. Create skills with LLM orchestration (avoid manual handlers)
5. Use TypeScript strict mode and proper error handling
6. Test with real MCP connections when possible

### Code Quality Guidelines

- Don't create files unless necessary (prefer editing existing)
- Don't use relative imports for workspace packages
- Don't create documentation files unless requested
- Don't bypass LLM orchestration for cost savings
- Never use `--force` flags (e.g., `git push --force`) without explicit approval
- Don't wrap code in try/catch blocks only to add context - propagate errors directly
- Avoid trivial comments that merely restate the next line of code
- Never redefine existing interfaces - always import and reuse
- Never produce mocks instead of real implementations
- Don't create value/type aliases for compatibility - update call sites to use true names
- When refactoring, update import paths rather than maintaining compatibility aliases

### Error Handling

- If you encounter missing environment variables, prompt the user to fill them
- Don't mock missing environment variables or external services
- Use structured retry strategy for failures:
  - First attempt: Debug and fix the immediate issue
  - Second attempt: Try alternative approach if first fails
  - Third attempt: Document issue and escalate to user
- Document recurring issues in code comments for future reference

### Debugging Tips

- Check `pnpm-debug.log` for dependency issues
- Use `MCP_TOOL_TIMEOUT_MS` env var for slow MCP connections
- Kill hanging MCP processes: `pkill -f "mock-mcp"`
- For agent issues, check both agent logs and MCP server logs

### Git Commit Guidelines

- Follow conventional commit format (e.g., `feat:`, `fix:`, `docs:`)
- **DO NOT add Claude Code attribution footer** to commits
- **DO NOT include** "🤖 Generated with Claude Code" or "Co-Authored-By: Claude" lines
- Keep commit messages clean and professional without AI attribution

### Pull Request Workflow

- **All changes must be merged via PR** - direct commits to main are not allowed
- Create a new branch and draft PR together before making changes
- Use descriptive branch names (e.g., `feature/add-swap-adapter`, `fix/token-query-bug`)
- Keep PRs focused on a single feature or fix
- Update PR description with summary and test plan before marking ready for review

## Agent-Based Development Workflow

This project supports a multi-agent workflow for development. Each agent has specific responsibilities and works together to deliver high-quality features.

### Available Agents

1. **PRD Agent** (`/agent prd`) - Creates Product Requirements Documents

   - Analyzes requirements and creates comprehensive PRDs
   - Defines business requirements and success conditions
   - Documents constraints, considerations, and integration points

2. **BDD Agent** (`/agent bdd`) - Creates Gherkin feature files

   - Owns creation of ALL acceptance criteria
   - Translates PRD success conditions into testable scenarios
   - Writes comprehensive Given-When-Then scenarios
   - Places feature files in root-level `features/` directory
   - Asks clarifying questions to fill requirement gaps

3. **TDD Agent** (`/agent tdd`) - Writes comprehensive tests

   - Creates unit tests (`.unit.test.ts`)
   - Creates integration tests (`.int.test.ts`) with mocked services
   - Creates live tests (`.live.test.ts`) for real service validation

4. **Coding Agent** (`/agent coding`) - Implements minimal code

   - Reads failing tests and implements just enough code to pass
   - Follows TDD principles strictly
   - Maintains implementation notes in scratchpad
   - Never over-engineers solutions

5. **Documentation Agent** (`/agent docs`) - Maintains documentation
   - Proactively monitors changes and suggests documentation updates
   - Always asks for approval before updating
   - Maintains API docs, setup guides, and architecture documentation

### Agent Orchestration

#### Sequential Workflow

For a typical feature implementation:

```
PRD Agent → BDD Agent → TDD Agent → Coding Agent → Documentation Agent
```

**Important Dependencies:**

- BDD Agent must complete before TDD Agent (TDD needs feature files)
- TDD Agent must complete before Coding Agent (Coding needs failing tests)
- PRD is read-only once approved (all agents reference it)

#### Using Agents

1. **Start with Planning**:

   ```
   /agent prd think hard about implementing cross-chain swaps
   ```

2. **Create Feature Files**:

   ```
   /agent bdd
   ```

   The BDD agent will create comprehensive feature files with all scenario types (@core, @error-handling, @edge-case, @integration).

3. **Write Tests**:

   ```
   /agent tdd
   ```

   The TDD agent will create tests across all layers based on the feature files.

4. **Implement Code**:

   ```
   /agent coding
   ```

   The Coding agent will implement all components to make the tests pass.

5. **Update Documentation**:
   ```
   /agent docs
   ```
   The Documentation agent monitors changes and suggests updates.

### Agent Communication

- Agents communicate through files in `.vibecode/<branch>/`
- PRD is read-only once approved
- Scratchpad is for implementation notes
- Feature files in `features/` directory are permanent artifacts

## DeFi Domain Terminology

### Consistent Language

When working with this codebase, use these consistent terms across all documentation, code, and tests:

- **Swap**: Token exchange operations
- **Liquidity**: Providing or removing liquidity from pools
- **Slippage**: Price movement tolerance during execution
- **Gas**: Transaction fees on blockchain networks
- **Bridge**: Cross-chain token transfers

### Common Scenario Categories

When creating tests, documentation, or handling errors, consider these standard categories:

#### Token Operations

- Balance queries
- Token approvals
- Direct transfers

#### DeFi Operations

- Token swaps
- Liquidity provision/removal
- Yield farming
- Lending and borrowing

#### Cross-chain Operations

- Bridge transfers
- Multi-chain balance queries
- Cross-chain swaps

#### Common Error Scenarios

- Invalid addresses
- Insufficient balance
- Network failures
- Slippage exceeded
- Gas estimation failures
- Rate limit errors

## Rationales.md Management

**IMPORTANT**: Architectural decisions must be actively managed and documented.

- Document all significant architectural and implementation decisions in `development/rationales.md`
- **User approval required**: Always ask user before adding entries to rationales.md
- Use chronological entries with this format:

  ```markdown
  ## [ISO 8601 DateTime] - [Decision Title]

  - **What**: The decision made
  - **Why**: Rationale and requirements driving it
  - **Alternatives**: Other options considered and why rejected
  - **Trade-offs**: Pros/cons of the chosen approach
  ```

- Examples of decisions worthy of documentation:
  - Technology/library selections
  - Architectural patterns (sync vs async, monolithic vs modular)
  - Performance vs maintainability trade-offs
  - Deviations from standard practices
  - Decisions affecting future extensibility

## Important Documentation

- `README.md` - Setup instructions and project overview
- `CONTRIBUTIONS.md` - Contribution guidelines
- `development/rationales.md` - Centralized architectural decision log
- `typescript/lib/arbitrum-vibekit-core/README.md` - Core framework documentation
- `typescript/templates/README.md` - V2 agent templates guide

## Claude Code Commands and Agents

### Agents

If this project uses specialized agents for different development tasks, they can be invoked using:

- `/agent prd` - Launch PRD Creation Agent
- `/agent bdd` - Launch BDD Agent for feature files
- `/agent tdd` - Launch TDD Agent for test writing
- `/agent coding` - Launch Coding Agent for implementation
- `/agent docs` - Launch Documentation Agent

### Creating Custom Commands

Custom commands are markdown files in `.claude/commands/` with frontmatter:

```yaml
---
description: "Brief description of what the command does"
allowed-tools: ["Bash", "Read", "Edit", "etc."]
argument-hint: "(optional) hint for command arguments"
---
# Command content goes here
Your detailed instructions for the command in markdown format.
```

### Thinking Triggers

Magic phrases (`think`, `think hard`, `think harder`, `ultrathink`) increase Claude's reasoning budget when used in:

- ✅ **Prompt body** or **arguments** (e.g., `/agent prd think hard about auth`)
- ❌ **YAML front-matter** or **HTML comments** (stripped before processing)

Tips: Use one trigger per message. Higher levels = more tokens/latency. Token limits still apply.
