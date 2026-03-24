import { beforeEach, describe, expect, it, vi } from 'vitest';

const langGraphAgentConfigs: Array<Record<string, unknown>> = [];
const piRuntimeHttpAgentConfigs: Array<Record<string, unknown>> = [];

class MockLangGraphAgent {
  constructor(config: Record<string, unknown>) {
    langGraphAgentConfigs.push(config);
  }
}

class MockPiRuntimeHttpAgent {
  constructor(config: Record<string, unknown>) {
    piRuntimeHttpAgentConfigs.push(config);
  }
}

vi.mock('@copilotkit/runtime/langgraph', () => ({
  LangGraphAgent: MockLangGraphAgent,
}));

vi.mock('agent-runtime/pi-transport', () => {
  return {
    PiRuntimeGatewayHttpAgent: MockPiRuntimeHttpAgent,
  };
});

describe('buildCopilotRuntimeAgents', () => {
  beforeEach(() => {
    langGraphAgentConfigs.length = 0;
    piRuntimeHttpAgentConfigs.length = 0;
  });

  it('registers a Pi-backed AG-UI HTTP agent alongside the existing LangGraph agents', async () => {
    const { buildCopilotRuntimeAgents } = await import('./copilotRuntimeRegistry');

    const agents = buildCopilotRuntimeAgents({
      LANGGRAPH_DEPLOYMENT_URL: 'http://langgraph-clmm:8124',
      LANGGRAPH_PENDLE_DEPLOYMENT_URL: 'http://langgraph-pendle:8125',
      LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL: 'http://langgraph-gmx:8126',
      LANGSMITH_API_KEY: 'test-langsmith-key',
      PI_AGENT_DEPLOYMENT_URL: 'http://pi-agent-example:3410/ag-ui',
    });

    expect(Object.keys(agents)).toEqual([
      'agent-clmm',
      'agent-pendle',
      'agent-gmx-allora',
      'starterAgent',
      'agent-pi-example',
    ]);

    expect(langGraphAgentConfigs).toEqual([
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
    ]);
    expect(agents['agent-pi-example']).toBeInstanceOf(MockPiRuntimeHttpAgent);
  });

  it('defaults the Pi example runtime URL for local development', async () => {
    const { buildCopilotRuntimeAgents } = await import('./copilotRuntimeRegistry');

    const agents = buildCopilotRuntimeAgents({
      LANGSMITH_API_KEY: 'test-langsmith-key',
    });

    expect(agents['agent-pi-example']).toBeInstanceOf(MockPiRuntimeHttpAgent);
    expect(piRuntimeHttpAgentConfigs).toContainEqual({
      agentId: 'agent-pi-example',
      runtimeUrl: 'http://127.0.0.1:3410/ag-ui',
    });
  });
});
