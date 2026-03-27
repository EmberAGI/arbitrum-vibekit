export interface PiRuntimeAgentConfig {
  agentId: string;
  runtimeUrlEnvVar: string;
  defaultRuntimeUrl: string;
}

export const PI_EXAMPLE_AGENT_ID = 'agent-pi-example';
export const EMBER_LENDING_AGENT_ID = 'agent-ember-lending';

export const PI_RUNTIME_AGENT_CONFIGS = [
  {
    agentId: PI_EXAMPLE_AGENT_ID,
    runtimeUrlEnvVar: 'PI_AGENT_DEPLOYMENT_URL',
    defaultRuntimeUrl: 'http://127.0.0.1:3410/ag-ui',
  },
  {
    agentId: EMBER_LENDING_AGENT_ID,
    runtimeUrlEnvVar: 'EMBER_LENDING_PI_AGENT_DEPLOYMENT_URL',
    defaultRuntimeUrl: 'http://127.0.0.1:3411/ag-ui',
  },
] as const satisfies readonly PiRuntimeAgentConfig[];

const PI_RUNTIME_AGENT_IDS = new Set(PI_RUNTIME_AGENT_CONFIGS.map((config) => config.agentId));

export function isPiRuntimeAgentId(agentId: string): boolean {
  return PI_RUNTIME_AGENT_IDS.has(agentId);
}
