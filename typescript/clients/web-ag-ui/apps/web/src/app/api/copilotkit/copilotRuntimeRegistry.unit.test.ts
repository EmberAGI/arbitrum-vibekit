import { beforeEach, describe, expect, it, vi } from 'vitest';

const langGraphInterruptSnapshotAgentConfigs: Array<Record<string, unknown>> = [];
const agentRuntimeHttpAgentConfigs: Array<Record<string, unknown>> = [];

class MockLangGraphInterruptSnapshotAgent {
  constructor(config: Record<string, unknown>) {
    langGraphInterruptSnapshotAgentConfigs.push(config);
  }
}

const mockAgentRuntimeHttpAgent = (config: Record<string, unknown>) => {
  agentRuntimeHttpAgentConfigs.push(config);
  return {
    config,
  };
};

vi.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: class MockCopilotRuntime {},
}));

vi.mock('./piRuntimeHttpAgent', () => ({
  createAgentRuntimeHttpAgent: mockAgentRuntimeHttpAgent,
}));

vi.mock('./langGraphInterruptSnapshotAgent', () => ({
  LangGraphInterruptSnapshotAgent: MockLangGraphInterruptSnapshotAgent,
}));

describe('buildCopilotRuntimeAgents', () => {
  beforeEach(() => {
    vi.resetModules();
    langGraphInterruptSnapshotAgentConfigs.length = 0;
    agentRuntimeHttpAgentConfigs.length = 0;
  });

  it('registers LangGraph agents through the interrupt-preserving adapter and keeps Pi on the AG-UI HTTP runtime', async () => {
    const { buildCopilotRuntimeAgents } = await import('./copilotRuntimeRegistry');

    const agents = buildCopilotRuntimeAgents({
      LANGGRAPH_DEPLOYMENT_URL: 'http://langgraph-clmm:8124',
      LANGGRAPH_PENDLE_DEPLOYMENT_URL: 'http://langgraph-pendle:8125',
      LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL: 'http://langgraph-gmx:8126',
      LANGSMITH_API_KEY: 'test-langsmith-key',
      PI_AGENT_DEPLOYMENT_URL: 'http://pi-agent-example:3410/ag-ui',
      PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: 'http://portfolio-manager:3420/ag-ui',
      EMBER_LENDING_AGENT_DEPLOYMENT_URL: 'http://ember-lending:3430/ag-ui',
    });

    expect(Object.keys(agents)).toEqual([
      'agent-clmm',
      'agent-pendle',
      'agent-gmx-allora',
      'starterAgent',
      'agent-pi-example',
      'agent-portfolio-manager',
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

    expect(agentRuntimeHttpAgentConfigs).toEqual([
      {
        agentId: 'agent-pi-example',
        runtimeUrl: 'http://pi-agent-example:3410/ag-ui',
      },
      {
        agentId: 'agent-portfolio-manager',
        runtimeUrl: 'http://portfolio-manager:3420/ag-ui',
      },
    ]);
    expect(agents['agent-pi-example']).toMatchObject({
      config: {
        agentId: 'agent-pi-example',
        runtimeUrl: 'http://pi-agent-example:3410/ag-ui',
      },
    });
    expect(agents['agent-portfolio-manager']).toMatchObject({
      config: {
        agentId: 'agent-portfolio-manager',
        runtimeUrl: 'http://portfolio-manager:3420/ag-ui',
      },
    });
    expect(agents['agent-ember-lending']).toBeUndefined();
  });

  it('defaults the Pi example runtime URL for local development', async () => {
    const { buildCopilotRuntimeAgents } = await import('./copilotRuntimeRegistry');

    const agents = buildCopilotRuntimeAgents({
      LANGSMITH_API_KEY: 'test-langsmith-key',
    });

    expect(agents['agent-pi-example']).toMatchObject({
      config: {
        agentId: 'agent-pi-example',
        runtimeUrl: 'http://127.0.0.1:3410/ag-ui',
      },
    });
    expect(agents['agent-portfolio-manager']).toMatchObject({
      config: {
        agentId: 'agent-portfolio-manager',
        runtimeUrl: 'http://127.0.0.1:3420/ag-ui',
      },
    });
    expect(agentRuntimeHttpAgentConfigs).toContainEqual({
      agentId: 'agent-pi-example',
      runtimeUrl: 'http://127.0.0.1:3410/ag-ui',
    });
    expect(agentRuntimeHttpAgentConfigs).toContainEqual({
      agentId: 'agent-portfolio-manager',
      runtimeUrl: 'http://127.0.0.1:3420/ag-ui',
    });
    expect(agentRuntimeHttpAgentConfigs).not.toContainEqual({
      agentId: 'agent-ember-lending',
      runtimeUrl: 'http://127.0.0.1:3430/ag-ui',
    });
  });

  it('does not expose the hidden ember-lending execution worker through CopilotKit runtime registration', async () => {
    const { buildCopilotRuntimeAgents } = await import('./copilotRuntimeRegistry');

    const agents = buildCopilotRuntimeAgents({
      LANGSMITH_API_KEY: 'test-langsmith-key',
      EMBER_LENDING_AGENT_DEPLOYMENT_URL: 'http://ember-lending:3430/ag-ui',
    });

    expect(Object.keys(agents)).not.toContain('agent-ember-lending');
    expect(agentRuntimeHttpAgentConfigs).not.toContainEqual({
      agentId: 'agent-ember-lending',
      runtimeUrl: 'http://ember-lending:3430/ag-ui',
    });
  });
});
