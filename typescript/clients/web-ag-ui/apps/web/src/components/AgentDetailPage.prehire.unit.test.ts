import React from 'react';
import type { Message } from '@ag-ui/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';

vi.mock('../hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      walletClient: null,
      privyWallet: null,
      chainId: null,
      switchChain: async () => {},
      isLoading: false,
      error: null,
    }),
  };
});

describe('AgentDetailPage (pre-hire + onboarding affordances)', () => {
  it('does not throw when pre-hire metrics payload includes null numeric fields', () => {
    const render = () =>
      renderToStaticMarkup(
        React.createElement(AgentDetailPage, {
          agentId: 'agent-clmm',
          agentName: 'Camelot CLMM',
          agentDescription: 'desc',
          creatorName: 'Ember AI Team',
          creatorVerified: true,
          profile: {
            chains: [],
            protocols: [],
            tokens: [],
            totalUsers: null as unknown as number,
          },
          metrics: {
            apy: null as unknown as number,
          },
          fullMetrics: {
            previousApy: null as unknown as number,
          },
          isHired: false,
          isHiring: false,
          hasLoadedView: true,
          onHire: () => {},
          onFire: () => {},
          onSync: () => {},
          onBack: () => {},
          allowedPools: [],
        }),
      );

    expect(render).not.toThrow();
  });

  it('renders a lightweight metrics preview before the agent is hired', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('APY Change');
    expect(html).toContain('Total Users');
  });

  it('renders pre-hire detail chrome on the light shell palette', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('bg-[linear-gradient(180deg,#fffdf9_0%,#f7efe4_100%)]');
    expect(html).toContain('border-[#eadac7]');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('bg-[#1e1e1e]');
  });

  it('keeps pre-hire chat disabled for non-chat-first agents', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(new RegExp('<button[^>]*disabled[^>]*>\\s*Chat\\s*</button>'));
  });

  it('shows reconnecting state instead of a hire affordance while waiting for an authoritative snapshot', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: false,
        isRestoringState: true,
        isHiring: false,
        hasLoadedView: false,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Reconnecting...');
    expect(html).toContain('Restoring state');
    expect(html).not.toContain('>Hire<');
  });

  it('keeps chat disabled for agents removed from the host surface', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pi-example',
        agentName: 'Pi Example Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        initialTab: 'chat',
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(new RegExp('<button[^>]*disabled[^>]*>\\s*Chat\\s*</button>'));
    expect(html).not.toContain('Send message');
  });

  it('renders reasoning messages in the Ember Portfolio Agent pre-hire chat transcript', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        initialTab: 'chat',
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        messages: [
          {
            id: 'reasoning-1',
            role: 'reasoning',
            content: 'Analyzing the request before answering.',
          } as never,
        ],
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Reasoning');
    expect(html).toContain('Analyzing the request before answering.');
  });

  it('renders linked reasoning in the order supplied by the runtime transcript', () => {
    const messages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Here is the final answer.',
      },
      {
        id: 'reasoning-1',
        role: 'reasoning',
        content: 'Thinking through the request first.',
        parentMessageId: 'assistant-1',
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        initialTab: 'chat',
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        messages,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Thinking through the request first.');
    expect(html).toContain('Here is the final answer.');
    expect(html.indexOf('Here is the final answer.')).toBeLessThan(
      html.indexOf('Thinking through the request first.'),
    );
  });

  it('renders simple markdown emphasis in chat transcript messages', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        initialTab: 'chat',
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        messages: [
          {
            id: 'assistant-markdown-1',
            role: 'assistant',
            content: 'Use **reserved WETH** only after *confirmation*.',
          },
        ],
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('<strong');
    expect(html).toContain('reserved WETH');
    expect(html).toContain('<em');
    expect(html).toContain('confirmation');
    expect(html).not.toContain('**reserved WETH**');
    expect(html).not.toContain('*confirmation*');
  });

  it('renders automation status artifacts and A2UI cards in the Ember Portfolio Agent chat transcript', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        initialTab: 'chat',
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        events: [
          {
            type: 'artifact',
            artifact: {
              artifactId: 'automation-artifact',
              data: {
                type: 'automation-status',
                status: 'scheduled',
                command: 'refresh',
                detail: 'Scheduled refresh every 5 minutes.',
              },
            },
          },
          {
            type: 'dispatch-response',
            parts: [
              {
                kind: 'a2ui',
                data: {
                  payload: {
                    kind: 'automation-status',
                    payload: {
                      status: 'scheduled',
                      command: 'refresh',
                      detail: 'Scheduled refresh every 5 minutes.',
                    },
                  },
                },
              },
            ],
          },
        ],
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Artifact');
    expect(html).toContain('A2UI');
    expect(html).toContain('pi-example-a2ui-view');
  });

  it('renders interrupt A2UI controls in the Ember Portfolio Agent chat transcript', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        initialTab: 'chat',
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        events: [
          {
            type: 'dispatch-response',
            parts: [
              {
                kind: 'a2ui',
                data: {
                  payload: {
                    kind: 'interrupt',
                    payload: {
                      message: 'Please provide a short operator note to continue.',
                      submitLabel: 'Continue agent loop',
                    },
                  },
                },
              },
            ],
          },
        ],
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        onSendChatMessage: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('A2UI');
    expect(html).toContain('pi-example-a2ui-view');
  });

  it('keeps the Ember Lending chat tab visible while the thread is input-required', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-ember-lending',
        agentName: 'Ember Lending',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        initialTab: 'chat',
        isHired: true,
        isHiring: false,
        hasLoadedView: true,
        lifecycleState: {
          phase: 'active',
        } as never,
        taskStatus: 'input-required',
        activeInterrupt: {
          type: 'operator-config-request',
          message: 'Please provide a short operator note to continue.',
        } as never,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Create an automation every minute.',
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'What should the automation do every minute?',
          },
        ],
        events: [
          {
            type: 'dispatch-response',
            parts: [
              {
                kind: 'a2ui',
                data: {
                  payload: {
                    kind: 'interrupt',
                    payload: {
                      message: 'Please provide a short operator note to continue.',
                      submitLabel: 'Continue agent loop',
                    },
                  },
                },
              },
            ],
          },
        ],
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        onSendChatMessage: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Create an automation every minute.');
    expect(html).toContain('What should the automation do every minute?');
    expect(html).toContain('pi-example-a2ui-view');
    expect(html).toContain('Send message');
  });

  it('renders metrics tab as disabled while onboarding is in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        onboarding: { step: 1 },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('shows metrics tab as enabled when onboarding metadata is stale but no input is required', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        onboarding: { step: 3 },
        taskStatus: 'working',
        setupComplete: true,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*>\\s*Metrics\\s*</button>'),
    );
    expect(html).not.toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('keeps metrics disabled while onboarding flow is in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        taskStatus: 'working',
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          activeStepId: 'funding-token',
          steps: [
            { id: 'funding-amount', title: 'Funding Amount', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'active' },
          ],
        },
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('enables metrics when onboarding flow is completed', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        taskStatus: 'working',
        onboardingFlow: {
          status: 'completed',
          revision: 3,
          steps: [
            { id: 'funding-amount', title: 'Funding Amount', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'completed' },
          ],
        },
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*>\\s*Metrics\\s*</button>'),
    );
    expect(html).not.toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('keeps metrics disabled while onboarding lifecycle is explicitly in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        taskStatus: 'working',
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          activeStepId: 'funding-token',
          steps: [
            { id: 'setup', title: 'Agent Preferences', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'active' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'pending' },
          ],
        },
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('renders onboarding sidebar from agent-provided onboarding flow', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        activeInterrupt: {
          type: 'pendle-setup-request',
          message: 'configure',
        },
        onboardingFlow: {
          status: 'in_progress',
          revision: 1,
          activeStepId: 'funding-amount',
          steps: [
            { id: 'funding-amount', title: 'Funding Amount', status: 'active' },
            { id: 'funding-token', title: 'Funding Token', status: 'pending' },
          ],
        },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Funding Amount');
    expect(html).toContain('Funding Token');
    expect(html).not.toContain('Delegation Signing');
  });

  it('renders delegation as the second step when funding is skipped', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        activeInterrupt: {
          type: 'pendle-delegation-signing-request',
          message: 'sign',
          chainId: 42161,
          delegationManager: '0x0000000000000000000000000000000000000001',
          delegatorAddress: '0x0000000000000000000000000000000000000002',
          delegateeAddress: '0x0000000000000000000000000000000000000003',
          delegationsToSign: [],
          descriptions: [],
          warnings: [],
        },
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          activeStepId: 'delegation-signing',
          steps: [
            { id: 'funding-amount', title: 'Funding Amount', status: 'completed' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'active' },
          ],
        },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Funding Amount');
    expect(html).toContain('Delegation Signing');
    expect(html).not.toContain('Funding Token');
  });

  it('renders reduced delegation step from onboarding flow', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        activeInterrupt: {
          type: 'pendle-delegation-signing-request',
          message: 'sign',
          chainId: 42161,
          delegationManager: '0x0000000000000000000000000000000000000001',
          delegatorAddress: '0x0000000000000000000000000000000000000002',
          delegateeAddress: '0x0000000000000000000000000000000000000003',
          delegationsToSign: [],
          descriptions: [],
          warnings: [],
        },
        onboardingFlow: {
          status: 'in_progress',
          revision: 4,
          activeStepId: 'delegation-signing',
          steps: [
            {
              id: 'funding-amount',
              title: 'Funding Amount',
              status: 'completed',
            },
            {
              id: 'delegation-signing',
              title: 'Delegation Signing',
              status: 'active',
            },
          ],
        },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Funding Amount');
    expect(html).toContain('Delegation Signing');
    expect(html).not.toContain('Funding Token');
  });
});
