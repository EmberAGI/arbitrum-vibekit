import {
  extractCommandEnvelopeFromMessages as extractRuntimeCommandEnvelopeFromMessages,
  extractCommandFromMessages as extractRuntimeCommandFromMessages,
} from './commandEnvelope.js';
import type { CommandEnvelope } from './commandEnvelope.js';

export type { CommandEnvelope } from './commandEnvelope.js';

export const AGENT_COMMANDS = ['hire', 'fire', 'cycle', 'sync'] as const;
export type AgentCommand = (typeof AGENT_COMMANDS)[number];

const AGENT_COMMAND_SET = new Set<string>(AGENT_COMMANDS);

function isAgentCommand(value: string): value is AgentCommand {
  return AGENT_COMMAND_SET.has(value);
}

export function extractCommandEnvelopeFromMessages(
  messages: unknown,
): CommandEnvelope<AgentCommand> | null {
  return extractRuntimeCommandEnvelopeFromMessages({
    messages,
    isCommand: isAgentCommand,
  });
}

export function extractCommandFromMessages(messages: unknown): AgentCommand | null {
  return extractRuntimeCommandFromMessages({
    messages,
    isCommand: isAgentCommand,
  });
}
