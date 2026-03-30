import { describe, expect, it } from 'vitest';

import { createPortfolioManagerAgentConfig } from './portfolioManagerFoundation.js';

describe('createPortfolioManagerAgentConfig', () => {
  it('builds an OpenRouter-backed agent-runtime config for portfolio-manager startup', () => {
    const config = createPortfolioManagerAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      PORTFOLIO_MANAGER_MODEL: 'openai/gpt-5.4-mini',
      DATABASE_URL: 'postgresql://portfolio:secret@db.internal:5432/pi_runtime',
    });

    expect(config.model).toMatchObject({
      id: 'openai/gpt-5.4-mini',
      name: 'openai/gpt-5.4-mini',
      api: 'openai-responses',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: true,
    });
    expect(config.systemPrompt).toContain('portfolio manager orchestrator');
    expect(config.databaseUrl).toBe('postgresql://portfolio:secret@db.internal:5432/pi_runtime');
    expect(config.tools).toEqual([]);
    expect(config.domain?.lifecycle).toMatchObject({
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'active'],
      terminalPhases: [],
      commands: [
        {
          name: 'hire',
        },
        {
          name: 'fire',
        },
        {
          name: 'register_root_delegation_from_user_signing',
        },
        {
          name: 'refresh_portfolio_state',
        },
        {
          name: 'complete_onboarding_bootstrap',
        },
        {
          name: 'complete_rooted_bootstrap_from_user_signing',
        },
      ],
      transitions: [],
      interrupts: [
        {
          type: 'portfolio-manager-setup-request',
        },
        {
          type: 'portfolio-manager-delegation-signing-request',
        },
      ],
    });
    expect(config.agentOptions?.initialState).toMatchObject({
      thinkingLevel: 'low',
    });
    expect(config.agentOptions?.getApiKey?.()).toBe('test-openrouter-key');
    expect(
      config.domain?.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          pendingUserWalletAddress: null,
          pendingBaseContributionUsd: null,
        },
      }),
    ).toEqual(['Lifecycle phase: prehire.']);
  });

  it('requires OPENROUTER_API_KEY for real local startup', () => {
    expect(() => createPortfolioManagerAgentConfig({})).toThrow('OPENROUTER_API_KEY');
  });
});
