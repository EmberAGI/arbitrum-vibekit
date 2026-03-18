type MessageRecord = {
  content?: unknown;
};

export type CommandEnvelope<TCommand extends string = string> = {
  command: TCommand;
  clientMutationId?: string;
};

function getLastMessageContent(messages: unknown): string | null {
  if (!messages) {
    return null;
  }

  const list = Array.isArray(messages) ? messages : [messages];
  if (list.length === 0) {
    return null;
  }

  const lastMessage = list[list.length - 1];
  if (typeof lastMessage === 'string') {
    return lastMessage;
  }
  if (Array.isArray(lastMessage)) {
    return null;
  }
  if (typeof lastMessage === 'object' && lastMessage !== null && 'content' in lastMessage) {
    const value = (lastMessage as MessageRecord).content;
    return typeof value === 'string' ? value : null;
  }

  return null;
}

export function extractCommandEnvelopeFromMessages<TCommand extends string>(params: {
  messages: unknown;
  isCommand: (value: string) => value is TCommand;
}): CommandEnvelope<TCommand> | null {
  const content = getLastMessageContent(params.messages);
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null || !('command' in parsed)) {
      return null;
    }
    const command = (parsed as { command?: unknown }).command;
    if (typeof command !== 'string' || !params.isCommand(command)) {
      return null;
    }

    const clientMutationId = (parsed as { clientMutationId?: unknown }).clientMutationId;
    return {
      command,
      ...(typeof clientMutationId === 'string' && clientMutationId.length > 0
        ? { clientMutationId }
        : {}),
    };
  } catch {
    return null;
  }
}

export function extractCommandFromMessages<TCommand extends string>(params: {
  messages: unknown;
  isCommand: (value: string) => value is TCommand;
}): TCommand | null {
  return extractCommandEnvelopeFromMessages(params)?.command ?? null;
}
