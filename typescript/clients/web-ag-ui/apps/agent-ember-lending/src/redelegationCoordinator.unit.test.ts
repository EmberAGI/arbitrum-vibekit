import { describe, expect, it, vi } from 'vitest';

import {
  buildPortfolioManagerThreadId,
  createPortfolioManagerRedelegationRefresher,
  resolvePortfolioManagerAgentDeploymentUrl,
} from './redelegationCoordinator.js';

describe('redelegationCoordinator', () => {
  it('derives the same PM thread id for the same rooted wallet address', () => {
    expect(
      buildPortfolioManagerThreadId('0x00000000000000000000000000000000000000A1'),
    ).toBe(
      buildPortfolioManagerThreadId('0x00000000000000000000000000000000000000a1'),
    );
    expect(
      buildPortfolioManagerThreadId('0x00000000000000000000000000000000000000a1'),
    ).not.toBe(
      buildPortfolioManagerThreadId('0x00000000000000000000000000000000000000a2'),
    );
  });

  it('runs refresh_redelegation_work against the PM direct command lane', async () => {
    const run = vi.fn(() => ({
      subscribe(observer: {
        complete?: () => void;
        error?: (error: unknown) => void;
      }) {
        observer.complete?.();
        return {
          unsubscribe() {
            return undefined;
          },
        };
      },
    }));
    const createHttpAgent = vi.fn(() => ({
      run,
    }));

    const refresh = createPortfolioManagerRedelegationRefresher({
      runtimeUrl: 'http://127.0.0.1:3420/ag-ui',
      createHttpAgent,
    });

    await refresh({
      rootWalletAddress: '0x00000000000000000000000000000000000000A1',
    });

    expect(createHttpAgent).toHaveBeenCalledWith({
      agentId: 'agent-portfolio-manager',
      runtimeUrl: 'http://127.0.0.1:3420/ag-ui',
    });
    expect(run).toHaveBeenCalledWith({
      threadId: buildPortfolioManagerThreadId(
        '0x00000000000000000000000000000000000000a1',
      ),
      runId: expect.any(String),
      messages: [],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {
        command: {
          name: 'refresh_redelegation_work',
        },
      },
    });
  });

  it('resolves the PM runtime url from env with a local default', () => {
    expect(resolvePortfolioManagerAgentDeploymentUrl({})).toBe(
      'http://127.0.0.1:3420/ag-ui',
    );
    expect(
      resolvePortfolioManagerAgentDeploymentUrl({
        PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: 'http://pm.example.test/ag-ui',
      }),
    ).toBe('http://pm.example.test/ag-ui');
  });
});
