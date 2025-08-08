# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arbitrum Vibekit is a polyglot toolkit for building smart, autonomous DeFi agents using the Model Context Protocol (MCP). It enables "vibe coding" - AI-assisted development where developers guide AI through natural language to build DeFi agents that can perform complex on-chain operations.

## Key Commands

### Development Commands

```bash
pnpm install
pnpm build
pnpm lint:check
pnpm lint:fix
pnpm test
pnpm test:vitest
pnpm test:anvil
pnpm test:coverage
pnpm test:watch
pnpm test:grep -- "pattern"
pnpm vitest run path/to/test.vitest.ts
pnpm mocha 'dist/test/**/*.test.js' --grep "test name"
pnpm start:anvil
pnpm start:mainnet
docker compose up
docker compose build
docker compose down
```

### Agent Development Commands

```bash
pnpm dev
pnpm build
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

- **Vitest**: For V2 agents in templates
  - Unit tests: `*.unit.test.ts`
  - Integration tests: `*.int.test.ts`
  - Live tests: `*.live.test.ts`
- **Mocha**: For legacy agents in examples
- **Note**: We are migrating from Mocha to Vitest. All new tests should be written for Vitest
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

### Package Management

- **ALWAYS use pnpm** - never use npm
- Install dependencies with `pnpm add` or `pnpm add -D` to ensure latest versions
- Never manually edit `package.json` dependencies - use pnpm commands
- For CI/CD, use non-interactive flags: `pnpm install --frozen-lockfile`

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
- **NEVER use `any` type** - use proper types, `unknown`, or type assertions with `as`
- Never use `.passthrough()` with Zod schemas

### Code Quality Validation

- **ALWAYS run `pnpm lint:check` and `pnpm build` after writing or modifying any code**
- This ensures:
  - Code follows project standards:
    - TypeScript type safety (no `any` types)
    - ESLint rules (unused variables, naming conventions)
    - Prettier formatting (consistent code style)
  - Code compiles successfully:
    - TypeScript compilation passes
    - Import paths are correct (requires `.js` extensions for relative imports)
    - No type errors
- If lint check fails, use `pnpm lint:fix` to auto-fix issues where possible
- If build fails, fix compilation errors (missing imports, type errors, etc.)
- Manually fix any remaining errors before considering the task complete
- Never commit or submit code that doesn't pass both `pnpm lint:check` and `pnpm build`

### Error Handling

- If you encounter missing environment variables, prompt the user to fill them
- Don't mock missing environment variables or external services
- Use structured retry strategy for failures:
  - First attempt: Debug and fix the immediate issue
  - Second attempt: Try alternative approach if first fails
  - Third attempt: Document issue and escalate to user
- Document recurring issues in code comments for future reference

### Problem-Solving Strategy

- It's good that you try a couple of times using your internal intelligence, but after you fail a couple of times you should search online for answers

### TypeScript Configuration

- Target: ES2022 with NodeNext module resolution
- Strict mode enabled
- Source maps for debugging
- Use `tsx` for development execution (already configured in dev scripts)

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

- **Token Operations**
- **DeFi Operations**
- **Cross-chain Operations**
- **Common Error Scenarios**

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

- **Include** decisions about:
  - Technology/library selections (e.g., MSW vs Nock, Zod for validation)
  - Architectural patterns (e.g., plugin system design, testing strategies)
  - Data flow and state management approaches
  - API design choices and contracts
  - Performance optimizations that affect code structure
  - Security implementations
- **Exclude** decisions about:
  - Task ordering or development sequencing
  - Team processes or workflows
  - Documentation structure (unless it affects code organization)
  - Temporary implementation details
  - Style preferences without technical impact
- Not every decision needs documentation - only those that future developers need to understand the codebase

## Important Documentation

- `README.md` - Setup instructions and project overview
- `CONTRIBUTIONS.md` - Contribution guidelines
- `development/rationales.md` - Centralized architectural decision log
- `typescript/lib/arbitrum-vibekit-core/README.md` - Core framework documentation
- `typescript/templates/README.md` - V2 agent templates guide

