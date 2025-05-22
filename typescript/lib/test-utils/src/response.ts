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
export function extractMessageText(response: any): string {
  if (response?.status?.message?.parts) {
    for (const part of response.status.message.parts) {
      if (part.type === 'text') {
        return part.text;
      }
    }
  }
  return '';
} 