import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HireAgentsRoute from './page';

type HireAgentsRoutePropsCapture = {
  agents: Array<{
    id: string;
    chains: string[];
    protocols: string[];
    tokens: string[];
    pointsTrend?: 'up';
    trendMultiplier?: string;
  }>;
  featuredAgents: Array<{
    id: string;
    description?: string;
    chains: string[];
    protocols: string[];
    tokens: string[];
    pointsTrend?: 'up';
    trendMultiplier?: string;
  }>;
  onHireAgent: (agentId: string) => void;
  onViewAgent: (agentId: string) => void;
};

const pushMock = vi.fn();
const useAgentListMock = vi.fn();
let capturedProps: HireAgentsRoutePropsCapture | null = null;

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({
      push: pushMock,
    }),
  };
});

vi.mock('@/contexts/AgentListContext', () => {
  return {
    useAgentList: () => useAgentListMock(),
  };
});

vi.mock('@/components/HireAgentsPage', () => {
  return {
    HireAgentsPage: (props: HireAgentsRoutePropsCapture) => {
      capturedProps = props;
      return React.createElement('div', { 'data-testid': 'hire-agents-page' });
    },
  };
});

describe('HireAgentsRoute integration', () => {
  beforeEach(() => {
    pushMock.mockReset();
    capturedProps = null;

    useAgentListMock.mockReturnValue({
      agents: {
        'agent-clmm': {
          synced: true,
          profile: {
            chains: ['Arbitrum One', 'Arbitrum'],
            protocols: ['Camelot'],
            tokens: ['USDC'],
            agentIncome: 754,
            aum: 742510,
            totalUsers: 5321,
            apy: 22,
          },
          metrics: {
            iteration: 3,
          },
        },
        'agent-pendle': {
          synced: false,
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Pendle'],
            tokens: ['sUSDai'],
          },
          metrics: {
            iteration: 0,
          },
        },
        'agent-gmx-allora': {
          synced: true,
          profile: {
            chains: ['Arbitrum'],
            protocols: ['GMX', 'Allora'],
            tokens: ['USDC'],
          },
          metrics: {
            iteration: 2,
          },
        },
      },
    });
  });

  it('merges route data from config + state and preserves canonicalized chains', () => {
    renderToStaticMarkup(React.createElement(HireAgentsRoute));

    expect(capturedProps).not.toBeNull();
    const props = capturedProps as HireAgentsRoutePropsCapture;

    expect(props.agents).toHaveLength(3);
    expect(props.featuredAgents).toHaveLength(3);

    const clmm = props.agents.find((agent) => agent.id === 'agent-clmm');
    const pendle = props.agents.find((agent) => agent.id === 'agent-pendle');

    expect(clmm?.chains).toEqual(['Arbitrum']);
    expect(clmm?.tokens).toEqual(['USDC', 'WETH', 'WBTC']);
    expect(clmm?.pointsTrend).toBe('up');
    expect(clmm?.trendMultiplier).toBe('3x');

    expect(pendle?.chains).toEqual(['Arbitrum']);
    expect(pendle?.tokens).toContain('sUSDai');
    expect(pendle?.tokens).toContain('USDe');
    expect(pendle?.pointsTrend).toBeUndefined();
  });

  it('routes hire/view handlers to the correct detail URL', () => {
    renderToStaticMarkup(React.createElement(HireAgentsRoute));

    const props = capturedProps as HireAgentsRoutePropsCapture;
    props.onHireAgent('agent-gmx-allora');
    props.onViewAgent('agent-pendle');

    expect(pushMock).toHaveBeenNthCalledWith(1, '/hire-agents/agent-gmx-allora');
    expect(pushMock).toHaveBeenNthCalledWith(2, '/hire-agents/agent-pendle');
  });

  it('passes featured agent descriptions from config into page props', () => {
    renderToStaticMarkup(React.createElement(HireAgentsRoute));

    const props = capturedProps as HireAgentsRoutePropsCapture;
    const pendle = props.featuredAgents.find((agent) => agent.id === 'agent-pendle');

    expect(pendle?.description).toContain('highest-yielding Pendle YT markets');
  });
});
