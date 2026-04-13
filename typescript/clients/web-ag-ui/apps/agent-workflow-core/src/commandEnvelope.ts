export type CommandEnvelope<TCommand extends string = string> = {
  command: TCommand;
  clientMutationId?: string;
};

function extractCommandEnvelopeFromValue<TCommand extends string>(params: {
  value: unknown;
  isCommand: (value: string) => value is TCommand;
}): CommandEnvelope<TCommand> | null {
  if (typeof params.value !== 'object' || params.value === null || Array.isArray(params.value)) {
    return null;
  }

  if (!('command' in params.value)) {
    return null;
  }

  const command = (params.value as { command?: unknown }).command;
  if (typeof command !== 'string' || !params.isCommand(command)) {
    return null;
  }

  const clientMutationId = (params.value as { clientMutationId?: unknown }).clientMutationId;
  return {
    command,
    ...(typeof clientMutationId === 'string' && clientMutationId.length > 0
      ? { clientMutationId }
      : {}),
  };
}

export function extractCommandEnvelope<TCommand extends string>(params: {
  value: unknown;
  isCommand: (value: string) => value is TCommand;
}): CommandEnvelope<TCommand> | null {
  return extractCommandEnvelopeFromValue(params);
}

export function extractCommand<TCommand extends string>(params: {
  value: unknown;
  isCommand: (value: string) => value is TCommand;
}): TCommand | null {
  return extractCommandEnvelopeFromValue(params)?.command ?? null;
}
