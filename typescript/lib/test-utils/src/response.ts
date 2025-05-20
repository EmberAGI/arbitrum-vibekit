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