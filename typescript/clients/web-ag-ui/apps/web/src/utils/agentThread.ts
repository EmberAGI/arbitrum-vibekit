import { v5 as uuidv5 } from 'uuid';

export function getAgentThreadId(agentId: string): string {
  return uuidv5(`copilotkit:${agentId}`, uuidv5.URL);
}
