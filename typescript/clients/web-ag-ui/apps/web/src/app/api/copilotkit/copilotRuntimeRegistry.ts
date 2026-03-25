import { CopilotRuntime } from '@copilotkit/runtime';
import { PiRuntimeGatewayHttpAgent } from 'agent-runtime/pi-transport';
import { LangGraphInterruptSnapshotAgent } from './langGraphInterruptSnapshotAgent';

export const CLMM_AGENT_NAME = 'agent-clmm';
export const PENDLE_AGENT_NAME = 'agent-pendle';
export const GMX_ALLORA_AGENT_NAME = 'agent-gmx-allora';
export const STARTER_AGENT_NAME = 'starterAgent';
export const PI_EXAMPLE_AGENT_NAME = 'agent-pi-example';
const DEFAULT_PI_AGENT_DEPLOYMENT_URL = 'http://127.0.0.1:3410/ag-ui';

type RuntimeEnv = Record<string, string | undefined>;

export function buildCopilotRuntimeAgents(env: RuntimeEnv) {
  const piAgentRuntimeUrl = env.PI_AGENT_DEPLOYMENT_URL || DEFAULT_PI_AGENT_DEPLOYMENT_URL;
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
    [PI_EXAMPLE_AGENT_NAME]: new PiRuntimeGatewayHttpAgent({
      agentId: PI_EXAMPLE_AGENT_NAME,
      runtimeUrl: piAgentRuntimeUrl,
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
