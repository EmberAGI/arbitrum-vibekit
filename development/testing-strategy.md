# Testing Strategy Guide

This guide provides practical instructions for writing and maintaining tests in the onchain-actions codebase using our three-tier testing strategy.

## Overview

We use a three-tier testing approach to balance speed, reliability, and real-world validation:

1. **Unit Tests** (`.unit.test.ts`) - Fast, isolated tests for business logic
2. **Integration Tests** (`.int.test.ts`) - Component interaction tests with mocked external services
3. **Live Integration Tests** (`.live.test.ts`) - Real service tests for development and monitoring

## Test File Naming and Location

### Naming Convention

All test files must follow these naming patterns:

- `*.unit.test.ts` - Unit tests
- `*.int.test.ts` - Integration tests
- `*.live.test.ts` - Live integration tests

### Location Strategy (Hybrid Approach)

```
src/
  protocols/
    uniswap/
      swap.ts
      swap.unit.test.ts      # Unit test co-located with source
      swap.int.test.ts       # Integration test co-located with source
tests/
  live/
    protocols/
      uniswap-mainnet.live.test.ts  # Live tests in top-level directory
    cross-protocol/
      aave-uniswap-flow.live.test.ts # Cross-protocol live tests
```

- **Unit and integration tests**: Co-located with source files for better developer experience
- **Live tests**: Centralized in `tests/live/` directory for clear separation and safety

## Writing Tests

### Unit Tests

Unit tests focus on testing individual functions or modules in isolation.

**Example**: Testing ERC20 utility functions

```typescript
// src/utils/erc20.unit.test.ts
import { describe, it, expect } from "vitest";
import { toRawAmount, formatTokenAmount } from "./erc20";

describe("ERC20 Utilities", () => {
  describe("toRawAmount", () => {
    it("should convert decimal amount to raw amount for 18 decimals", () => {
      expect(toRawAmount("1.5", 18)).toBe("1500000000000000000");
    });

    it("should handle 6 decimal tokens (USDC)", () => {
      expect(toRawAmount("100.50", 6)).toBe("100500000");
    });

    it("should handle zero amounts", () => {
      expect(toRawAmount("0", 18)).toBe("0");
    });
  });
});
```

**Best Practices for Unit Tests:**

- Mock all external dependencies
- Test edge cases (zero values, MAX values, invalid inputs)
- Keep tests focused on a single behavior
- Use descriptive test names that explain what is being tested

### Integration Tests

Integration tests verify that multiple components work together correctly, using real databases but mocked external APIs.

**Example**: Testing MCP server tools with MSW mocks

```typescript
// src/services/api/mcpServer.int.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { rest } from "msw";
import { createTestContainer } from "../../test-utils/container";
import { McpServer } from "./mcpServer";

const server = setupServer(
  rest.get("https://api.squid.com/v1/tokens", (req, res, ctx) => {
    return res(
      ctx.json({
        tokens: [{ address: "0x...", symbol: "USDC", decimals: 6 }],
      })
    );
  })
);

describe("MCP Server Integration", () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it("should retrieve wallet balances through getWalletBalances tool", async () => {
    const container = await createTestContainer();
    const mcpServer = container.get(McpServer);

    const result = await mcpServer.callTool("getWalletBalances", {
      walletAddress: "0x...",
      chainIds: [1, 137],
    });

    expect(result).toHaveProperty("balances");
    expect(result.balances).toHaveLength(2);
  });
});
```

**Best Practices for Integration Tests:**

- Use MSW for HTTP mocking to ensure high-fidelity responses
- Use Testcontainers for real database testing (Memgraph)
- Validate complete workflows, not just individual calls
- Clean up resources in afterEach/afterAll hooks

### Live Integration Tests

Live tests connect to real services and are used for development verification and monitoring.

**Example**: Testing real wallet balances

```typescript
// tests/live/wallet-balance.live.test.ts
import { describe, it, expect } from "vitest";
import { DuneAdapter } from "../../src/adapters/dune/DuneAdapter";

describe.skipIf(!process.env.DUNE_API_KEY)("Live Wallet Balance Tests", () => {
  it("should fetch real mainnet wallet balances", async () => {
    const dune = new DuneAdapter(process.env.DUNE_API_KEY!);

    // Use a known wallet with balances
    const balances = await dune.getWalletBalances(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // vitalik.eth
      [1] // Ethereum mainnet
    );

    expect(balances).toBeDefined();
    expect(balances.length).toBeGreaterThan(0);
    // Don't assert specific values as they change
  });
});
```

**Best Practices for Live Tests:**

- Use `.skipIf()` to skip when credentials are missing
- Don't assert specific values that change over time
- Cache responses when possible to reduce API usage
- Keep test count minimal to avoid rate limits

## Mock Management

### Recording Mocks from Live APIs

Before you can use mocks in integration tests, you need to record them from live APIs. We provide a recording utility that captures real API responses and saves them as high-fidelity mocks.

**Step 1**: Ensure you have required API credentials

```bash
# Check .env for required keys
DUNE_API_KEY=your_key
BIRDEYE_API_KEY=your_key
COINGECKO_API_KEY=your_key
```

**Step 2**: Record mocks using the recording utility

```bash
# Record specific service mocks
pnpm tsx tests/mocks/utils/record-mocks.ts squid-route
pnpm tsx tests/mocks/utils/record-mocks.ts dune-wallet-balances
pnpm tsx tests/mocks/utils/record-mocks.ts coingecko-price-ethereum

# The utility will:
# 1. Make real API calls with your credentials
# 2. Validate responses against Zod schemas
# 3. Save responses to tests/mocks/data/<service>/<endpoint>.json
# 4. Include metadata (timestamp, expiration, API version)
```

**Available Recording Configurations**:

- `squid-route` - Squid Router API swap route
- `squid-chains` - Squid supported chains list
- `dune-wallet-balances` - Dune Analytics wallet balance query
- `coingecko-price-ethereum` - CoinGecko ETH price data
- `coingecko-coins-list` - CoinGecko full coins list
- `birdeye-token-price` - Birdeye token price data

**Step 3**: Verify recorded mocks

```bash
# Check that files were created
ls tests/mocks/data/

# Validate mocks against current live APIs
pnpm tsx tests/mocks/utils/validate-mocks.ts
```

**When to Record New Mocks**:

- Initial setup: Record all mocks before running integration tests
- New endpoints: When adding support for new API endpoints
- API updates: When drift detection reports changes
- Development: To capture specific test scenarios

**Mock Expiration**:

- Mocks include expiration dates (typically 30 days)
- Expired mocks are automatically ignored by the mock loader
- Re-record mocks when they expire or APIs change

### Creating Mocks with MSW

After recording real responses, we use Mock Service Worker (MSW) to serve them during tests.

**Step 1**: Define Zod schemas for API responses

```typescript
// src/adapters/squid/schemas.ts
import { z } from "zod";

export const SquidTokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  name: z.string(),
  logoURI: z.string().optional(),
});

export const SquidTokensResponseSchema = z.object({
  tokens: z.array(SquidTokenSchema),
});
```

**Step 2**: Create MSW handlers with schema validation

```typescript
// src/adapters/squid/__mocks__/handlers.ts
import { rest } from "msw";
import { SquidTokensResponseSchema } from "../schemas";
import tokensResponse from "./responses/tokens-v1.json";

export const handlers = [
  rest.get("https://api.squid.com/v1/tokens", (req, res, ctx) => {
    // Validate mock data against schema
    const validated = SquidTokensResponseSchema.parse(tokensResponse);
    return res(ctx.json(validated));
  }),
];
```

**Step 3**: Version your mock data

```json
// src/adapters/squid/__mocks__/responses/tokens-v1.json
{
  "_metadata": {
    "recordedAt": "2025-01-22T10:00:00Z",
    "apiVersion": "v1",
    "endpoint": "https://api.squid.com/v1/tokens"
  },
  "tokens": [
    {
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "decimals": 6,
      "name": "USD Coin"
    }
  ]
}
```

### Error Simulation with Real API Responses

The mock handlers use **real recorded API error responses** for high-fidelity testing. All error responses must be recorded from actual APIs - synthetic/hardcoded responses are not allowed.

**IMPORTANT**: Error responses are loaded from `tests/mocks/data/[service]/error-*.json` files. These files contain actual API error responses captured using the mock recording utility.

**1. Global Error Triggers**

```typescript
import {
  errorTriggers,
  resetErrorTriggers,
} from "../mocks/utils/error-simulation";

// Trigger specific errors for testing
// These load real recorded error responses from JSON files
errorTriggers.dune.rateLimit = true; // Loads error-rate-limit.json if available
errorTriggers.coingecko.serverError = true; // Loads error-server-error.json if available
errorTriggers.squid.authError = true; // Loads error-auth-error.json

// Reset after test
resetErrorTriggers();
```

**2. Available Error Types**
All error types use real recorded responses when available:

- **Rate Limit (429)**: Real rate limit response with actual headers
- **Server Error (500)**: Actual server error from the API
- **Auth Error (401)**: Real authentication failure response
- **Timeout (408)**: Simulated timeout (no recording needed)
- **Bad Request (400)**: Various validation errors from real APIs

**3. Service-Specific Errors**

All service-specific errors use real recorded responses:

```typescript
// These all use real recorded error responses from the APIs:

// Dune: Invalid address format - uses error-invalid-address-format.json
await duneAdapter.getBalance("invalid-address", [1]);

// CoinGecko: Invalid currency - uses error-invalid-currency.json
await coingeckoAdapter.getPrice("ethereum", "invalid_currency");

// Squid: Insufficient liquidity - uses error-insufficient-liquidity.json
await squidAdapter.getRoute({
  fromAmount: "999999999999999999999999999", // Triggers real error
  // ...
});
```

**4. Recording Error Responses**

To add new error scenarios:

1. Update `tests/utils/record-mocks.ts` with the error-triggering request:

```typescript
{
  name: "error-insufficient-liquidity",
  path: "/v2/route",
  method: "POST",
  key: "error-insufficient-liquidity",
  body: {
    fromAmount: "999999999999999999999999999", // Large amount to trigger error
    // ... other fields
  },
}
```

2. Run the recording script:

```bash
pnpm tsx tests/utils/record-mocks.ts
```

3. Verify the error response was recorded:

```bash
cat tests/mocks/data/squid/error-insufficient-liquidity.json
```

**5. Using in Tests**

```typescript
describe('Error Handling', () => {
  beforeEach(() => resetErrorTriggers());
  afterEach(() => resetErrorTriggers());

  it('should handle rate limit with real API response', async () => {
    // Triggers real recorded rate limit response
    errorTriggers.dune.rateLimit = true;

    try {
      await adapter.getBalance(...);
    } catch (error) {
      // Verify real API error format
      expect(error.response.status).toBe(429);
      expect(error.response.headers['retry-after']).toBeDefined();
    }
  });
});
```

**Key Principles**:

- ✅ All error responses MUST be recorded from real APIs
- ✅ Use `tests/utils/record-mocks.ts` to capture error scenarios
- ✅ Error responses are stored in `tests/mocks/data/[service]/error-*.json`
- ❌ NEVER use hardcoded/synthetic error responses
- ❌ NEVER create fake error objects in test code

### Mock Recording Workflow

**For New Developers**:

1. Clone the repository and install dependencies
2. Copy `.env.example` to `.env` and add API keys
3. Record all mocks (including errors): `pnpm test:record-mocks`
4. Run integration tests with recorded mocks

The `pnpm test:record-mocks` command records both successful and error responses:

### Recording API Responses

**1. Run the Mock Recording Script**

```bash
pnpm test:record-mocks
```

This single command captures:

- ✅ Successful API responses for normal operations
- ❌ Error responses (401, 400, 422, 404) for error handling tests
  - Invalid API keys (401)
  - Invalid parameters (400)
  - Missing required fields (422)
  - Rate limit errors (429) - when possible

**2. Review Recorded Mock Data**

```bash
ls tests/mocks/data/*/
```

Error responses are saved with `error-` prefix for easy identification.

**3. Key Findings from Real APIs**:

- **Dune**: Uses `error` field for auth errors, `message` for validation
- **CoinGecko**: Returns 200 with empty objects for invalid coins/currencies
- **Squid**: Uses `message` and `type` fields consistently

**4. Error Simulation System**
The `error-simulation.ts` file automatically loads real recorded error responses:

````typescript
// This function loads real recorded error responses
function createResponseFromMock(mockKey: string, service: string): Response {
  const mockData = loadMockData(service, mockKey);
  if (!mockData) {
    return HttpResponse.json({ error: "Mock data not found" }, { status: 500 });
  }

  // Returns the actual recorded API response
  return HttpResponse.json(mockData.response.body, {
    status: mockData.response.status,
    headers: mockData.response.headers
  });
}

**For Ongoing Development**:
1. Integration tests use existing mocks automatically via MSW
2. To update mocks: Re-run the recording command
3. Commit updated mocks with your feature changes
4. CI/CD uses committed mocks for deterministic testing

**Important Notes**:
- Mocks are **not** recorded automatically in GitHub workflows
- Recording is a **manual developer action** requiring valid API credentials
- Recorded mocks are committed to the repository for team use
- The `tests/mocks/data/` directory must be populated before integration tests can run properly

### Mock Drift Detection

To prevent mocks from becoming stale:

1. **Runtime Validation**: All mocks are validated against Zod schemas
2. **Automated Checks**: Weekly GitHub Action compares mocks to live APIs
3. **Issue Creation**: Drift detection automatically creates GitHub issues

Example drift detection workflow:
```yaml
# .github/workflows/mock-drift-check.yml
name: Mock Drift Detection
on:
  schedule:
    - cron: '0 0 * * 0' # Weekly on Sunday
  workflow_dispatch:

jobs:
  check-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm run check-mock-drift
      # Script creates issues on drift detection
````

## Running Tests

### Command Reference

```bash
# Run all tests (excluding live tests)
pnpm test

# Run specific test tiers
pnpm test:unit      # Unit tests only
pnpm test:int       # Integration tests only
pnpm test:live      # Live tests only (requires API keys)

# Run tests in watch mode during development
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run tests for specific files/patterns
pnpm test:grep -- "ERC20"

# Run existing Mocha tests
pnpm test:mocha
```

### CI/CD Execution

In CI/CD, only unit and integration tests run by default:

```bash
pnpm test:ci  # Runs test:unit && test:int
```

Live tests run on a separate schedule and don't block deployments.

## Migration Strategy

### "Migrate on Touch" Approach

When modifying existing Mocha tests:

1. **Don't migrate proactively** - Only when you need to modify the test
2. **Keep test logic** - Port the test assertions, not just rewrite
3. **Improve while migrating** - Add missing edge cases, improve names
4. **Update imports** - Change from `chai` to `vitest` assertions

**Before (Mocha)**:

```typescript
import { expect } from "chai";
import sinon from "sinon";

describe("TokenService", () => {
  it("should fetch token metadata", async () => {
    const stub = sinon.stub(api, "getToken").resolves({ symbol: "USDC" });
    const result = await service.getToken("0x...");
    expect(result.symbol).to.equal("USDC");
  });
});
```

**After (Vitest)**:

```typescript
import { describe, it, expect, vi } from "vitest";

describe("TokenService", () => {
  it("should fetch token metadata", async () => {
    vi.spyOn(api, "getToken").mockResolvedValue({ symbol: "USDC" });
    const result = await service.getToken("0x...");
    expect(result.symbol).toBe("USDC");
  });
});
```

## Testing Best Practices

### General Guidelines

1. **Test Behavior, Not Implementation**

   - Focus on what the code does, not how it does it
   - Avoid testing private methods directly

2. **Use Descriptive Names**

   - Test names should explain the scenario and expected outcome
   - Bad: `it('should work')`
   - Good: `it('should return zero when converting empty string to raw amount')`

3. **Follow AAA Pattern**

   - **Arrange**: Set up test data and mocks
   - **Act**: Execute the code under test
   - **Assert**: Verify the results

4. **One Assertion Per Test**

   - Each test should verify one specific behavior
   - Use multiple tests for multiple behaviors

5. **Clean Up Resources**
   - Always clean up in afterEach/afterAll hooks
   - Close database connections, stop mock servers

### Testing Financial Calculations

When testing financial operations:

1. **Test All Decimal Scenarios**

   - 6 decimals (USDC, USDT)
   - 8 decimals (WBTC)
   - 18 decimals (ETH, most tokens)

2. **Test Edge Cases**

   - Zero amounts
   - Maximum uint256 values
   - Negative amounts (should error)
   - Non-numeric inputs

3. **Use Exact String Comparisons**

   ```typescript
   // Good - precise comparison
   expect(toRawAmount("1.23", 6)).toBe("1230000");

   // Bad - loses precision
   expect(Number(toRawAmount("1.23", 6))).toBe(1230000);
   ```

### Database Testing Guidelines

1. **Unit Tests**: Mock the repository layer

   ```typescript
   const mockRepo = {
     findTokenByAddress: vi.fn().mockResolvedValue({ symbol: "USDC" }),
   };
   ```

2. **Integration Tests**: Use real Memgraph with Testcontainers

   ```typescript
   const container = await new GenericContainer("memgraph/memgraph")
     .withExposedPorts(7687)
     .start();
   ```

3. **Test Data Management**
   - Use fixtures for consistent test data
   - Clean database between tests
   - Don't rely on specific data ordering

## Troubleshooting

### Common Issues

1. **MSW Not Intercepting Requests**

   - Ensure server.listen() is called in beforeAll
   - Check that request URLs match exactly
   - Verify MSW handlers are imported

2. **Memgraph Container Fails to Start**

   - Check Docker is running
   - Ensure port 7687 is available
   - Verify sufficient memory allocated to Docker

3. **Tests Timing Out**

   - Increase timeout for integration tests: `it('...', { timeout: 30000 }, async () => {})`
   - Check for missing await statements
   - Verify external services are mocked

4. **Mock Validation Failures**
   - Update Zod schemas to match API changes
   - Regenerate mocks from live responses
   - Check for version mismatches

### Debug Mode

Run tests with debugging output:

```bash
# Vitest debug mode
pnpm test:watch -- --reporter=verbose

# With Node.js debugging
node --inspect-brk ./node_modules/.bin/vitest run
```

## Further Resources

- [Vitest Documentation](https://vitest.dev/)
- [MSW Documentation](https://mswjs.io/)
- [Testcontainers Documentation](https://testcontainers.com/)
- Project-specific docs:
  - `development/rationales.md` - Testing architecture decisions
  - `.vibecode/test-new-strategy-setup/prd.md` - Full testing PRD
  - `CLAUDE.md` - Project development guidelines
