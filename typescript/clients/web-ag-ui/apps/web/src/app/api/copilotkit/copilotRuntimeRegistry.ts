import { CopilotRuntime } from '@copilotkit/runtime';
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import { PiRuntimeHttpAgent } from './piRuntimeHttpAgent';

export const CLMM_AGENT_NAME = 'agent-clmm';
export const PENDLE_AGENT_NAME = 'agent-pendle';
export const GMX_ALLORA_AGENT_NAME = 'agent-gmx-allora';
export const STARTER_AGENT_NAME = 'starterAgent';
export const PI_EXAMPLE_AGENT_NAME = 'agent-pi-example';

type RuntimeEnv = Record<string, string | undefined>;

export function buildCopilotRuntimeAgents(env: RuntimeEnv) {
  const agents = {
    [CLMM_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [PENDLE_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: env.LANGGRAPH_PENDLE_DEPLOYMENT_URL || 'http://localhost:8125',
      graphId: PENDLE_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [GMX_ALLORA_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL || 'http://localhost:8126',
      graphId: GMX_ALLORA_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    [STARTER_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: 'http://localhost:8123',
      graphId: STARTER_AGENT_NAME,
      langsmithApiKey: env.LANGSMITH_API_KEY || '',
    }),
    ...(env.PI_AGENT_DEPLOYMENT_URL
      ? {
          [PI_EXAMPLE_AGENT_NAME]: new PiRuntimeHttpAgent({
            agentId: PI_EXAMPLE_AGENT_NAME,
            runtimeUrl: env.PI_AGENT_DEPLOYMENT_URL,
          }),
        }
      : {}),
  };

  return agents;
}

export function buildCopilotRuntime(env: RuntimeEnv): CopilotRuntime {
  return new CopilotRuntime({
    agents: buildCopilotRuntimeAgents(env),
  });
}
