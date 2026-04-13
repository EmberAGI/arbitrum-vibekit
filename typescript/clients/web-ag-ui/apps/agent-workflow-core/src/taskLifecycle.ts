import {
  extractCommandEnvelope as extractRuntimeCommandEnvelope,
  extractCommand as extractRuntimeCommand,
} from './commandEnvelope.js';
import type { CommandEnvelope } from './commandEnvelope.js';

export type { CommandEnvelope } from './commandEnvelope.js';

export const AGENT_COMMANDS = ['hire', 'fire', 'cycle', 'sync'] as const;
export type AgentCommand = (typeof AGENT_COMMANDS)[number];

const AGENT_COMMAND_SET = new Set<string>(AGENT_COMMANDS);

function isAgentCommand(value: string): value is AgentCommand {
  return AGENT_COMMAND_SET.has(value);
}

export function extractCommandEnvelope(value: unknown): CommandEnvelope<AgentCommand> | null {
  return extractRuntimeCommandEnvelope({
    value,
    isCommand: isAgentCommand,
  });
}

export function extractCommand(value: unknown): AgentCommand | null {
  return extractRuntimeCommand({
    value,
    isCommand: isAgentCommand,
  });
}

type PendingCommandStateValues<TCommand extends string> = {
  private: {
    pendingCommand: CommandEnvelope<TCommand>;
  };
  thread?: Record<string, unknown>;
};

export function buildPendingCommandStateValues<TCommand extends AgentCommand>(params: {
  command: TCommand;
  clientMutationId?: string;
  thread?: Record<string, unknown>;
}): PendingCommandStateValues<TCommand> {
  const pendingCommand: CommandEnvelope<TCommand> = {
    command: params.command,
    ...(params.clientMutationId ? { clientMutationId: params.clientMutationId } : {}),
  };

  return {
    private: {
      pendingCommand,
    },
    ...(params.thread ? { thread: params.thread } : {}),
  };
}

export function buildRunCommandStateUpdate<TCommand extends AgentCommand>(params: {
  command: TCommand;
  clientMutationId?: string;
  thread?: Record<string, unknown>;
}): {
  as_node: 'runCommand';
  values: PendingCommandStateValues<TCommand>;
} {
  return {
    as_node: 'runCommand',
    values: buildPendingCommandStateValues(params),
  };
}
