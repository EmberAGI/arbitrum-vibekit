import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { Model } from '@mariozechner/pi-ai';
import type * as OpenAIResponsesModule from '@mariozechner/pi-ai/openai-responses';
import { afterEach, describe, expect, it } from 'vitest';

function createModel(baseUrl: string): Model<'openai-responses'> {
  return {
    id: 'openai/gpt-5.4-mini',
    name: 'openai/gpt-5.4-mini',
    api: 'openai-responses',
    provider: 'openrouter',
    baseUrl,
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of request as AsyncIterable<string | Buffer>) {
    body += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  }

  return body;
}

async function startProviderFailureServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      await readRequestBody(request);
      response.statusCode = 400;
      response.setHeader('content-type', 'application/json');
      response.setHeader('x-request-id', 'req_nested_provider_error');
      response.end(
        JSON.stringify({
          error: {
            message: 'Provider returned error',
            code: 'provider_validation_failed',
            type: 'invalid_request_error',
            metadata: {
              raw: 'Upstream provider rejected the request because the tool schema was invalid.',
            },
          },
        }),
      );
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected provider failure test server to bind to an address.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

const cleanupFns = new Set<() => Promise<void> | void>();

afterEach(async () => {
  for (const cleanup of cleanupFns) {
    await cleanup();
  }
  cleanupFns.clear();
});

describe('openai-responses provider errors', () => {
  it('surfaces nested provider diagnostics instead of a generic provider returned error message', async () => {
    const providerServer = await startProviderFailureServer();
    cleanupFns.add(providerServer.close);

    const importedModule: unknown = await import(
      new URL(
        '../../node_modules/.pnpm/node_modules/@mariozechner/pi-ai/dist/providers/openai-responses.js',
        import.meta.url,
      ).href
    );
    const { streamOpenAIResponses } = importedModule as typeof OpenAIResponsesModule;

    const stream = streamOpenAIResponses(
      createModel(providerServer.baseUrl),
      {
        systemPrompt: 'Diagnose provider failures.',
        messages: [
          {
            role: 'user',
            content: 'Retry the plan.',
            timestamp: 1,
          },
        ],
      },
      {
        apiKey: 'test-openrouter-key',
        reasoningEffort: 'low',
      },
    );

    const finalMessage = await stream.result();

    expect(finalMessage.stopReason).toBe('error');
    expect(finalMessage.errorMessage).toContain(
      'Upstream provider rejected the request because the tool schema was invalid.',
    );
    expect(finalMessage.errorMessage).toContain('HTTP 400');
    expect(finalMessage.errorMessage).toContain('provider_validation_failed');
    expect(finalMessage.errorMessage).toContain('invalid_request_error');
    expect(finalMessage.errorMessage).not.toBe('400 Provider returned error');
  });
});
