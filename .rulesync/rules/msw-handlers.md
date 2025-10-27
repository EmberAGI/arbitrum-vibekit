---
targets: ['*']
description: 'MSW handler rules for integration test fidelity'
globs: ['**/tests/mocks/**/*']
---

# MSW Handler Rules

## Purpose

MSW (Mock Service Worker) handlers exist to replay **exact recordings** of real API responses in integration tests. This ensures tests validate that your application code correctly handles real API contracts.

## Core Principle

**MSW handlers are tape recorders, not API simulators.** They replay what was recorded—nothing more, nothing less.

## ✅ Allowed Behaviors

### Request Routing and Matching

- Match requests by URL, HTTP method, headers, or body content
- Route to appropriate mock files based on request characteristics
- Extract request parameters to determine which mock to load

### Mock Replay

- Load recorded mock files from `tests/mocks/data/`
- Return recorded response data **completely unmodified**
- Preserve original response headers, status codes, and body

### Example (Allowed)

```typescript
http.post(`${API_URL}/endpoint`, async ({ request }) => {
  const body = await request.json();
  const mockKey = computeMockKey(body); // Determine which mock to use
  return await createResponseFromMock(mockKey, 'service-name'); // Return unmodified
});
```

## ❌ Forbidden Behaviors

### 1. Data Transformation

**Never transform, modify, or restructure recorded response data.**

❌ Bad:

```typescript
// Converting between API formats
const converted = convertChatCompletionToResponsesPayload(mockData);
return new Response(JSON.stringify(converted));

// Merging/restructuring fields
delta.content = `${delta.content}${delta.reasoning}`;
delta.reasoning = null;
```

✅ Good:

```typescript
// Return the mock exactly as recorded
return await createResponseFromMock(mockKey, 'service');
```

**Why**: If your application can't handle the real API format, tests should fail to expose the bug.

### 2. Synthetic/Fallback Responses

**Never generate responses that weren't recorded from real APIs.**

❌ Bad:

```typescript
try {
  return await createResponseFromMock(mockKey, 'service');
} catch {
  // Fallback hides missing mocks!
  return new Response(
    JSON.stringify({
      id: 'fallback',
      data: 'synthetic response',
    }),
  );
}
```

✅ Good:

```typescript
// Let it fail - forces recording the real response
return await createResponseFromMock(mockKey, 'service');
```

**Why**: Missing mocks indicate gaps in test coverage. Tests should fail loudly.

### 3. Synthetic Error Simulation

**Never synthesize error responses. Only replay errors actually recorded from APIs.**

❌ Bad:

```typescript
// Error trigger utility that generates synthetic errors
const errorResponse = await checkErrorTriggers('service');
if (errorResponse) {
  return errorResponse; // Synthetic error format!
}
```

✅ Good:

```typescript
// Record actual API errors via pnpm test:record-mocks
// Then replay them like any other mock
return await createResponseFromMock('error-404-not-found', 'service');
```

**Why**: Synthetic errors may not match real API error formats.

### 4. Business Logic Implementation

**Never implement API behavior, validation, or business rules.**

### 5. Schema Validation in Handlers/Loader

**Do not run schema validation in MSW handlers or in the mock loader.** Handlers must replay recorded responses exactly; validation belongs at application boundaries or in separate CI drift checks.

✅ Good:

```typescript
// Replay exactly what was recorded
return await createResponseFromMock(mockKey, 'service');
```

❌ Bad:

```typescript
// Validating inside handler/loader couples tests to schema libs/versions
SomeZodSchema.parse(recordedResponse);
```

**Why**: Validation in replay path adds fragility and couples tests to schema versions. Keep replay pure; validate at the app boundary or via a CI job that checks mocks against schemas.

❌ Bad:

```typescript
// Implementing RPC methods with hardcoded values
switch (method) {
  case 'eth_chainId':
    return jsonRpcResult(id, '0x1'); // Synthetic!
  case 'eth_gasPrice':
    return jsonRpcResult(id, '0x3b9aca00'); // Synthetic!
}
```

✅ Good:

```typescript
// Record real JSON-RPC responses via pnpm test:record-mocks
const mockKey = `${method}-${params.join('-')}`;
return await createResponseFromMock(mockKey, 'rpc-provider');
```

**Why**: Handlers aren't API implementations. Real APIs may return different values.

## Recording Requirements

### All HTTP Requests Must Be Recorded

**This includes**:

- REST APIs
- GraphQL endpoints
- JSON-RPC over HTTP (e.g., Ethereum RPC, viem calls)
- SDK calls that make HTTP requests internally
- Streaming endpoints

**Process**:

1. Ensure API keys are configured in `.env`
2. Run `pnpm test:record-mocks` to capture real responses
3. Mocks are saved to `tests/mocks/data/[service]/`
4. Handlers replay these recordings unmodified

### Optional: Mock Validation and Drift Checks

- If you require schema validation, run it outside the test runtime (e.g., `pnpm run check-mock-drift` in CI) to compare recorded mocks with current schemas or live APIs.
- Avoid per-test validation to keep MSW replay deterministic and decoupled from schema libraries.

### When Tests Fail Due to Missing Mocks

**Tests MUST fail with a clear error message**:

```
Error: No mock found for POST https://api.example.com/v1/endpoint
Request body: {"model": "gpt-4", "messages": [...]}

To fix: Run `pnpm test:record-mocks` to record this API call
```

**Never add fallback responses to "fix" missing mocks.**

## Error Testing

### Only Test Recorded Errors

**To test error scenarios**:

1. Trigger the error condition during mock recording
2. Capture the real error response
3. Replay it in tests

**Never**:

- Generate synthetic error responses
- Use error simulation utilities
- Guess at error formats

**Why**: Real API errors may have specific formats (error codes, nested structures, etc.) that synthetic errors won't match.

## Architecture

```
tests/mocks/
├── data/              # Recorded API responses (JSON files)
│   ├── openai/
│   ├── openrouter/
│   └── [service]/
├── handlers/          # MSW request handlers (route to mocks)
│   ├── openai.ts
│   ├── openrouter.ts
│   └── index.ts
└── utils/             # Mock loading utilities
    └── error-simulation.ts  ⚠️ Should only load recorded errors
```

## Summary

| Activity                     | Allowed? | Location                 |
| ---------------------------- | -------- | ------------------------ |
| Request routing/matching     | ✅ Yes   | Handlers                 |
| Loading recorded mocks       | ✅ Yes   | Handlers                 |
| Transforming response data   | ❌ No    | Never                    |
| Synthetic/fallback responses | ❌ No    | Never                    |
| Error simulation utilities   | ❌ No    | Never                    |
| Format conversion            | ❌ No    | Never                    |
| Recording real API calls     | ✅ Yes   | `pnpm test:record-mocks` |
| Data transformation logic    | ✅ Yes   | Application code (src/)  |

**Remember**: Integration tests exist to prove your application handles real APIs correctly. Handlers that modify data undermine this goal.
