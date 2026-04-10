import { CopilotRuntime } from '@copilotkit/runtime';
import { LangGraphInterruptSnapshotAgent } from './langGraphInterruptSnapshotAgent';
import { createAgentRuntimeHttpAgent } from './piRuntimeHttpAgent';

export const CLMM_AGENT_NAME = 'agent-clmm';
export const PENDLE_AGENT_NAME = 'agent-pendle';
export const GMX_ALLORA_AGENT_NAME = 'agent-gmx-allora';
export const STARTER_AGENT_NAME = 'starterAgent';
export const PI_EXAMPLE_AGENT_NAME = 'agent-pi-example';
export const PORTFOLIO_MANAGER_AGENT_NAME = 'agent-portfolio-manager';
export const EMBER_LENDING_AGENT_NAME = 'agent-ember-lending';
const DEFAULT_PI_AGENT_DEPLOYMENT_URL = 'http://127.0.0.1:3410/ag-ui';
const DEFAULT_PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL = 'http://127.0.0.1:3420/ag-ui';
const DEFAULT_EMBER_LENDING_AGENT_DEPLOYMENT_URL = 'http://127.0.0.1:3430/ag-ui';

type RuntimeEnv = Record<string, string | undefined>;

export function resolveAgentRuntimeUrl(env: RuntimeEnv, agentId: string): string {
  switch (agentId) {
    case PI_EXAMPLE_AGENT_NAME:
      return env.PI_AGENT_DEPLOYMENT_URL || DEFAULT_PI_AGENT_DEPLOYMENT_URL;
    case PORTFOLIO_MANAGER_AGENT_NAME:
      return (
        env.PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL ||
        DEFAULT_PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL
      );
    case EMBER_LENDING_AGENT_NAME:
      return env.EMBER_LENDING_AGENT_DEPLOYMENT_URL || DEFAULT_EMBER_LENDING_AGENT_DEPLOYMENT_URL;
    default:
      throw new Error(`Unsupported AG-UI runtime agent "${agentId}".`);
  }
}

export function buildCopilotRuntimeAgents(env: RuntimeEnv) {
  const piAgentRuntimeUrl = resolveAgentRuntimeUrl(env, PI_EXAMPLE_AGENT_NAME);
  const portfolioManagerRuntimeUrl = resolveAgentRuntimeUrl(env, PORTFOLIO_MANAGER_AGENT_NAME);
  const emberLendingRuntimeUrl = resolveAgentRuntimeUrl(env, EMBER_LENDING_AGENT_NAME);
  const agents = {
    [CLMM_AGENT_NAME]: new LangGraphInterruptSnapshotAgent({
      deploymentUrl: env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [PENDLE_AGENT_NAME]: new LangGraphInterruptSnapshotAgent({
      deploymentUrl: env.LANGGRAPH_PENDLE_DEPLOYMENT_URL || 'http://localhost:8125',
      graphId: PENDLE_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [GMX_ALLORA_AGENT_NAME]: new LangGraphInterruptSnapshotAgent({
      deploymentUrl: env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL || 'http://localhost:8126',
      graphId: GMX_ALLORA_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [STARTER_AGENT_NAME]: new LangGraphInterruptSnapshotAgent({
      deploymentUrl: 'http://localhost:8123',
      graphId: STARTER_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [PI_EXAMPLE_AGENT_NAME]: createAgentRuntimeHttpAgent({
      agentId: PI_EXAMPLE_AGENT_NAME,
      runtimeUrl: piAgentRuntimeUrl,
    }),
    [PORTFOLIO_MANAGER_AGENT_NAME]: createAgentRuntimeHttpAgent({
      agentId: PORTFOLIO_MANAGER_AGENT_NAME,
      runtimeUrl: portfolioManagerRuntimeUrl,
    }),
    [EMBER_LENDING_AGENT_NAME]: createAgentRuntimeHttpAgent({
      agentId: EMBER_LENDING_AGENT_NAME,
      runtimeUrl: emberLendingRuntimeUrl,
    }),
  };

  return agents;
}

export function buildCopilotRuntime(env: RuntimeEnv): CopilotRuntime {
  const agents =
    buildCopilotRuntimeAgents(env) as unknown as NonNullable<
      ConstructorParameters<typeof CopilotRuntime>[0]
    >['agents'];
  return new CopilotRuntime({
    agents,
  });
}
