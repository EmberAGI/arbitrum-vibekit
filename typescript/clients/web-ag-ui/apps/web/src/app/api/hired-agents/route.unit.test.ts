import { from } from 'rxjs';
import { EventType } from '@ag-ui/core';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildCopilotRuntimeAgentsMock = vi.fn();
const getVisibleAgentsMock = vi.fn();

vi.mock('../copilotkit/copilotRuntimeRegistry', () => ({
  buildCopilotRuntimeAgents: (...args: unknown[]) => buildCopilotRuntimeAgentsMock(...args),
}));

vi.mock('../../../config/agents', () => ({
  getVisibleAgents: () => getVisibleAgentsMock(),
}));

import { GET } from './route';

function buildRequest(wallet: string): NextRequest {
  return new NextRequest(`http://localhost/api/hired-agents?wallet=${encodeURIComponent(wallet)}`);
}

describe('GET /api/hired-agents', () => {
  beforeEach(() => {
    buildCopilotRuntimeAgentsMock.mockReset();
    getVisibleAgentsMock.mockReset();
    getVisibleAgentsMock.mockReturnValue([
      { id: 'agent-portfolio-manager' },
      { id: 'agent-ember-lending' },
      { id: 'agent-clmm' },
      { id: 'agent-gmx-allora' },
    ]);
  });

  it('returns hired-agent truth across HTTP and workflow runtimes', async () => {
    buildCopilotRuntimeAgentsMock.mockReturnValue({
      'agent-portfolio-manager': {
        connect: vi.fn(() =>
          from([
            {
              type: EventType.STATE_SNAPSHOT,
              threadId: 'agent-portfolio-manager:0x1111111111111111111111111111111111111111',
              runId: 'run-pm-1',
              snapshot: {
                thread: {
                  lifecycle: { phase: 'active' },
                  profile: {
                    chains: ['Arbitrum'],
                    protocols: ['Shared Ember'],
                    tokens: ['USDC'],
                    pools: [],
                    allowedPools: [],
                  },
                  metrics: {},
                },
              },
            },
          ]),
        ),
      },
      'agent-ember-lending': {
        connect: vi.fn(() =>
          from([
            {
              type: EventType.STATE_SNAPSHOT,
              threadId: 'agent-ember-lending:0x1111111111111111111111111111111111111111',
              runId: 'run-lending-1',
              snapshot: {
                thread: {
                  lifecycle: { phase: 'prehire' },
                  profile: {
                    chains: ['Arbitrum'],
                    protocols: ['Aave'],
                    tokens: ['USDC'],
                    pools: [],
                    allowedPools: [],
                  },
                  metrics: {},
                },
              },
            },
          ]),
        ),
      },
      'agent-clmm': {
        readThreadSnapshot: vi.fn(async () => ({
          thread: {
            lifecycle: { phase: 'active' },
            task: {
              id: 'task-clmm',
              taskStatus: {
                state: 'working',
              },
            },
            profile: {
              chains: ['Arbitrum'],
              protocols: ['Camelot'],
              tokens: ['USDC'],
              pools: [],
              allowedPools: [],
            },
            metrics: {},
          },
        })),
      },
    });

    const response = await GET(
      buildRequest('0x1111111111111111111111111111111111111111'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      hiredAgentIds: ['agent-clmm', 'agent-portfolio-manager'],
      agents: {
        'agent-portfolio-manager': {
          synced: true,
          lifecyclePhase: 'active',
          isHired: true,
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Shared Ember'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
          metrics: {
            cyclesSinceRebalance: 0,
            iteration: 0,
            rebalanceCycles: 0,
            staleCycles: 0,
          },
        },
        'agent-ember-lending': {
          synced: true,
          lifecyclePhase: 'prehire',
          isHired: false,
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Aave'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
          metrics: {
            cyclesSinceRebalance: 0,
            iteration: 0,
            rebalanceCycles: 0,
            staleCycles: 0,
          },
        },
        'agent-clmm': {
          synced: true,
          taskId: 'task-clmm',
          taskState: 'working',
          lifecyclePhase: 'active',
          isHired: true,
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Camelot'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
          metrics: {
            cyclesSinceRebalance: 0,
            iteration: 0,
            rebalanceCycles: 0,
            staleCycles: 0,
          },
        },
        'agent-gmx-allora': {
          isHired: false,
        },
      },
    });
  });

  it('rejects missing or invalid wallet addresses', async () => {
    const response = await GET(new NextRequest('http://localhost/api/hired-agents'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid wallet address.',
    });

    const invalidResponse = await GET(buildRequest('not-a-wallet'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid wallet address.',
    });
  });

  it('tolerates individual agent snapshot failures', async () => {
    buildCopilotRuntimeAgentsMock.mockReturnValue({
      'agent-portfolio-manager': {
        connect: vi.fn(() => {
          throw new Error('connect failed');
        }),
      },
    });

    const response = await GET(
      buildRequest('0x1111111111111111111111111111111111111111'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      hiredAgentIds: [],
      agents: {
        'agent-portfolio-manager': {
          isHired: false,
        },
        'agent-ember-lending': {
          isHired: false,
        },
        'agent-clmm': {
          isHired: false,
        },
        'agent-gmx-allora': {
          isHired: false,
        },
      },
    });
  });
});
