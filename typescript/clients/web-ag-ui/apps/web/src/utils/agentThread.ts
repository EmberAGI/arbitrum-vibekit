import { v5 as uuidv5 } from 'uuid';

export function getAgentThreadId(agentId: string, privyAddress?: string | null): string | null {
  if (!privyAddress) {
    return null;
  }
  const normalized = privyAddress.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return uuidv5(`copilotkit:${agentId}:${normalized}`, uuidv5.URL);
}
