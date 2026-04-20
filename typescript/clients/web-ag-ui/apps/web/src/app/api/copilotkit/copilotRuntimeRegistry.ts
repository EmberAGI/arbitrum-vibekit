import { CopilotRuntime } from '@copilotkit/runtime';
import { LangGraphInterruptSnapshotAgent } from './langGraphInterruptSnapshotAgent';
import { createAgentRuntimeHttpAgent } from './piRuntimeHttpAgent';

export const CLMM_AGENT_NAME = 'agent-clmm';
export const PENDLE_AGENT_NAME = 'agent-pendle';
export const GMX_ALLORA_AGENT_NAME = 'agent-gmx-allora';
export const PORTFOLIO_MANAGER_AGENT_NAME = 'agent-portfolio-manager';
export const EMBER_LENDING_AGENT_NAME = 'agent-ember-lending';

type RuntimeEnv = Record<string, string | undefined>;

function requireRuntimeUrl(env: RuntimeEnv, envVarName: string, agentId: string): string {
  const runtimeUrl = env[envVarName]?.trim();
  if (runtimeUrl) {
    return runtimeUrl;
  }

  throw new Error(`Missing required runtime URL env var ${envVarName} for ${agentId}.`);
}

export function resolveAgentRuntimeUrl(env: RuntimeEnv, agentId: string): string {
  switch (agentId) {
    case PORTFOLIO_MANAGER_AGENT_NAME:
      return requireRuntimeUrl(
        env,
        'PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL',
        PORTFOLIO_MANAGER_AGENT_NAME,
      );
    case EMBER_LENDING_AGENT_NAME:
      return requireRuntimeUrl(
        env,
        'EMBER_LENDING_AGENT_DEPLOYMENT_URL',
        EMBER_LENDING_AGENT_NAME,
      );
    default:
      throw new Error(`Unsupported AG-UI runtime agent "${agentId}".`);
  }
}

export function buildCopilotRuntimeAgents(env: RuntimeEnv) {
  const portfolioManagerRuntimeUrl = resolveAgentRuntimeUrl(env, PORTFOLIO_MANAGER_AGENT_NAME);
  const emberLendingRuntimeUrl = resolveAgentRuntimeUrl(env, EMBER_LENDING_AGENT_NAME);
  const agents = {
    [CLMM_AGENT_NAME]: new LangGraphInterruptSnapshotAgent({
      deploymentUrl: requireRuntimeUrl(env, 'LANGGRAPH_DEPLOYMENT_URL', CLMM_AGENT_NAME),
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [PENDLE_AGENT_NAME]: new LangGraphInterruptSnapshotAgent({
      deploymentUrl: requireRuntimeUrl(
        env,
        'LANGGRAPH_PENDLE_DEPLOYMENT_URL',
        PENDLE_AGENT_NAME,
      ),
      graphId: PENDLE_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [GMX_ALLORA_AGENT_NAME]: new LangGraphInterruptSnapshotAgent({
      deploymentUrl: requireRuntimeUrl(
        env,
        'LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL',
        GMX_ALLORA_AGENT_NAME,
      ),
      graphId: GMX_ALLORA_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
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
