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

  it('registers production AG-UI agents through the runtime adapter', async () => {
    const { buildCopilotRuntimeAgents } = await import('./copilotRuntimeRegistry');

    const agents = buildCopilotRuntimeAgents({
      LANGGRAPH_DEPLOYMENT_URL: 'http://langgraph-clmm:8124',
      LANGGRAPH_PENDLE_DEPLOYMENT_URL: 'http://langgraph-pendle:8125',
      LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL: 'http://langgraph-gmx:8126',
      LANGSMITH_API_KEY: 'test-langsmith-key',
      PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: 'http://portfolio-manager:3420/ag-ui',
      EMBER_LENDING_AGENT_DEPLOYMENT_URL: 'http://ember-lending:3430/ag-ui',
    });

    expect(Object.keys(agents)).toEqual([
      'agent-clmm',
      'agent-pendle',
      'agent-gmx-allora',
      'agent-portfolio-manager',
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
    ]);

    expect(agentRuntimeHttpAgentConfigs).toEqual([
      {
        agentId: 'agent-portfolio-manager',
        runtimeUrl: 'http://portfolio-manager:3420/ag-ui',
      },
      {
        agentId: 'agent-ember-lending',
        runtimeUrl: 'http://ember-lending:3430/ag-ui',
      },
    ]);
    expect(agents['agent-portfolio-manager']).toMatchObject({
      config: {
        agentId: 'agent-portfolio-manager',
        runtimeUrl: 'http://portfolio-manager:3420/ag-ui',
      },
    });
    expect(agents['agent-ember-lending']).toMatchObject({
      config: {
        agentId: 'agent-ember-lending',
        runtimeUrl: 'http://ember-lending:3430/ag-ui',
      },
    });
  });

  it('fails closed when an AG-UI runtime URL is missing', async () => {
    const { resolveAgentRuntimeUrl } = await import('./copilotRuntimeRegistry');

    expect(() =>
      resolveAgentRuntimeUrl(
        {
          LANGSMITH_API_KEY: 'test-langsmith-key',
        },
        'agent-portfolio-manager',
      ),
    ).toThrow(
      'Missing required runtime URL env var PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL for agent-portfolio-manager.',
    );
  });

  it('registers only configured LangGraph runtimes while keeping AG-UI runtimes required', async () => {
    const { buildCopilotRuntimeAgents } = await import('./copilotRuntimeRegistry');

    const agents = buildCopilotRuntimeAgents({
      LANGSMITH_API_KEY: 'test-langsmith-key',
      PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: 'http://portfolio-manager:3420/ag-ui',
      EMBER_LENDING_AGENT_DEPLOYMENT_URL: 'http://ember-lending:3430/ag-ui',
    });

    expect(Object.keys(agents)).toEqual(['agent-portfolio-manager', 'agent-ember-lending']);
    expect(Object.keys(agents)).not.toContain('agent-oca-executor');
    expect(langGraphInterruptSnapshotAgentConfigs).toEqual([]);
    expect(agentRuntimeHttpAgentConfigs).toEqual([
      {
        agentId: 'agent-portfolio-manager',
        runtimeUrl: 'http://portfolio-manager:3420/ag-ui',
      },
      {
        agentId: 'agent-ember-lending',
        runtimeUrl: 'http://ember-lending:3430/ag-ui',
      },
    ]);
  });

  it('rejects agent ids that are no longer part of the production runtime registry', async () => {
    const { resolveAgentRuntimeUrl } = await import('./copilotRuntimeRegistry');

    expect(() =>
      resolveAgentRuntimeUrl({ LANGSMITH_API_KEY: 'test-langsmith-key' }, 'agent-pi-example'),
    ).toThrow('Unsupported AG-UI runtime agent "agent-pi-example".');
    expect(() =>
      resolveAgentRuntimeUrl({ LANGSMITH_API_KEY: 'test-langsmith-key' }, 'agent-oca-executor'),
    ).toThrow('Unsupported AG-UI runtime agent "agent-oca-executor".');
  });
});
