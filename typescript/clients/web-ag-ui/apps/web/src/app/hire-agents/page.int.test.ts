import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HireAgentsRoute from './page';

type HireAgentsRoutePropsCapture = {
  agents: Array<{
    id: string;
    name: string;
    status: 'for_hire' | 'hired' | 'unavailable';
    isActive?: boolean;
    chains: string[];
    protocols: string[];
    tokens: string[];
    avatarBg?: string;
    imageUrl?: string;
    surfaceTag?: 'Swarm' | 'Workflow';
    marketplaceCardBg?: string;
    marketplaceCardHoverBg?: string;
    marketplaceRowBg?: string;
    marketplaceRowHoverBg?: string;
    pointsTrend?: 'up';
    trendMultiplier?: string;
  }>;
  featuredAgents: Array<{
    id: string;
    name: string;
    status: 'for_hire' | 'hired' | 'unavailable';
    description?: string;
    chains: string[];
    protocols: string[];
    tokens: string[];
    avatarBg?: string;
    imageUrl?: string;
    surfaceTag?: 'Swarm' | 'Workflow';
    marketplaceCardBg?: string;
    marketplaceCardHoverBg?: string;
    marketplaceRowBg?: string;
    marketplaceRowHoverBg?: string;
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
        'agent-pi-example': {
          synced: true,
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Pi Runtime'],
            tokens: ['USDC'],
          },
          metrics: {
            iteration: 1,
          },
        },
        'agent-portfolio-manager': {
          synced: true,
          lifecyclePhase: 'active',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Pi Runtime', 'Shared Ember Domain Service'],
            tokens: ['USDC'],
            totalUsers: 12,
            aum: 9200,
            apy: 4,
          },
          metrics: {
            iteration: 5,
          },
        },
        'agent-ember-lending': {
          synced: true,
          lifecyclePhase: 'active',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Aave'],
            tokens: ['USDC'],
            totalUsers: 4,
            aum: 9100,
            apy: 3,
          },
          metrics: {
            iteration: 2,
          },
        },
      },
    });
  });

  it('merges route data from config + state while hiding internal-only agents from visible lists', () => {
    renderToStaticMarkup(React.createElement(HireAgentsRoute));

    expect(capturedProps).not.toBeNull();
    const props = capturedProps as HireAgentsRoutePropsCapture;

    expect(props.agents).toHaveLength(4);
    expect(props.featuredAgents).toHaveLength(4);

    const clmm = props.agents.find((agent) => agent.id === 'agent-clmm');
    const pendle = props.agents.find((agent) => agent.id === 'agent-pendle');
    const piExample = props.agents.find((agent) => agent.id === 'agent-pi-example');
    const portfolioManager = props.agents.find((agent) => agent.id === 'agent-portfolio-manager');

    expect(clmm?.chains).toEqual(['Arbitrum']);
    expect(clmm?.tokens).toEqual(['USDC', 'WETH', 'WBTC']);
    expect(clmm?.pointsTrend).toBe('up');
    expect(clmm?.trendMultiplier).toBe('3x');

    expect(pendle?.chains).toEqual(['Arbitrum']);
    expect(pendle?.tokens).toContain('sUSDai');
    expect(pendle?.tokens).toContain('USDe');
    expect(pendle?.pointsTrend).toBeUndefined();

    expect(piExample).toBeUndefined();

    expect(portfolioManager?.chains).toEqual(['Arbitrum']);
    expect(portfolioManager?.name).toBe('Ember Portfolio Agent');
    expect(portfolioManager?.protocols).toEqual(['Pi Runtime', 'Shared Ember Domain Service']);
    expect(portfolioManager?.tokens).toEqual(['USDC']);
    expect(portfolioManager?.imageUrl).toBe(
      'https://www.emberai.xyz/Logo.svg?dpl=dpl_J6BA6gqb9V9kgyUjTjKdpkPToAd7',
    );
    expect(portfolioManager?.marketplaceCardBg).toBe('rgba(124,58,237,0.10)');
    expect(portfolioManager?.marketplaceCardHoverBg).toBe('rgba(124,58,237,0.14)');
    expect(portfolioManager?.marketplaceRowBg).toBe('rgba(124,58,237,0.08)');
    expect(portfolioManager?.marketplaceRowHoverBg).toBe('rgba(124,58,237,0.12)');
    expect(portfolioManager?.surfaceTag).toBe('Swarm');
    expect(portfolioManager?.status).toBe('hired');
    expect(portfolioManager?.isActive).toBe(true);
    expect(portfolioManager?.pointsTrend).toBe('up');
    expect(portfolioManager?.trendMultiplier).toBe('5x');

    expect(clmm?.surfaceTag).toBe('Workflow');

    expect(props.featuredAgents.map((agent) => agent.id).slice(0, 2)).toEqual([
      'agent-portfolio-manager',
      'agent-clmm',
    ]);
    expect(props.featuredAgents.find((agent) => agent.id === 'agent-portfolio-manager')?.status).toBe(
      'hired',
    );
    expect(props.featuredAgents.find((agent) => agent.id === 'agent-ember-lending')).toBeUndefined();
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
    const portfolioManager = props.featuredAgents.find((agent) => agent.id === 'agent-portfolio-manager');
    const pendle = props.featuredAgents.find((agent) => agent.id === 'agent-pendle');

    expect(portfolioManager).toBeDefined();
    expect(pendle?.description).toContain('highest-yielding Pendle YT markets');
  });

  it('omits the hidden ember-lending execution worker from the visible hire-agents route payload', () => {
    renderToStaticMarkup(React.createElement(HireAgentsRoute));

    const props = capturedProps as HireAgentsRoutePropsCapture;
    expect(props.agents.find((agent) => agent.id === 'agent-ember-lending')).toBeUndefined();
    expect(props.featuredAgents.find((agent) => agent.id === 'agent-ember-lending')).toBeUndefined();
  });
});
