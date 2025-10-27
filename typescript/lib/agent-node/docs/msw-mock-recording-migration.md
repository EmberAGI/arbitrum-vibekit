## MSW Mock Recording Migration Guide

This guide explains how to migrate the MSW-backed mock recording and replay system used in this repository to another TypeScript repository using Vitest.

- **What you get**
  - **Recorded mocks** with metadata and raw response bodies
  - **MSW handlers** that replay recorded responses
  - **Error simulation** toggles powered by real error recordings
  - **Utilities** to record, validate, and view mocks
  - **Vitest integration** and optional console suppression

---

### 1) Install dev dependencies

```bash
pnpm add -D msw vitest tsx zod typescript @types/node
```

If the target repo already uses Vitest/TypeScript, skip those.

---

### 2) Create folder structure

Replicate this structure in the target repo:

- `tests/setup/`
  - `vitest.setup.ts`
  - `msw.setup.ts`
- `tests/mocks/`
  - `handlers/` (one file per external service, plus `index.ts`)
  - `utils/`
    - `mock-loader.ts`
    - `error-simulation.ts`
    - `validate-mocks.ts` (optional drift detection)
    - `record-mocks.ts` (single-config recorder, optional)
- `tests/utils/`
  - `record-mocks.ts` (main multi-service recorder)
  - `record-squid-routes.ts` (example complex recorder; optional)
- `tests/mocks/data/`
  - `<service>/` (directory per service; JSON files go here)

---

### 3) Wire MSW into Vitest

Create `tests/setup/msw.setup.ts`:

```1:39:tests/setup/msw.setup.ts
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { handlers } from "../mocks/handlers/index.js";

// Create MSW server instance with all handlers
export const server = setupServer(...handlers);

// MSW server lifecycle management
beforeAll(() => {
  // Start the MSW server before running tests
  server.listen({
    onUnhandledRequest: (request, print) => {
      // Allow Docker API calls to pass through
      const url = request.url;
      if (
        url.includes("localhost") &&
        (url.includes("/containers") ||
          url.includes("/images") ||
          url.includes("/exec") ||
          url.includes("/info"))
      ) {
        return;
      }
      // Warn about other unhandled requests
      print.warning();
    },
  });
});

afterEach(() => {
  // Reset handlers between tests to prevent cross-test pollution
  server.resetHandlers();
});

afterAll(() => {
  // Clean up after all tests are done
  server.close();
});
```

Create `tests/setup/vitest.setup.ts`:

```1:8:tests/setup/vitest.setup.ts
// Vitest setup file - runs before all tests
import { beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import "./msw.setup";

// Load environment variables
dotenv.config();
```

Optionally suppress console noise:

```9:29:tests/setup/vitest.setup.ts
// Global setup
beforeAll(() => {
  // Set test environment flag
  process.env.NODE_ENV = "test";

  // Suppress console output during tests unless explicitly testing console
  if (!process.env.DEBUG_TESTS) {
    // Store original methods for restoration
    // @ts-expect-error adding to global for tests only
    global.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
    };

    // Override console methods
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    console.debug = () => {};
  }
});
```

Register setup in `vitest.config.ts`:

```36:39:vitest.config.ts
// Setup files
setupFiles: ["./tests/setup/vitest.setup.ts"],
```

Notes:

- For browser-like environments, use MSW’s `setupWorker`; this guide uses `msw/node` for Node tests.

---

### 4) Mock file format and loader

Store recorded mocks as JSON with metadata and base64 raw bodies. Create `tests/mocks/utils/mock-loader.ts` with Zod schemas and helpers:

```15:29:tests/mocks/utils/mock-loader.ts
// Mock data schema
export const mockDataSchema = z.object({
  metadata: mockMetadataSchema,
  request: z.object({
    headers: z.record(z.string()).optional(),
    params: z.record(z.unknown()).optional(),
    body: z.unknown().optional(),
  }),
  response: z.object({
    status: z.number(),
    headers: z.record(z.string()).optional(),
    rawBody: z.string(), // Base64 encoded raw response - required
  }),
});
```

```35:48:tests/mocks/utils/mock-loader.ts
export async function saveMockData(
  service: string,
  key: string,
  data: MockData,
): Promise<void> {
  const mockDir = path.join(process.cwd(), "tests/mocks/data", service);
  const mockPath = path.join(mockDir, `${key}.json`);

  // Ensure directory exists
  await fs.mkdir(mockDir, { recursive: true });

  // Save mock data with newline at end for prettier compatibility
  await fs.writeFile(mockPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
```

```53:83:tests/mocks/utils/mock-loader.ts
export async function recordMockData(
  service: string,
  endpoint: string,
  method: string,
  request: {
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    body?: unknown;
  },
  response: {
    status: number;
    headers?: Record<string, string>;
    rawBody: string;
  },
  key: string,
  apiVersion?: string,
): Promise<void> {
  const mockData: MockData = {
    metadata: {
      service,
      endpoint,
      method,
      recordedAt: new Date().toISOString(),
      apiVersion,
    },
    request,
    response,
  };

  await saveMockData(service, key, mockData);
}
```

```89:121:tests/mocks/utils/mock-loader.ts
export async function loadFullMockData(
  service: string,
  key: string,
): Promise<MockData | null> {
  try {
    const mockPath = path.join(
      process.cwd(),
      "tests/mocks/data",
      service,
      `${key}.json`,
    );

    const fileContent = await fs.readFile(mockPath, "utf-8");
    const mockData = mockDataSchema.parse(JSON.parse(fileContent));

    // Optional expiry check
    if (mockData.metadata.expiresAt) {
      const expiryDate = new Date(mockData.metadata.expiresAt);
      if (expiryDate < new Date()) {
        console.warn(`Mock data expired: ${service}/${key}`);
        return null;
      }
    }

    return mockData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
```

---

### 5) Handlers that replay recorded mocks

Aggregate handlers in `tests/mocks/handlers/index.ts`:

```6:12:tests/mocks/handlers/index.ts
export const handlers = [
  ...squidHandlers,
  ...duneHandlers,
  ...birdeyeHandlers,
  ...coingeckoHandlers,
];
```

Example service handler with error simulation and deterministic `mockKey` mapping:

```9:45:tests/mocks/handlers/coingecko.ts
export const coingeckoHandlers = [
  // Get token price handler
  http.get(`${COINGECKO_API_URL}/simple/price`, async ({ request }) => {
    const errorResponse = await checkErrorTriggers("coingecko");
    if (errorResponse) return errorResponse;

    const url = new URL(request.url);
    const ids = url.searchParams.get("ids");

    const mockKey = `price-${ids}`;
    return createResponseFromMock(mockKey, "coingecko");
  }),

  // Get token market data handler
  http.get(`${COINGECKO_API_URL}/coins/:id`, async ({ params }) => {
    const errorResponse = await checkErrorTriggers("coingecko");
    if (errorResponse) return errorResponse;

    const { id } = params;
    const mockKey = `token-${id}`;
    return createResponseFromMock(mockKey, "coingecko");
  }),

  // Get coins list handler
  http.get(`${COINGECKO_API_URL}/coins/list`, async () => {
    const errorResponse = await checkErrorTriggers("coingecko");
    if (errorResponse) return errorResponse;

    return createResponseFromMock("coins-list", "coingecko");
  }),
];
```

Error simulation and replay utility in `tests/mocks/utils/error-simulation.ts`:

```105:166:tests/mocks/utils/error-simulation.ts
export async function createResponseFromMock(
  mockKey: string,
  service: string,
): Promise<Response> {
  const mockData = await loadFullMockData(service, mockKey);
  if (!mockData) {
    throw new Error(
      `[MSW Handler] Missing mock data: ${service}/${mockKey}.json`,
    );
  }

  const encodedBytes = Buffer.from(mockData.response.rawBody, "base64");

  const originalHeaders = mockData.response.headers || {};
  const headersLower = Object.fromEntries(
    Object.entries(originalHeaders).map(([k, v]) => [k.toLowerCase(), v]),
  ) as Record<string, string>;
  const contentEncoding = headersLower["content-encoding"]?.toLowerCase();

  let bodyBytes: Buffer = encodedBytes;
  try {
    if (contentEncoding === "br") {
      bodyBytes = brotliDecompressSync(encodedBytes);
    } else if (contentEncoding === "gzip" || contentEncoding === "x-gzip") {
      bodyBytes = gunzipSync(encodedBytes);
    } else if (contentEncoding === "deflate") {
      bodyBytes = inflateSync(encodedBytes);
    }
  } catch (_e) {
    bodyBytes = encodedBytes;
  }

  const replayHeaders: Record<string, string> = Object.fromEntries(
    Object.entries(originalHeaders).filter(([key]) => {
      const k = key.toLowerCase();
      return (
        k !== "content-encoding" &&
        k !== "content-length" &&
        k !== "transfer-encoding"
      );
    }),
  );

  if (
    !Object.keys(replayHeaders).some((k) => k.toLowerCase() === "content-type")
  ) {
    replayHeaders["content-type"] = "application/json";
  }

  return new Response(bodyBytes, {
    status: mockData.response.status,
    headers: replayHeaders,
  });
}
```

---

### 6) Implement the recorder (captures live responses as base64)

Create `tests/utils/record-mocks.ts` that defines endpoints per service, requests using raw bytes, and writes mocks via `recordMockData`.

Capture exact server bytes:

```245:340:tests/utils/record-mocks.ts
async function makeRequest(
  baseUrl: string,
  endpoint: MockEndpoint,
  apiKey?: string,
): Promise<{
  status: number;
  headers: Record<string, string>;
  rawBody: string;
}> {
  const pathWithoutQuery = endpoint.path.split("?")[0];
  const cleanPath = pathWithoutQuery.startsWith("/")
    ? pathWithoutQuery.slice(1)
    : pathWithoutQuery;
  const url = new URL(`${baseUrl}/${cleanPath}`);

  if (endpoint.params) {
    Object.entries(endpoint.params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "mock-recorder/1.0",
  };

  if (endpoint.headers) {
    Object.assign(headers, endpoint.headers);
  }

  if (endpoint.requiresAuth && apiKey) {
    if (baseUrl.includes("coingecko")) {
      headers["x-cg-demo-api-key"] = apiKey;
    } else if (baseUrl.includes("dune")) {
      headers["X-DUNE-API-KEY"] = apiKey;
    }
  }

  const axiosConfig = {
    url: url.toString(),
    method: endpoint.method,
    headers,
    responseType: "arraybuffer" as const,
    decompress: false,
    validateStatus: () => true,
  };

  if (
    endpoint.body &&
    (endpoint.method === "POST" || endpoint.method === "PUT")
  ) {
    axiosConfig.data = endpoint.body;
    headers["Content-Type"] = "application/json";
  }

  const response = await axios(axiosConfig);

  const responseHeaders: Record<string, string> = {};
  Object.entries(response.headers).forEach(([key, value]) => {
    if (typeof value === "string") {
      responseHeaders[key] = value;
    }
  });

  const rawBody = Buffer.from(response.data).toString("base64");

  return { status: response.status, headers: responseHeaders, rawBody };
}
```

Write a recorded response:

```362:375:tests/utils/record-mocks.ts
await recordMockData(
  "coingecko",
  endpoint.path,
  endpoint.method,
  {
    headers: endpoint.requiresAuth
      ? { "x-cg-demo-api-key": "***" }
      : {},
    params: endpoint.params,
  },
  response,
  endpoint.key,
  "v3",
);
```

Recommendations:

- Redact secrets in `request.headers` before saving.
- Choose deterministic `mockKey` names and mirror in handlers.

---

### 7) Optional utilities

- Human-readable mock viewer `scripts/view-mock.ts` (decodes raw body and attempts decompression). Add a script:

```json
{
  "scripts": {
    "view:mock": "tsx scripts/view-mock.ts"
  }
}
```

- Drift detection in `tests/mocks/utils/validate-mocks.ts` can compare recorded mocks to live endpoints and fail CI if drift is detected. Tailor validations per service.

---

### 8) Package scripts

Add scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:int": "vitest run .int.test",
    "test:record-mocks": "tsx tests/utils/record-mocks.ts",
    "view:mock": "tsx scripts/view-mock.ts"
  }
}
```

---

### 9) Environment variables

Create `.env.example` and `.env` with required keys used by the recorder/handlers (e.g., `COINGECKO_API_KEY`, `DUNE_API_KEY`).

Ensure recorded files do not contain actual secrets—redact with `"***"` in stored headers.

---

### 10) Using mocks in tests

MSW is enabled globally via Vitest `setupFiles`. In tests, you can toggle error modes using triggers:

```ts
import { errorTriggers, resetErrorTriggers } from 'tests/mocks/utils/error-simulation';

beforeEach(() => {
  resetErrorTriggers();
});

it('handles rate limits', async () => {
  errorTriggers.coingecko.rateLimit = true;
  // ... assertions
});
```

---

### 11) Recording workflow

- Record all configured mocks:

```bash
pnpm test:record-mocks
```

- Or record a single config (if you add the per-config CLI):

```bash
pnpm tsx tests/mocks/utils/record-mocks.ts coingecko-price
```

- View a mock:

```bash
pnpm view:mock coingecko simple-price-ethereum
```

- Debug with test logs:

```bash
DEBUG_TESTS=1 pnpm test:int
```

---

### 12) Service onboarding checklist

- Add a handler in `tests/mocks/handlers/<service>.ts` mapping requests to a `mockKey`.
- Add endpoints in `tests/utils/record-mocks.ts` with stable `key` values.
- Run `pnpm test:record-mocks` and verify files under `tests/mocks/data/<service>/`.
- Use the handler (or `handlers/index.ts`) in your tests.
- Optionally add recorded error responses and wire error triggers.

---

### 13) Pitfalls and fixes

- Ensure the recorder uses `responseType: "arraybuffer"` and `decompress: false`.
- Keep handler and recorder `mockKey` naming consistent.
- Strip transport headers when replaying and ensure a valid `content-type`.
- Whitelist infra pass-throughs (e.g., Docker) in `onUnhandledRequest`.
- Redact secrets in recorded request metadata.
- Use Node environment (`environment: "node"`) unless you need browser workers.

---

### Minimal E2E trace

- Handler maps request to `mockKey` and replays:

```9:22:tests/mocks/handlers/coingecko.ts
http.get(`${COINGECKO_API_URL}/simple/price`, async ({ request }) => {
  const errorResponse = await checkErrorTriggers("coingecko");
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const ids = url.searchParams.get("ids");
  const mockKey = `price-${ids}`;
  return createResponseFromMock(mockKey, "coingecko");
}),
```

- Recorder captures and writes:

```362:375:tests/utils/record-mocks.ts
await recordMockData(
  "coingecko",
  endpoint.path,
  endpoint.method,
  {
    headers: endpoint.requiresAuth
      ? { "x-cg-demo-api-key": "***" }
      : {},
    params: endpoint.params,
  },
  response,
  endpoint.key,
  "v3",
);
```

This reproduces the end-to-end behavior: deterministic keys, raw-body fidelity, and realistic error simulation.
