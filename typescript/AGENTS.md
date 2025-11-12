Please also reference the following documents as needed. In this case, `@` stands for the project root directory.

<Documents>
  <Document>
    <Path>@.codex/memories/msw-handlers.md</Path>
    <Description>MSW handler rules for integration test fidelity</Description>
    <FilePatterns>**/tests/mocks/**/*</FilePatterns>
  </Document>
</Documents>

# Additional Conventions Beyond the Built-in Functions

As this project's AI coding tool, you must follow the additional conventions below, in addition to the built-in functions.

## Development Guidelines

### Package Management

- **ALWAYS use pnpm** - never use npm
- Install dependencies with `pnpm add` or `pnpm add -D` to ensure latest versions
- Never manually edit `package.json` dependencies - use pnpm commands
- For CI/CD, use non-interactive flags: `pnpm install --frozen-lockfile`

### TypeScript Configuration

- Target: ES2022 with NodeNext module resolution
- Strict mode enabled
- Source maps for debugging
- Use `tsx` for development execution (already configured in dev scripts)

### Testing Approach

- Unit tests mirror source directory structure
- Use Vitest for testing framework (migrating from Mocha)
- Follow Test-Driven Development (TDD) practices
- For detailed testing guidelines, see `docs/testing-strategy.md` and the TDD agents

### Working with Test Infrastructure and Code

When modifying test infrastructure (MSW handlers, test utilities, mock data):

- **ALWAYS read** `.claude/agents/tdd-test-writer.md` FIRST for requirements and patterns
- This includes creating new handlers, updating existing ones, or adding mock utilities

When implementing or modifying code (whether making tests pass or any other changes):

- **ALWAYS read** `.claude/agents/test-driven-coder.md` FIRST for implementation patterns

### Environment Configuration

- Copy `.env.example` to `.env` for local development
- Required: API keys for providers (Dune, Birdeye, etc.)
- Chain configurations in environment variables
- **Node.js native environment variable loading** - we do NOT use the `dotenv` package
  - Node.js 20.6+ supports native `.env` file loading via the `--env-file` flag
  - Integration and e2e test scripts use `tsx --env-file=.env.test` to load test environment variables
  - See `package.json` scripts: `test:int`, `test:e2e`, and `test:record-mocks`
  - No need to manually call `dotenv/config` or import `dotenv`

### Docker Development

- `compose.local.yaml` for local development with Memgraph
- `compose-tests.yaml` for test environment
- `compose.yaml` for production deployment

### Managing Commands, Subagents, and Rules

**Source of truth**: `.rulesync/` directory - never edit generated `.claude/` or `.cursor/` files

**Workflow**:

1. Create/edit files in `.rulesync/{commands,subagents,rules}/`
2. Run `pnpm sync:rules` to generate to `.claude/` and `.cursor/`

**Frontmatter formats**:

Commands (`.rulesync/commands/*.md`):

```yaml
---
description: 'Brief description'
targets: ['*']
allowed-tools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Task']
argument-hint: '(optional) argument hint'
---
```

Subagents (`.rulesync/subagents/*.md`):

```yaml
---
name: agent-name
targets: ['*']
description: When to use this agent
claudecode:
  model: sonnet # or opus
  color: green
---
```

Rules (`.rulesync/rules/*.md`):

```yaml
---
root: true # for root.md only
targets: ['*']
description: 'Rule description'
globs: ['**/*']
---
```

**Config**: `rulesync.jsonc` controls targets (cursor, claudecode) and features (rules, commands, subagents)

## Code Quality Standards

### General Best Practices

- Never use `--force` flags (e.g., `git push --force`) without explicit approval
- Don't wrap code in try/catch blocks only to add context - propagate errors directly
- Avoid trivial comments that merely restate the next line of code
- Never redefine existing interfaces - always import and reuse
- Never produce mocks instead of real implementations
- Don't create value/type aliases for compatibility - update call sites to use true names
- When refactoring, update import paths rather than maintaining compatibility aliases
- Never use `.passthrough()` with Zod schemas
- **NEVER use `any` type** - use proper types, `unknown`, or type assertions with `as`

### Schema Validation (Zod)

- Always validate external API inputs/outputs at application boundaries (adapters/clients in `src/`) using `zod`.
- Do not run schema validation in tests' MSW handlers or mock loaders; handlers must replay recorded responses unmodified.
- Optional: run mock drift/shape checks in CI or as a separate developer command, not during test runtime.
- Prefer a single `zod` major version across the workspace to avoid version conflicts.

### Decision Documentation

- Document significant architectural and implementation decisions in `/docs/rationales.md`
- **User approval required**: Always ask user before adding entries to rationales.md
- For detailed guidelines on what to document, see the Documentation Agent

### Pull Request Workflow

- **All changes must be merged via PR** - direct commits to main are not allowed
- Create a new branch and draft PR together before making changes
- Use descriptive branch names (e.g., `feature/add-swap-adapter`, `fix/token-query-bug`)
- Keep PRs focused on a single feature or fix
- Update PR description with summary and test plan before marking ready for review

### Error Handling

- Don't mock missing environment variables or external services - prompt user to fill them instead
- Follow the troubleshooting strategy below for all failures
- Document recurring issues in code comments for future reference

### Troubleshooting Strategy

**Important**: Never use sub-agents for troubleshooting - handle issues directly. The agent instructions below are also mandatory reading for their respective domains:

- **For test troubleshooting**: Read `.claude/agents/tdd-test-writer.md` for guidance on test infrastructure, MSW handlers, mock strategy, and testing patterns
- **For code troubleshooting**: Read `.claude/agents/test-driven-coder.md` for guidance on implementation patterns, TDD workflow, and code requirements

**Three-Attempt Rule**:

1. **First attempt**: Debug and fix the immediate issue (document in scratchpad)
2. **Second attempt**: Try alternative approach if first fails (update scratchpad with learnings)
3. **Third attempt**: Search online for answers, then document findings and escalate to user if still blocked

**Scratchpad Documentation**: The scratchpad (`.vibecode/<BRANCH>/scratchpad.md`) is your active thinking space for tracking all evidence, assumptions, and attempts.

**Setup**: Get branch with `git branch --show-current`, then either:

- Create new scratchpad at `.vibecode/<BRANCH>/scratchpad.md` if it doesn't exist
- Update existing scratchpad if already present
- Replace slashes with dashes: `add/graph-v2` → `.vibecode/add-graph-v2/scratchpad.md`

**When to update**:

- Before each attempt at solving a problem
- After each attempt with results and learnings
- When discovering patterns, API contracts, or assumptions
- When collecting evidence from logs, tests, or code

**Scratchpad Template**:

```markdown
# Troubleshooting: [Issue/Feature Name]

Branch: [current] | Updated: [timestamp]

## Current Focus

Working on: [specific problem/test]
Approach: [current attempt]

## Evidence Collected

- [Facts discovered from code/tests/logs]
- [API responses, error messages]
- [Patterns observed in similar code]

## Assumptions

- [What I'm assuming about expected behavior]
- [Hypotheses about root causes]

## Attempts Log

[timestamp] Attempt 1: [what tried] → [result]
[timestamp] Attempt 2: [what tried] → [result]
[timestamp] Attempt 3: [what tried] → [result]

## Discovered Patterns

- [API contracts, conventions, requirements]

## Blockers/Questions

- [Issues needing user input or clarification]

## Resolution (when solved)

### Root Cause

[What actually caused the issue]

### Solution

[What fixed it and why]

### Learnings

[Key insights for future reference]
```

### Debugging Tests

- **Console logs are suppressed during tests by default**. To see console.log/console.error output:
  - Run tests with `DEBUG_TESTS=1` environment variable: `DEBUG_TESTS=1 pnpm test:int`
  - This is essential when debugging failing tests to see adapter logs and error messages
  - The suppression is configured in `tests/setup/vitest.setup.ts`
- **View mock file contents**: Use `pnpm view:mock <service> <mock-name>` to decode and display mock data
  - Example: `pnpm view:mock squid squid-route-1-137-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-0x2791bca1f2de4661ed88a30c99a7a9449aa84174`
  - The service parameter is the provider name (e.g., squid, dune, birdeye)
  - The mock-name is the filename without the .json extension
  - This utility decodes the base64-encoded raw response body and displays it in a readable format

### Mock Recording

- **Record API mocks**: Use `pnpm test:record-mocks` to record real API responses for integration tests
  - Records all provider API responses to `tests/mocks/data/`
  - Requires API keys in `.env` (see `.env.example`)
  - For detailed mock recording instructions, see the TDD test writer agent

### Code Quality Validation

- **ALWAYS run `pnpm lint` and `pnpm build` after writing or modifying any code**
- This ensures:
  - Code follows project standards:
    - TypeScript type safety
    - ESLint rules (unused variables, naming conventions)
    - Prettier formatting (consistent code style)
  - Code compiles successfully:
    - TypeScript compilation passes
    - Import paths are correct (requires `.js` extensions for relative imports)
    - No type errors
- If lint check fails, use `pnpm lint:fix` to auto-fix issues where possible
- If build fails, fix compilation errors (missing imports, type errors, etc.)
- Manually fix any remaining errors before considering the task complete
- Never commit or submit code that doesn't pass both `pnpm lint` and `pnpm build`

### Git Commit Guidelines

- Follow Angular commit message conventions (as detailed in the create-pr command)
- **DO NOT add Claude Code attribution** to commits (no "🤖 Generated with Claude Code" or "Co-Authored-By: Claude")
- Keep commit messages clean and professional

## Important Documentation

- `README.md` - Setup instructions and project overview
- `docs/rationales.md` - Architectural and implementation decision log

## Common Development Commands

### Building and Running

- `pnpm build` - Build TypeScript to JavaScript
- `pnpm dev` - Run in development mode with hot reloading
- `pnpm start` - Run the built application
- `pnpm clean` - Remove node_modules

### Testing

- `pnpm test` - Run all tests (excluding e2e tests)
- `pnpm test:unit` - Run unit tests only (\*.unit.test.ts)
- `pnpm test:int` - Run integration tests only (\*.int.test.ts)
- `pnpm test:e2e` - Run end-to-end tests (\*.e2e.test.ts)
- `pnpm test:ci` - Run tests for CI/CD (unit + integration)
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:mocha` - Run existing Mocha tests
- `pnpm test:grep -- "pattern"` - Run specific tests matching pattern
- `pnpm test:record-mocks` - Record real API responses for integration test mocks

**Note**: We are migrating from Mocha to Vitest. All new tests should be written for Vitest. The project follows Test-Driven Development principles - see the TDD agents and `docs/testing-strategy.md` for detailed testing guidelines.

### Code Quality

- `pnpm lint` - Check code formatting and linting
- `pnpm lint:fix` - Automatically fix formatting and linting issues

### Database Management

- `pnpm wipe:graph` - Clear the Memgraph database