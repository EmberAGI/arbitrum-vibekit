import type { Task } from 'a2a-samples-js';

/**
 * Parse data from an agent's function call response
 * @param functionCall The function call from the agent's response
 * @returns Parsed arguments object
 */
export function parseFunctionCallArgs(functionCall: {
  name: string;
  arguments: string;
}): Record<string, unknown> {
  try {
    return JSON.parse(functionCall.arguments || '{}');
  } catch (error) {
    console.error('Error parsing function arguments:', error);
    return {};
  }
}

/**
 * Extract text message from agent response
 * @param response The agent response object
 * @returns The text message from the response
 */
export function extractMessageText(response: Task): string {
  if (response?.status?.message?.parts) {
    for (const part of response.status.message.parts) {
      if (part.type === 'text') {
        return part.text || '';
      }
    }
  }
  return '';
}

export function isNotFailed(response: Task): boolean {
  return response.status?.state !== 'failed';
}

export function getFailureDetails(response: Task): string | null {
  if (response.status?.state === 'failed') {
    return `Response failed. Status: ${JSON.stringify(response.status, null, 2)}`;
  }
  return null;
}