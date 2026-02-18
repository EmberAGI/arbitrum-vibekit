export const AGENT_COMMANDS = ['hire', 'fire', 'cycle', 'sync'] as const;
export type AgentCommand = (typeof AGENT_COMMANDS)[number];

export const TASK_STATES = [
  'submitted',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
  'auth-required',
] as const;
export type TaskState = (typeof TASK_STATES)[number];

const AGENT_COMMAND_SET = new Set<string>(AGENT_COMMANDS);

const TERMINAL_TASK_STATES = new Set<TaskState>(['completed', 'failed', 'canceled']);

const ACTIVE_TASK_STATES = new Set<TaskState>(['submitted', 'working', 'input-required', 'auth-required']);

type MessageRecord = {
  content?: unknown;
};

export type CommandEnvelope = {
  command: AgentCommand;
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

export function extractCommandEnvelopeFromMessages(messages: unknown): CommandEnvelope | null {
  const content = getLastMessageContent(messages);
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null || !('command' in parsed)) {
      return null;
    }
    const command = (parsed as { command?: unknown }).command;
    if (typeof command !== 'string' || !AGENT_COMMAND_SET.has(command)) {
      return null;
    }

    const clientMutationId = (parsed as { clientMutationId?: unknown }).clientMutationId;
    return {
      command: command as AgentCommand,
      ...(typeof clientMutationId === 'string' && clientMutationId.length > 0
        ? { clientMutationId }
        : {}),
    };
  } catch {
    return null;
  }
}

export function extractCommandFromMessages(messages: unknown): AgentCommand | null {
  return extractCommandEnvelopeFromMessages(messages)?.command ?? null;
}

export function isTaskTerminalState(state: string | TaskState): boolean {
  return TERMINAL_TASK_STATES.has(state as TaskState);
}

export function isTaskActiveState(state: string | TaskState): boolean {
  return ACTIVE_TASK_STATES.has(state as TaskState);
}
