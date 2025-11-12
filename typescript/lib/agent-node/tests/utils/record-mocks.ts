import axios from 'axios';

import { recordMockData } from '../mocks/utils/mock-loader.js';

interface MockEndpoint {
  path: string;
  method: string;
  key: string;
  requiresAuth?: boolean;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  body?: unknown;
}

interface ServiceConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  endpoints: MockEndpoint[];
}

async function makeRequest(
  baseUrl: string,
  endpoint: MockEndpoint,
  apiKey?: string,
): Promise<{
  status: number;
  headers: Record<string, string>;
  rawBody: string;
}> {
  const pathWithoutQuery = endpoint.path.split('?')[0];
  const cleanPath = pathWithoutQuery.startsWith('/') ? pathWithoutQuery.slice(1) : pathWithoutQuery;
  const url = new URL(`${baseUrl}/${cleanPath}`);

  if (endpoint.params) {
    Object.entries(endpoint.params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'mock-recorder/1.0',
  };

  if (endpoint.headers) {
    Object.assign(headers, endpoint.headers);
  }

  if (endpoint.requiresAuth && apiKey) {
    if (
      baseUrl.includes('openrouter') ||
      baseUrl.includes('openai.com') ||
      baseUrl.includes('x.ai') ||
      baseUrl.includes('hyperbolic')
    ) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  const axiosConfig = {
    url: url.toString(),
    method: endpoint.method,
    headers,
    responseType: 'arraybuffer' as const,
    decompress: false,
    validateStatus: () => true,
  };

  if (endpoint.body && (endpoint.method === 'POST' || endpoint.method === 'PUT')) {
    axiosConfig['data'] = endpoint.body;
    headers['Content-Type'] = 'application/json';
  }

  const response = await axios(axiosConfig);

  const responseHeaders: Record<string, string> = {};
  Object.entries(response.headers).forEach(([key, value]) => {
    if (typeof value === 'string') {
      responseHeaders[key] = value;
    }
  });

  const rawBody = Buffer.from(response.data).toString('base64');

  return { status: response.status, headers: responseHeaders, rawBody };
}

async function recordService(config: ServiceConfig): Promise<void> {
  console.log(`\nRecording mocks for ${config.name}...`);

  for (const endpoint of config.endpoints) {
    try {
      console.log(`  Recording: ${endpoint.key}`);

      const response = await makeRequest(config.baseUrl, endpoint, config.apiKey);

      await recordMockData(
        config.name,
        endpoint.path,
        endpoint.method,
        {
          headers: endpoint.requiresAuth ? { Authorization: '***' } : {},
          params: endpoint.params,
          body: endpoint.body,
        },
        response,
        endpoint.key,
      );

      console.log(`    ✓ Saved to tests/mocks/data/${config.name}/${endpoint.key}.json`);
    } catch (error) {
      console.error(`    ✗ Failed: ${(error as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  const OPENROUTER_API_KEY = process.env['OPENROUTER_API_KEY'];
  const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
  const XAI_API_KEY = process.env['XAI_API_KEY'];
  const HYPERBOLIC_API_KEY = process.env['HYPERBOLIC_API_KEY'];

  if (!OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY environment variable is required');
    console.error(
      'Add it to your .env file or pass it as: OPENROUTER_API_KEY=xxx pnpm test:record-mocks',
    );
    process.exit(1);
  }

  const services: ServiceConfig[] = [
    {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai',
      apiKey: OPENROUTER_API_KEY,
      endpoints: [
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'simple-inference',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: 'What is 2+2?' }],
            stream: false,
          },
        },
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'streaming-simple',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: 'What is 2+2?' }],
            stream: true,
          },
        },
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'streaming-with-context',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-oss-120b',
            messages: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi! How can I help you?' },
              { role: 'user', content: 'Process this message' },
            ],
            stream: true,
          },
        },
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'streaming-heartbeat',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: 'Test heartbeat' }],
            stream: true,
          },
        },
        // Workflow dispatch with tool calling
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'streaming-workflow-dispatch',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are an AI agent that can dispatch workflows. Use the dispatch_workflow_* tools to start workflows when requested.',
              },
              {
                role: 'user',
                content: 'Please execute the defi-strategy-lifecycle-mock workflow',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'dispatch_workflow_defi_strategy_lifecycle_mock',
                  description: 'Dispatch the defi-strategy-lifecycle-mock workflow',
                  parameters: {
                    type: 'object',
                    properties: {
                      params: {
                        type: 'object',
                        description: 'Optional parameters for the workflow',
                      },
                    },
                  },
                },
              },
            ],
            tool_choice: 'auto',
            stream: true,
          },
        },
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'workflow-dispatch',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are an AI agent that can dispatch workflows. Use the dispatch_workflow_* tools to start workflows when requested.',
              },
              {
                role: 'user',
                content: 'Please execute the defi-strategy-lifecycle-mock workflow',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'dispatch_workflow_defi_strategy_lifecycle_mock',
                  description: 'Dispatch the defi-strategy-lifecycle-mock workflow',
                  parameters: {
                    type: 'object',
                    properties: {
                      params: {
                        type: 'object',
                        description: 'Optional parameters for the workflow',
                      },
                    },
                  },
                },
              },
            ],
            tool_choice: 'auto',
            stream: false,
          },
        },
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'streaming-multi-tool-dispatch',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an AI agent that can dispatch workflows using tools.',
              },
              {
                role: 'user',
                content: 'Start both workflow filter_test_1 and filter_test_2',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'dispatch_workflow_filter_test_1',
                  description: 'Dispatch the filter_test_1 workflow',
                  parameters: { type: 'object', properties: {} },
                },
              },
              {
                type: 'function',
                function: {
                  name: 'dispatch_workflow_filter_test_2',
                  description: 'Dispatch the filter_test_2 workflow',
                  parameters: { type: 'object', properties: {} },
                },
              },
            ],
            tool_choice: 'auto',
            stream: true,
          },
        },
        // Error response mocks
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'rate-limit-error',
          requiresAuth: true,
          body: {
            model: 'openai/gpt-4o-mini:free', // Free model with tight rate limits
            messages: [{ role: 'user', content: 'Test rate limit' }],
            stream: false,
          },
        },
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'server-error',
          requiresAuth: false, // Don't add auth header
          headers: { Authorization: 'Bearer invalid-key-xxx' }, // Invalid auth to trigger error
          body: {
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: 'Test server error' }],
            stream: false,
          },
        },
        {
          path: '/api/v1/chat/completions',
          method: 'POST',
          key: 'gateway-timeout',
          requiresAuth: true,
          body: {
            model: 'non-existent-model/xyz-123', // Non-existent model to trigger error
            messages: [{ role: 'user', content: 'Test gateway timeout' }],
            stream: false,
          },
        },
      ],
    },
  ];

  // Add optional provider services if API keys are available
  if (OPENAI_API_KEY) {
    services.push({
      name: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: OPENAI_API_KEY,
      endpoints: [
        {
          // @ai-sdk/openai v2.x uses Responses API by default
          path: '/v1/responses',
          method: 'POST',
          key: 'simple-inference',
          requiresAuth: true,
          body: {
            model: 'gpt-4o-mini',
            input: [{ role: 'user', content: 'Hello world' }],
            stream: false,
          },
        },
        {
          path: '/v1/responses',
          method: 'POST',
          key: 'custom-model',
          requiresAuth: true,
          body: {
            model: 'gpt-4o',
            input: [{ role: 'user', content: 'Test custom model' }],
            stream: false,
          },
        },
        {
          path: '/v1/responses',
          method: 'POST',
          key: 'default-model',
          requiresAuth: true,
          body: {
            model: 'gpt-4o-mini',
            input: [{ role: 'user', content: 'Test default model' }],
            stream: false,
          },
        },
      ],
    });
  }

  if (XAI_API_KEY) {
    services.push({
      name: 'xai',
      baseUrl: 'https://api.x.ai',
      apiKey: XAI_API_KEY,
      endpoints: [
        {
          path: '/v1/chat/completions',
          method: 'POST',
          key: 'simple-inference',
          requiresAuth: true,
          body: {
            model: 'grok-4-fast-non-reasoning',
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false,
          },
        },
        {
          path: '/v1/chat/completions',
          method: 'POST',
          key: 'custom-model',
          requiresAuth: true,
          body: {
            model: 'grok-4-fast-non-reasoning',
            messages: [{ role: 'user', content: 'Test custom model' }],
            stream: false,
          },
        },
        {
          path: '/v1/chat/completions',
          method: 'POST',
          key: 'default-model',
          requiresAuth: true,
          body: {
            model: 'grok-4-fast-reasoning',
            messages: [{ role: 'user', content: 'Test default model' }],
            stream: false,
          },
        },
      ],
    });
  }

  if (HYPERBOLIC_API_KEY) {
    services.push({
      name: 'hyperbolic',
      baseUrl: 'https://api.hyperbolic.xyz',
      apiKey: HYPERBOLIC_API_KEY,
      endpoints: [
        {
          path: '/v1/chat/completions',
          method: 'POST',
          key: 'simple-inference',
          requiresAuth: true,
          body: {
            model: 'meta-llama/Llama-3.2-3B-Instruct',
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false,
          },
        },
        {
          path: '/v1/chat/completions',
          method: 'POST',
          key: 'custom-model',
          requiresAuth: true,
          body: {
            model: 'Qwen/Qwen2.5-72B-Instruct',
            messages: [{ role: 'user', content: 'Test custom model' }],
            stream: false,
          },
        },
        {
          path: '/v1/chat/completions',
          method: 'POST',
          key: 'default-model',
          requiresAuth: true,
          body: {
            model: 'meta-llama/Llama-3.2-3B-Instruct',
            messages: [{ role: 'user', content: 'Test default model' }],
            stream: false,
          },
        },
      ],
    });
  }

  // Add viem JSON-RPC mocks for wallet integration tests
  services.push({
    name: 'viem',
    baseUrl: 'https://eth.merkle.io',
    endpoints: [
      {
        path: '/',
        method: 'POST',
        key: 'eth_gasPrice',
        body: {
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1,
        },
      },
      {
        path: '/',
        method: 'POST',
        key: 'eth_getBlockByNumber-latest-false',
        body: {
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
          id: 1,
        },
      },
    ],
  });

  console.log('=== Mock Recording Start ===');
  console.log('Recording real API responses for MSW replay...\n');

  for (const service of services) {
    await recordService(service);
  }

  console.log('\n=== Recording Complete ===');
  console.log('Mocks saved to tests/mocks/data/');
  console.log('\nRun tests with: pnpm test:int');
}

main().catch((error) => {
  console.error('Recording failed:', error);
  process.exit(1);
});
