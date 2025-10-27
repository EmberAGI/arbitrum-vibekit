import { http } from 'msw';

import { checkErrorTriggers, createResponseFromMock } from '../utils/error-simulation.js';

const XAI_API_URL = 'https://api.x.ai';

function extractLastUserPrompt(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const requestBody = body as Record<string, unknown>;

  const fromMessages = extractFromMessages(requestBody['messages']);
  if (fromMessages) {
    return fromMessages;
  }

  if (typeof requestBody['prompt'] === 'string') {
    return requestBody['prompt'];
  }

  return null;
}

function extractFromMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object') {
      continue;
    }

    if ((message as { role?: unknown }).role !== 'user') {
      continue;
    }

    const content = (message as { content?: unknown }).content;
    const text = normalizeContentToText(content);
    if (text) {
      return text;
    }
  }

  return null;
}

function normalizeContentToText(content: unknown): string | null {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const parts: Array<string> = [];
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part);
      continue;
    }

    if (!part || typeof part !== 'object') {
      continue;
    }

    const maybeText = (part as { text?: unknown }).text;
    if (typeof maybeText === 'string') {
      parts.push(maybeText);
      continue;
    }

    const maybeValue = (part as { value?: unknown }).value;
    if (typeof maybeValue === 'string') {
      parts.push(maybeValue);
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' ').trim();
}

/**
 * Compute deterministic mockKey from request body
 * Maps request messages to the mock file key
 */
function computeMockKey(body: unknown): string {
  const prompt = extractLastUserPrompt(body)?.toLowerCase();
  if (!prompt) {
    return 'simple-inference';
  }

  // Map message content to mock keys
  if (prompt.includes('hello')) {
    return 'simple-inference';
  }

  if (prompt.includes('custom model')) {
    return 'custom-model';
  }

  if (prompt.includes('default model')) {
    return 'default-model';
  }

  return 'simple-inference';
}

export const xaiHandlers = [
  // Chat completions
  http.post(`${XAI_API_URL}/:version/:path*`, async ({ request }) => {
    const errorResponse = await checkErrorTriggers('xai');
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
    return await createResponseFromMock(mockKey, 'xai');
  }),
];
