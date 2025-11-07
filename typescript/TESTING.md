# Testing Guide for Vibekit

This guide covers the comprehensive testing strategy and infrastructure for Vibekit contributors. The project follows Test-Driven Development (TDD) principles with a multi-layered testing approach.

## Overview

Vibekit uses `Vitest` as the primary testing framework with `MSW (Mock Service Worker)` for HTTP mocking and `Anvil` for blockchain testing. The testing strategy emphasizes testing behavior (WHAT the system does) rather than implementation (HOW it does it).

## Test Types & Architecture

### 1. Unit Tests (`*.unit.test.ts`)

Unit tests provide fast feedback by testing logic in isolation and are easy to run on every save/commit. Use for:

- Pure functions and utilities
- Business logic with branching
- Components with complex calculations
- Immediately during prototyping

**Example**:
```typescript
// src/utils/logger.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Logger } from './logger.js';

describe('Logger', () => {
  it('formats messages with timestamp and namespace', () => {
    // Given: a logger with namespace
    const logger = Logger.getInstance('TestNamespace');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // When: logging a message
    logger.info('Test message');

    // Then: output should include namespace and message
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[TestNamespace]') &&
      expect.stringContaining('Test message')
    );
  });
});
```

### 2. Integration Tests (`*.int.test.ts`)

Integration tests validate contracts between modules, services, and external systems. Use for:

- Testing adapters that call external APIs
- Component interactions
- Database repositories
- Blockchain/EVM interactions
- Error handling across boundaries

**Example**:
```typescript
// tests/integration/a2a-client-protocol.int.test.ts
import { describe, it, expect } from 'vitest';
import { A2AClient } from '@a2a-js/sdk/client';

describe('A2A Client Protocol', () => {
  it('handles workflow lifecycle with pause/resume', async () => {
    // Given: a client and server setup
    const client = new A2AClient(baseUrl);

    // When: creating and monitoring a workflow
    const task = await client.createTask(workflowConfig);

    // Then: should receive status updates via streaming
    expect(task.status).toBe('running');
  });
});
```

### 3. E2E Tests (`*.e2e.test.ts`)

E2E tests verify critical user journeys end-to-end using real services. Use for:

- Complete workflow validation
- Real AI provider integration
- Critical business flows
- Production-like scenarios

**Example**:
```typescript
// tests/e2e/workflow-lifecycle.e2e.test.ts
describe('DeFi Strategy Workflow Lifecycle (E2E)', () => {
  it('completes full workflow with real AI and blockchain', async () => {
    // Given: real environment setup
    const client = new A2AClient(realServerUrl);

    // When: executing complete workflow
    const result = await client.executeWorkflow('defi-strategy');

    // Then: should complete successfully with real transactions
    expect(result.status).toBe('completed');
  });
});
```

## Test Configuration

### Vitest Configurations

The project uses separate Vitest configurations for each test type:

- `vitest.config.unit.ts`: Unit tests only, no MSW setup
- `vitest.config.int.ts`: Integration tests with MSW and longer timeouts
- `vitest.config.e2e.ts`: E2E tests with single-threaded execution

### Environment Setup

Tests use Node.js native environment variable loading:

```bash
# Integration tests
tsx --env-file=.env.test vitest run --config vitest.config.int.ts

# E2E tests
tsx --env-file=.env.test vitest run --config vitest.config.e2e.ts
```

## Running Tests

### Basic Commands

```bash
# All tests (unit + integration)
pnpm test

# By type
pnpm test:unit      # Fast unit tests
pnpm test:int       # Integration tests with mocks
pnpm test:e2e       # End-to-end tests with real services

# Development
pnpm test:watch     # Watch mode for active development
pnpm test:coverage  # Generate coverage reports
pnpm test:ui        # Interactive test UI

# CI/CD
pnpm test:ci        # Optimized for CI (unit + integration)
pnpm test:ci:main   # Full test suite including E2E
```

### Running Specific Tests

```bash
# Single test file
pnpm test:int tests/integration/a2a-client-protocol.int.test.ts

# Pattern matching (shell glob)
pnpm test:int tests/*workflow*.int.test.ts

# Specific test by name
pnpm test:int tests/file.int.test.ts -t "test name pattern"

# Combine file pattern with test name filter
pnpm test:int tests/*workflow*.int.test.ts -t "should handle pause"
```

### Debugging Tests

Tests suppress console logs by default. To see output:

```bash
# Show all console output
DEBUG_TESTS=1 pnpm test:int

# Show only errors
LOG_LEVEL=error pnpm test:int

# Show errors and warnings
LOG_LEVEL=warn pnpm test:int
```

To inspect recorded mock data:

```bash
# View recorded mock data
pnpm view:mock <service> <mock-name>

# Example: View OpenRouter mock
pnpm view:mock openrouter simple-inference
```

## Mock System (MSW)

MSW handlers are tape recorders, not API simulators. They replay exact recordings of real API responses to ensure tests validate correct handling of real API contracts.

### Mock Structure

```
tests/mocks/
├── data/                    # Recorded API responses (JSON files)
│   ├── openrouter/         # OpenRouter API responses
│   ├── openai/             # OpenAI API responses
│   ├── viem/               # Ethereum JSON-RPC responses
│   └── [service]/          # Other service responses
├── handlers/               # MSW request handlers
│   ├── openrouter.ts       # Routes requests to recorded mocks
│   ├── openai.ts
│   ├── index.ts            # Exports all handlers
│   └── [service].ts
└── utils/                  # Mock utilities
    ├── mock-loader.ts      # Loads recorded responses
    └── error-simulation.ts # Error handling utilities
```

### Recording Mocks

1. **Configure API keys** in `.env` file (see `.env.example` for required keys)

2. **Run the recording command** to capture real API responses:
   ```bash
   pnpm test:record-mocks
   ```

3. **Review recorded data** - the following types of responses are automatically captured:
   - REST API responses
   - GraphQL responses
   - JSON-RPC calls (Ethereum, etc.)
   - Streaming endpoints
   - Error responses (rate limits, server errors, etc.)

4. **Run tests** - handlers automatically replay the recorded data in integration tests


## Test Organization & Patterns

```
# Unit tests - co-located with source
src/utils/logger.ts              → src/utils/logger.unit.test.ts
src/config/validators/routing.ts → src/config/validators/routing.unit.test.ts

# Integration tests - centralized
tests/integration/a2a-client-protocol.int.test.ts
tests/integration/workflow-handler.int.test.ts

# E2E tests - centralized
tests/e2e/workflow-lifecycle.e2e.test.ts
tests/e2e/message-routing.e2e.test.ts
```

## Code Quality Integration

### Pre-commit Validation

Always run quality checks before committing:

```bash
# Full quality check
pnpm precommit

# Individual checks
pnpm lint           # ESLint + Prettier
pnpm typecheck      # TypeScript compilation
pnpm test           # Unit + Integration tests
```

### Linting & Formatting

```bash
# Check code quality
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Type checking
pnpm typecheck
```

## Workspace-Level Testing

### Monorepo Commands

```bash
# Run tests across all packages
pnpm test:ci

# Build all packages
pnpm build

# Clean all packages
pnpm clean
```

### Package-Specific Testing

Each package has its own test configuration:

```bash
# Test specific package
cd typescript/lib/agent-node
pnpm test

# Test community agents
cd typescript/community/agents/defisafety-agent
pnpm test
```

## Best Practices

### 1. Test Behavior, Not Implementation

**Good Test Example**:
```typescript
it('should return user data when valid ID provided', () => {
  // Test the outcome, not how it's achieved
  expect(result.user.name).toBe('John Doe');
});
```

**Bad Test Example**:
```typescript
it('should call database.query with correct SQL', () => {
  // Testing implementation details
  expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM users...');
});
```

### 2. Use Appropriate Test Types

| Code Pattern | Test Approach |
|--------------|---------------|
| Pure function with business logic | Unit test with `vi.mock()` |
| Adapter calling external API | Integration test with MSW |
| Repository with database queries | Integration test with test containers |
| Service composing multiple adapters | Integration test, mock at boundaries |
| Calculator/transformer | Unit test, no mocks needed |

### 3. Mock Strategically

**Unit Tests**: Mock external dependencies, keep pure functions unmocked
**Integration Tests**: Mock external services, use real local infrastructure
**E2E Tests**: Use real services, minimal mocking

### 4. Clear Test Names

```typescript
// ✅ Descriptive test names
describe('User authentication', () => {
  it('should return JWT token when credentials are valid', () => {});
  it('should throw AuthError when password is incorrect', () => {});
  it('should handle rate limiting after 5 failed attempts', () => {});
});
```

### 5. Avoid Test Pollution

- Use `beforeEach`/`afterEach` for cleanup
- Reset mocks between tests: `vi.clearAllMocks()`
- Use fresh test data for each test

## Troubleshooting

### Common Issues

**Tests fail with "Unhandled request"**:
- Record missing mocks: `pnpm test:record-mocks`
- Check MSW handler patterns match actual requests

**Console logs not showing**:
- Use `DEBUG_TESTS=1` environment variable
- Check `LOG_LEVEL` setting in test setup

**Slow test performance**:
- Ensure unit tests don't use MSW or real services
- Check for unnecessary async operations
- Use `test.concurrent` for independent tests

**Mock data out of sync**:
- Re-record mocks after API changes
- Verify API keys are current in `.env`

### Getting Help

1. Check existing test patterns in similar components
2. Review test utilities in `tests/utils/`
3. Examine MSW handlers for mock examples
4. Consult the TDD agents documentation
