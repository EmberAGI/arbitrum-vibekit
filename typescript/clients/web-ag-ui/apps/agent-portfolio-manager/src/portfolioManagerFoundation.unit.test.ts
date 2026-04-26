import type { AgentRuntimeSigningService } from 'agent-runtime/internal';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createHiddenOcaSpotSwapExecutorMock } = vi.hoisted(() => ({
  createHiddenOcaSpotSwapExecutorMock: vi.fn(() => ({
    executeSpotSwap: vi.fn(),
  })),
}));

vi.mock('./hiddenOcaSwapExecutor.js', () => ({
  createHiddenOcaSpotSwapExecutor: createHiddenOcaSpotSwapExecutorMock,
}));

import { createPortfolioManagerAgentConfig } from './portfolioManagerFoundation.js';

describe('createPortfolioManagerAgentConfig', () => {
  beforeEach(() => {
    createHiddenOcaSpotSwapExecutorMock.mockClear();
    createHiddenOcaSpotSwapExecutorMock.mockImplementation(() => ({
      executeSpotSwap: vi.fn(),
    }));
  });

  it('builds an OpenRouter-backed agent-runtime config for portfolio-manager startup', async () => {
    const config = createPortfolioManagerAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      PORTFOLIO_MANAGER_MODEL: 'openai/gpt-5.4',
      DATABASE_URL: 'postgresql://portfolio:secret@db.internal:5432/pi_runtime',
    });

    expect(config.model).toMatchObject({
      id: 'openai/gpt-5.4',
      name: 'openai/gpt-5.4',
      api: 'openai-responses',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: true,
      input: ['text'],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 128_000,
      maxTokens: 4_096,
    });
    expect(config.systemPrompt).toContain('portfolio manager orchestrator');
    expect(config.systemPrompt).toContain('Never suggest releasing or adjusting a reservation');
    expect(config.systemPrompt).toContain('confirm_spot_swap_reserved_capital');
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
          name: 'update_managed_mandate',
        },
        {
          name: 'refresh_redelegation_work',
        },
        {
          name: 'dispatch_spot_swap',
        },
        {
          name: 'confirm_spot_swap_reserved_capital',
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
        {
          type: 'portfolio-manager-swap-reservation-conflict-request',
        },
      ],
    });
    expect(config.agentOptions?.initialState).toMatchObject({
      thinkingLevel: 'low',
    });
    const spotSwapCommand = config.domain?.lifecycle.commands.find(
      (command) => command.name === 'dispatch_spot_swap',
    );
    expect(spotSwapCommand?.description).toContain('inputJson');
    expect(spotSwapCommand?.description).toContain('walletAddress');
    expect(spotSwapCommand?.description).toContain('amountType');
    expect(spotSwapCommand?.description).toContain('fromChain');
    expect(spotSwapCommand?.description).toContain('toToken');
    expect(spotSwapCommand?.description).toContain('base-unit');
    expect(spotSwapCommand?.description).toContain('capitalPool');
    expect(spotSwapCommand?.description).toContain('reserved_or_assigned');
    expect(spotSwapCommand?.description).toContain('Never suggest releasing or adjusting');
    const spotSwapConfirmationCommand = config.domain?.lifecycle.commands.find(
      (command) => command.name === 'confirm_spot_swap_reserved_capital',
    );
    expect(spotSwapConfirmationCommand?.description).toContain('allow_reserved_for_other_agent');
    expect(spotSwapConfirmationCommand?.description).toContain('unassigned_only');
    expect(spotSwapConfirmationCommand?.description).toContain('cancel');
    expect(spotSwapConfirmationCommand?.description).toContain('yes');
    const swapConflictInterrupt = config.domain?.lifecycle.interrupts.find(
      (interrupt) => interrupt.type === 'portfolio-manager-swap-reservation-conflict-request',
    );
    expect(swapConflictInterrupt?.description).toContain('yes');
    expect(swapConflictInterrupt?.description).toContain('allow_reserved_for_other_agent');
    expect(swapConflictInterrupt?.description).toContain('Do not repeat dispatch_spot_swap');
    expect(config.agentOptions?.getApiKey?.(undefined as never)).toBe('test-openrouter-key');
    expect(
      await config.domain?.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).toEqual([
      '<portfolio_manager_context>',
      '  <lifecycle_phase>prehire</lifecycle_phase>',
      '</portfolio_manager_context>',
    ]);
  });

  it('requires OPENROUTER_API_KEY for real local startup', () => {
    expect(() => createPortfolioManagerAgentConfig({})).toThrow('OPENROUTER_API_KEY');
  });

  it('registers the wallet accounting tool when Shared Ember is configured', () => {
    const config = createPortfolioManagerAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
    });

    expect(config.systemPrompt).toContain('read_wallet_accounting_state');
    expect(config.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'read_wallet_accounting_state',
        }),
      ]),
    );
  });

  it('wires the hidden OCA swap executor with PM-owned redelegation refresh', () => {
    const runtimeSigning = {
      readAddress: vi.fn<AgentRuntimeSigningService['readAddress']>(),
      signPayload: vi.fn<AgentRuntimeSigningService['signPayload']>(),
    };

    createPortfolioManagerAgentConfig(
      {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
      },
      {
        runtimeSigning,
        runtimeSignerRef: 'controller-wallet',
        controllerWalletAddress: '0x00000000000000000000000000000000000000c2',
        controllerSignerAddress: '0x00000000000000000000000000000000000000c1',
        hiddenOcaExecutorWalletAddress: '0x00000000000000000000000000000000000000e1',
        hiddenOcaExecutorRuntimeSignerRef: 'oca-executor-wallet',
      },
    );

    expect(createHiddenOcaSpotSwapExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSigning,
        runtimeSignerRef: 'oca-executor-wallet',
        executorWalletAddress: '0x00000000000000000000000000000000000000e1',
        requestRedelegationRefresh: expect.any(Function),
      }),
    );
  });

  it('registers the diagnostic runtime tool only when explicitly enabled', async () => {
    const disabledConfig = createPortfolioManagerAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
    });
    expect(disabledConfig.tools).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          name: 'diagnostic_runtime_ping',
        }),
      ]),
    );

    const enabledConfig = createPortfolioManagerAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      PORTFOLIO_MANAGER_ENABLE_DIAGNOSTIC_TOOLS: '1',
    });
    const diagnosticTool = enabledConfig.tools?.find((tool) => tool.name === 'diagnostic_runtime_ping');
    expect(diagnosticTool).toBeDefined();
    await expect(diagnosticTool?.execute?.('tool-diagnostic-ping', { label: 'probe-1' })).resolves.toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('diagnostic runtime ping ok (probe-1)'),
        },
      ],
      details: {
        label: 'probe-1',
        source: 'agent-portfolio-manager',
        executedAt: expect.any(String),
      },
    });
  });

  it('surfaces the active portfolio wallet address in system context after onboarding', () => {
    const config = createPortfolioManagerAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
    });

    return expect(
      config.domain?.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 1,
          lastRootDelegation: {
            root_delegation_id: 'root-1',
          },
          lastOnboardingBootstrap: {
            rootedWalletContext: {
              wallet_address: '0x00000000000000000000000000000000000000a1',
            },
          },
          lastRootedWalletContextId: 'rwc-1',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).resolves.toContain(
      '  <active_portfolio_wallet_address>0x00000000000000000000000000000000000000a1</active_portfolio_wallet_address>',
    );
  });
});
