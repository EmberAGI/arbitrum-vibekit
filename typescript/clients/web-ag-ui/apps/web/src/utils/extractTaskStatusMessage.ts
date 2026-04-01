export function extractTaskStatusMessage(message: unknown): string | undefined {
  if (typeof message === 'string') {
    return message;
  }

  if (typeof message !== 'object' || message === null) {
    return undefined;
  }

  if (!('content' in message)) {
    return undefined;
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : undefined;
}
