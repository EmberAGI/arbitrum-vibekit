# Ember Agent Tests

This directory contains tests for the Ember Agent, including integration tests for the Ember MCP server.

## getCapabilities Integration Test

The `getCapabilities-integration.vitest.ts` file contains tests for the Ember MCP server's `getCapabilities` tool.

### Running the Tests

1. **Unit Tests (Always Run)**

   ```bash
   pnpm test getCapabilities-integration
   ```

   These tests use mocked clients and don't require any external services.

2. **Integration Tests (Optional)**

   To run the real integration test against the Ember MCP server, you need to set the environment variable:

   ```bash
   # Set your Ember MCP server URL
   export EMBER_MCP_SERVER_URL="https://api.emberai.xyz/mcp"

   # Run the tests
   pnpm test getCapabilities-integration
   ```

   The integration test will be skipped if this environment variable is not set.

### Test Coverage

The test file includes:

1. **Mock Tests** - Validate response structure and error handling:
   - SWAP capability validation
   - LENDING_MARKET capability validation
   - Error handling scenarios
   - Empty response handling

2. **Integration Test** - Real connection to Ember MCP server:
   - Connects using StreamableHTTPClientTransport
   - Calls the getCapabilities tool
   - Validates response structure
   - Only runs when environment variables are set

### Example Output

When running with environment variables set:

```
✓ should validate getCapabilities response structure with mocked client
✓ should handle LENDING_MARKET capability type
✓ should handle errors gracefully
✓ should handle empty capabilities response
✓ should connect to real Ember MCP server and call getCapabilities
  Connected to Ember MCP server
  Received 15 capabilities
```

### Troubleshooting

1. **Connection Errors**: Ensure your EMBER_MCP_SERVER_URL is correct and accessible
2. **Timeout Errors**: The integration test has a 30-second timeout, which should be sufficient
