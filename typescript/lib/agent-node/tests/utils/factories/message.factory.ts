import type { Message, TextPart } from '@a2a-js/sdk';

/**
 * Factory for creating test Message objects
 */
export function createUserMessage(
  contextId: string,
  text: string,
  overrides: Partial<Message> = {},
): Message {
  const textPart: TextPart = { kind: 'text', text };
  const baseMessage: Message = {
    kind: 'message',
    messageId: overrides.messageId ?? 'msg-id',
    contextId,
    role: overrides.role ?? 'user',
    parts: overrides.parts ?? [textPart],
  };

  return { ...baseMessage, ...overrides };
}

/**
 * Create an agent message
 */
export function createAgentMessage(
  contextId: string,
  text: string,
  overrides: Partial<Message> = {},
): Message {
  return createUserMessage(contextId, text, { ...overrides, role: 'agent' });
}

/**
 * Create a message with multiple text parts
 */
export function createMultipartMessage(
  contextId: string,
  texts: string[],
  overrides: Partial<Message> = {},
): Message {
  const parts: TextPart[] = texts.map((text) => ({ kind: 'text', text }));
  return createUserMessage(contextId, '', { ...overrides, parts });
}

/**
 * Create a message with a specific task ID
 */
export function createTaskMessage(
  contextId: string,
  taskId: string,
  text: string,
  overrides: Partial<Message> = {},
): Message {
  return createUserMessage(contextId, text, { ...overrides, taskId });
}
