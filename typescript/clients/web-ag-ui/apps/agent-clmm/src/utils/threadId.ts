import { v5 as uuidv5, v7 as uuidv7 } from 'uuid';

import { normalizeHexAddress } from '../workflow/context.js';

const DEFAULT_AGENT_ID = 'agent-clmm';

export function buildStableThreadId(agentId: string, walletAddress: string): string {
  const normalized = normalizeHexAddress(walletAddress, 'wallet address').toLowerCase();
  return uuidv5(`${agentId}:${normalized}`, uuidv5.URL);
}

export function resolveThreadId(options: {
  agentId?: string;
  walletAddress?: string;
  sourceLabel: string;
}): string {
  const explicit = process.env['CLMM_THREAD_ID'];
  if (explicit) {
    return explicit;
  }

  if (options.walletAddress) {
    return buildStableThreadId(options.agentId ?? DEFAULT_AGENT_ID, options.walletAddress);
  }

  const generated = uuidv7();
  console.info(`[${options.sourceLabel}] CLMM_THREAD_ID not provided; generated thread id ${generated}`);
  return generated;
}
