import type { AgentInterrupt } from '../types/agent';

const AGENT_INTERRUPT_TYPES = new Set<AgentInterrupt['type']>([
  'operator-config-request',
  'pendle-setup-request',
  'pendle-fund-wallet-request',
  'gmx-fund-wallet-request',
  'gmx-setup-request',
  'portfolio-manager-setup-request',
  'clmm-funding-token-request',
  'pendle-funding-token-request',
  'gmx-funding-token-request',
  'clmm-delegation-signing-request',
  'pendle-delegation-signing-request',
  'gmx-delegation-signing-request',
  'portfolio-manager-delegation-signing-request',
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
  lifecyclePhase?: string | null;
  hasLoadedSnapshot?: boolean;
}): AgentInterrupt | null => {
  if (params.syncPendingInterrupt) {
    if (!params.streamInterrupt) {
      return params.syncPendingInterrupt;
    }

    return params.streamInterrupt.type === params.syncPendingInterrupt.type
      ? params.streamInterrupt
      : params.syncPendingInterrupt;
  }

  if (params.hasLoadedSnapshot && params.lifecyclePhase === 'prehire') {
    return null;
  }

  return params.streamInterrupt;
};
