import { beforeEach, describe, expect, it, vi } from 'vitest';

const langGraphInterruptSnapshotAgentConfigs: Array<Record<string, unknown>> = [];
const piRuntimeHttpAgentConfigs: Array<Record<string, unknown>> = [];

class MockLangGraphInterruptSnapshotAgent {
  constructor(config: Record<string, unknown>) {
    langGraphInterruptSnapshotAgentConfigs.push(config);
  }
}

class MockPiRuntimeHttpAgent {
  constructor(config: Record<string, unknown>) {
    piRuntimeHttpAgentConfigs.push(config);
  }
}

vi.mock('./langGraphInterruptSnapshotAgent', () => ({
  LangGraphInterruptSnapshotAgent: MockLangGraphInterruptSnapshotAgent,
}));

vi.mock('agent-runtime/pi-transport', () => {
  return {
    PiRuntimeGatewayHttpAgent: MockPiRuntimeHttpAgent,
  };
});

const copilotRuntimeRegistryModulePromise = import('./copilotRuntimeRegistry');

describe('buildCopilotRuntimeAgents', () => {
  beforeEach(() => {
    langGraphInterruptSnapshotAgentConfigs.length = 0;
    piRuntimeHttpAgentConfigs.length = 0;
  });

  it(
    'registers LangGraph agents through the interrupt-preserving adapter and keeps Pi on the AG-UI HTTP runtime',
    {
      timeout: 10_000,
    },
    async () => {
    const { buildCopilotRuntimeAgents } = await copilotRuntimeRegistryModulePromise;

    const agents = buildCopilotRuntimeAgents({
      LANGGRAPH_DEPLOYMENT_URL: 'http://langgraph-clmm:8124',
      LANGGRAPH_PENDLE_DEPLOYMENT_URL: 'http://langgraph-pendle:8125',
      LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL: 'http://langgraph-gmx:8126',
      LANGSMITH_API_KEY: 'test-langsmith-key',
      PI_AGENT_DEPLOYMENT_URL: 'http://pi-agent-example:3410/ag-ui',
      EMBER_LENDING_PI_AGENT_DEPLOYMENT_URL: 'http://pi-agent-ember-lending:3411/ag-ui',
    });

    expect(Object.keys(agents)).toEqual([
      'agent-clmm',
      'agent-pendle',
      'agent-gmx-allora',
      'starterAgent',
      'agent-pi-example',
      'agent-ember-lending',
    ]);

    expect(langGraphInterruptSnapshotAgentConfigs).toEqual([
      {
        deploymentUrl: 'http://langgraph-clmm:8124',
        graphId: 'agent-clmm',
        langsmithApiKey: 'test-langsmith-key',
      },
      {
        deploymentUrl: 'http://langgraph-pendle:8125',
        graphId: 'agent-pendle',
        langsmithApiKey: 'test-langsmith-key',
      },
      {
        deploymentUrl: 'http://langgraph-gmx:8126',
        graphId: 'agent-gmx-allora',
        langsmithApiKey: 'test-langsmith-key',
      },
      {
        deploymentUrl: 'http://localhost:8123',
        graphId: 'starterAgent',
        langsmithApiKey: 'test-langsmith-key',
      },
    ]);

    expect(piRuntimeHttpAgentConfigs).toEqual([
      {
        agentId: 'agent-pi-example',
        runtimeUrl: 'http://pi-agent-example:3410/ag-ui',
      },
      {
        agentId: 'agent-ember-lending',
        runtimeUrl: 'http://pi-agent-ember-lending:3411/ag-ui',
      },
    ]);
    expect(agents['agent-pi-example']).toBeInstanceOf(MockPiRuntimeHttpAgent);
    expect(agents['agent-ember-lending']).toBeInstanceOf(MockPiRuntimeHttpAgent);
    },
  );

  it('defaults the Pi example runtime URL for local development', async () => {
    const { buildCopilotRuntimeAgents } = await copilotRuntimeRegistryModulePromise;

    const agents = buildCopilotRuntimeAgents({
      LANGSMITH_API_KEY: 'test-langsmith-key',
    });

    expect(agents['agent-pi-example']).toBeInstanceOf(MockPiRuntimeHttpAgent);
    expect(piRuntimeHttpAgentConfigs).toContainEqual({
      agentId: 'agent-pi-example',
      runtimeUrl: 'http://127.0.0.1:3410/ag-ui',
    });
    expect(agents['agent-ember-lending']).toBeInstanceOf(MockPiRuntimeHttpAgent);
    expect(piRuntimeHttpAgentConfigs).toContainEqual({
      agentId: 'agent-ember-lending',
      runtimeUrl: 'http://127.0.0.1:3411/ag-ui',
    });
  });
});
