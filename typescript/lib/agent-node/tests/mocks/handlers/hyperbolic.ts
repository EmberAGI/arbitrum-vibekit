import { http } from 'msw';

import { checkErrorTriggers, createResponseFromMock } from '../utils/error-simulation.js';

const HYPERBOLIC_API_URL = 'https://api.hyperbolic.xyz/v1';

/**
 * Compute deterministic mockKey from request body
 * Maps request messages to the mock file key
 */
function computeMockKey(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return 'simple-inference';
  }

  const requestBody = body as {
    messages?: Array<{ role: string; content: string }>;
    model?: string;
  };

  if (!requestBody.messages || requestBody.messages.length === 0) {
    return 'simple-inference';
  }

  // Get last user message content
  const lastUserMessage = requestBody.messages.filter((m) => m.role === 'user').pop();

  if (!lastUserMessage) {
    return 'simple-inference';
  }

  const content = lastUserMessage.content.toLowerCase();

  // Map message content to mock keys
  if (content.includes('hello')) {
    return 'simple-inference';
  }

  if (content.includes('custom model')) {
    return 'custom-model';
  }

  if (content.includes('default model')) {
    return 'default-model';
  }

  return 'simple-inference';
}

export const hyperbolicHandlers = [
  // Chat completions
  http.post(`${HYPERBOLIC_API_URL}/chat/completions`, async ({ request }) => {
    const errorResponse = await checkErrorTriggers('hyperbolic');
    if (errorResponse) {
      return errorResponse;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const mockKey = computeMockKey(body);
    return await createResponseFromMock(mockKey, 'hyperbolic');
  }),
];
