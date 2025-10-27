import { http } from 'msw';

import { createResponseFromMock } from '../utils/error-simulation.js';

const OPENAI_API_URL = 'https://api.openai.com';

function extractLastUserPrompt(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const requestBody = body as Record<string, unknown>;

  // Try input first (Responses API format)
  const fromInput = extractFromInput(requestBody['input']);
  if (fromInput) {
    return fromInput;
  }

  // Fall back to messages (Chat Completions API format)
  const fromMessages = extractFromMessages(requestBody['messages']);
  if (fromMessages) {
    return fromMessages;
  }

  // Fall back to prompt (Completions API format)
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

function extractFromInput(input: unknown): string | null {
  if (!Array.isArray(input)) {
    return null;
  }

  for (let index = input.length - 1; index >= 0; index -= 1) {
    const item = input[index];
    if (!item || typeof item !== 'object') {
      continue;
    }

    if ((item as { role?: unknown }).role !== 'user') {
      continue;
    }

    const content = (item as { content?: unknown }).content;
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

  if (prompt.includes('hello world')) {
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

export const openaiHandlers = [
  // @ai-sdk/openai v2.x uses /v1/responses endpoint (Responses API)
  // MSW handler rule: Pure tape recorder - no synthetic errors, just replay recorded mocks
  http.post(`${OPENAI_API_URL}/v1/responses`, async ({ request }) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const mockKey = computeMockKey(body);
    return await createResponseFromMock(mockKey, 'openai');
  }),
];
