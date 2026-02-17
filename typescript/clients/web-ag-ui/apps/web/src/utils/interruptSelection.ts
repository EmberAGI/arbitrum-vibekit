import type { AgentInterrupt } from '../types/agent';

const AGENT_INTERRUPT_TYPES = new Set<AgentInterrupt['type']>([
  'operator-config-request',
  'pendle-setup-request',
  'pendle-fund-wallet-request',
  'gmx-fund-wallet-request',
  'gmx-setup-request',
  'clmm-funding-token-request',
  'pendle-funding-token-request',
  'gmx-funding-token-request',
  'clmm-delegation-signing-request',
  'pendle-delegation-signing-request',
  'gmx-delegation-signing-request',
]);

export const isAgentInterrupt = (value: unknown): value is AgentInterrupt => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && AGENT_INTERRUPT_TYPES.has(type as AgentInterrupt['type']);
};

export const normalizeAgentInterrupt = (value: unknown): AgentInterrupt | null => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isAgentInterrupt(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isAgentInterrupt(value) ? value : null;
};

export const selectActiveInterrupt = (params: {
  streamInterrupt: AgentInterrupt | null;
  syncPendingInterrupt: AgentInterrupt | null;
}): AgentInterrupt | null => params.streamInterrupt ?? params.syncPendingInterrupt;
