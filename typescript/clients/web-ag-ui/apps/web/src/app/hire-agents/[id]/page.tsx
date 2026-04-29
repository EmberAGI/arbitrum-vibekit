'use client';

import { use, useCallback, useEffect, useRef, type ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Message } from '@ag-ui/core';
import { useLogin } from '@privy-io/react-auth';
import { AgentDetailPage } from '@/components/AgentDetailPage';
import { getAgentConfig, isRegisteredAgentId } from '@/config/agents';
import { useAgent } from '@/contexts/AgentContext';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { invokeAgentCommandRoute } from '@/utils/agentCommandRoute';
import { getAgentThreadId } from '@/utils/agentThread';
import { navigateToHref } from '@/utils/hardNavigation';
import { isPrivyConfigured } from '@/utils/privyConfig';

type UiPreviewState = 'prehire' | 'onboarding' | 'active';
type UiPreviewFixture = 'managed';
type AgentRouteTab = 'blockers' | 'metrics' | 'transactions' | 'chat';

const EMPTY_MESSAGES: Message[] = [];

function parseUiPreviewState(value: string | null): UiPreviewState | null {
  if (value === 'prehire' || value === 'onboarding' || value === 'active') return value;
  return null;
}

function parseUiPreviewFixture(value: string | null): UiPreviewFixture | null {
  if (value === 'managed') return value;
  return null;
}

function parseAgentRouteTab(value: string | null): AgentRouteTab | null {
  if (
    value === 'blockers' ||
    value === 'metrics' ||
    value === 'transactions' ||
    value === 'chat'
  ) {
    return value;
  }
  return null;
}

function buildUiPreviewLifecycleState(args: {
  agentId: string;
  fixture: UiPreviewFixture | null;
  uiState: UiPreviewState | null;
}): ComponentProps<typeof AgentDetailPage>['lifecycleState'] {
  if (args.uiState !== 'active' || args.fixture !== 'managed') {
    return undefined;
  }

  if (args.agentId === 'agent-portfolio-manager') {
    return {
      phase: 'active',
    } as never;
  }

  if (args.agentId === 'agent-ember-lending') {
    return {
      phase: 'active',
    } as never;
  }

  return undefined;
}

function buildUiPreviewDomainProjection(args: {
  agentId: string;
  fixture: UiPreviewFixture | null;
  uiState: UiPreviewState | null;
}): ComponentProps<typeof AgentDetailPage>['domainProjection'] {
  if (args.uiState !== 'active' || args.fixture !== 'managed') {
    return undefined;
  }

  return {
    managedMandateEditor: {
      ownerAgentId: 'agent-portfolio-manager',
      targetAgentId: 'ember-lending',
      targetAgentRouteId: 'agent-ember-lending',
      targetAgentKey: 'ember-lending-primary',
      targetAgentTitle: 'Ember Lending',
      mandateRef: 'mandate-ember-lending-001',
      managedMandate: {
        lending_policy: {
          collateral_policy: {
            assets: [
              {
                asset: 'USDC',
                max_allocation_pct: 35,
              },
            ],
          },
          borrow_policy: {
            allowed_assets: ['USDC'],
          },
          risk_policy: {
            max_ltv_bps: 7000,
            min_health_factor: '1.25',
          },
        },
      },
      agentWallet: '0x00000000000000000000000000000000000000b1',
      rootUserWallet: '0x00000000000000000000000000000000000000a1',
      rootedWalletContextId: 'rwc-ember-lending-thread-001',
      reservation: {
        reservationId: 'reservation-ember-lending-001',
        purpose: 'position.enter',
        controlPath: 'lending.supply',
        rootAsset: 'USDC',
        quantity: '10',
      },
    },
  };
}

export default function AgentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const agent = useAgent();
  const { login } = useLogin();
  const { privyWallet } = usePrivyWalletClient();
  const activeAgentId = agent.config.id;
  const routeAgentId = id;
  const routeHasRegisteredAgent = isRegisteredAgentId(routeAgentId);
  const selectedAgentId = routeAgentId;
  const selectedConfig = getAgentConfig(selectedAgentId);
  const selectedLifecycleState = agent.uiState.lifecycle;
  const selectedOnboardingFlow = agent.uiState.onboardingFlow;
  const selectedTask = agent.uiState.task;
  const selectedMetrics = agent.metrics;
  const selectedActivity = agent.activity;
  const selectedProfileSource = agent.profile;
  const onboardingOwnerAgentId = selectedConfig.onboardingOwnerAgentId;
  const selectedProfile = {
    ...selectedProfileSource,
    chains:
      selectedProfileSource.chains && selectedProfileSource.chains.length > 0
        ? selectedProfileSource.chains
        : selectedConfig.chains ?? [],
    protocols:
      selectedProfileSource.protocols && selectedProfileSource.protocols.length > 0
        ? selectedProfileSource.protocols
        : selectedConfig.protocols ?? [],
    tokens:
      selectedProfileSource.tokens && selectedProfileSource.tokens.length > 0
        ? selectedProfileSource.tokens
        : selectedConfig.tokens ?? [],
  };
  const selectedHasLoadedView = agent.hasLoadedView;
  const selectedIsHired = agent.isHired;
  const isRestoringState = Boolean(
    agent.threadId && !agent.hasAuthoritativeState && !onboardingOwnerAgentId,
  );
  const projectionHydrationKeyRef = useRef<string | null>(null);

  const handleBack = () => {
    navigateToHref('/hire-agents');
  };
  const handleWalletGate = useCallback(() => {
    if (isPrivyConfigured()) {
      login();
      return;
    }

    navigateToHref('/wallet');
  }, [login]);
  const handleManagedOwnerNavigation = (ownerAgentId: string) => {
    if (!getAgentThreadId(ownerAgentId, privyWallet?.address)) {
      handleWalletGate();
      return;
    }
    navigateToHref(`/hire-agents/${ownerAgentId}`);
  };
  const handleHire = onboardingOwnerAgentId
    ? () => handleManagedOwnerNavigation(onboardingOwnerAgentId)
    : agent.threadId
      ? agent.runHire
      : handleWalletGate;
  const handleFire = onboardingOwnerAgentId
    ? () => handleManagedOwnerNavigation(onboardingOwnerAgentId)
    : agent.runFire;

  // Preview-only detail states must stay explicitly disabled unless the host opts in.
  const uiPreviewEnabled = process.env.NEXT_PUBLIC_UI_PREVIEW === 'true';
  const uiPreviewState =
    uiPreviewEnabled ? parseUiPreviewState(searchParams.get('__uiState')) : null;
  const requestedTab = parseAgentRouteTab(searchParams.get('tab'));
  const uiPreviewTab = uiPreviewEnabled ? parseAgentRouteTab(searchParams.get('__tab')) : null;
  const uiPreviewFixture = uiPreviewEnabled ? parseUiPreviewFixture(searchParams.get('__fixture')) : null;
  const selectedTab = requestedTab ?? uiPreviewTab;
  const selectedLifecyclePhase = selectedLifecycleState?.phase;
  const portfolioManagerThreadId =
    selectedAgentId === 'agent-portfolio-manager' && agent.threadId
      ? agent.threadId
      : getAgentThreadId('agent-portfolio-manager', privyWallet?.address);
  const lendingThreadId =
    selectedAgentId === 'agent-ember-lending' && agent.threadId
      ? agent.threadId
      : getAgentThreadId('agent-ember-lending', privyWallet?.address);

  useEffect(() => {
    if (!routeHasRegisteredAgent) {
      navigateToHref('/hire-agents', { replace: true });
    }
  }, [routeHasRegisteredAgent]);

  const handleManagedMandateSave = useCallback(
    async (input: Parameters<NonNullable<ComponentProps<typeof AgentDetailPage>['onManagedMandateSave']>>[0]) => {
      if (!portfolioManagerThreadId) {
        throw new Error('Connect the managed wallet to update the lending mandate.');
      }

      const portfolioManagerUpdateResult = await invokeAgentCommandRoute({
        agentId: 'agent-portfolio-manager',
        threadId: portfolioManagerThreadId,
        command: {
          name: 'update_managed_mandate',
          input: {
            targetAgentId: input.targetAgentId,
            managedMandate: input.managedMandate,
          },
        },
      });

      if (selectedAgentId === 'agent-portfolio-manager' && portfolioManagerUpdateResult.domainProjection) {
        agent.applyDomainProjection(portfolioManagerUpdateResult.domainProjection);
      }

      const hydrationCommands: Array<{
        agentId: 'agent-portfolio-manager' | 'agent-ember-lending';
        threadId: string;
        commandName: 'refresh_portfolio_state' | 'hydrate_runtime_projection';
      }> = [
        portfolioManagerThreadId
          ? {
              agentId: 'agent-portfolio-manager',
              threadId: portfolioManagerThreadId,
              commandName: 'refresh_portfolio_state',
            }
          : null,
        lendingThreadId
          ? {
              agentId: 'agent-ember-lending',
              threadId: lendingThreadId,
              commandName: 'hydrate_runtime_projection',
            }
          : null,
      ].filter(
        (
          command,
        ): command is {
          agentId: 'agent-portfolio-manager' | 'agent-ember-lending';
          threadId: string;
          commandName: 'refresh_portfolio_state' | 'hydrate_runtime_projection';
        } => command !== null,
      );

      if (hydrationCommands.length > 0) {
        const hydrationResults = await Promise.all(
          hydrationCommands.map(async (command) => ({
            agentId: command.agentId,
            result: await invokeAgentCommandRoute({
              agentId: command.agentId,
              threadId: command.threadId,
              command: {
                name: command.commandName,
              },
            }),
          })),
        );
        const activeHydrationResult = hydrationResults.find(
          (result) => result.agentId === selectedAgentId,
        )?.result;
        if (activeHydrationResult?.domainProjection) {
          agent.applyDomainProjection(activeHydrationResult.domainProjection);
        }
      }
    },
    [agent, lendingThreadId, portfolioManagerThreadId, selectedAgentId],
  );

  useEffect(() => {
    if (!routeHasRegisteredAgent) {
      return;
    }
    if (!agent.threadId || !selectedIsHired) {
      return;
    }
    if (selectedAgentId !== 'agent-portfolio-manager' && selectedLifecyclePhase !== 'active') {
      return;
    }

    const commandName =
      selectedAgentId === 'agent-portfolio-manager'
        ? 'refresh_portfolio_state'
        : selectedAgentId === 'agent-ember-lending'
          ? 'hydrate_runtime_projection'
          : null;
    if (!commandName) {
      return;
    }

    const hydrationKey = `${selectedAgentId}:${agent.threadId}:${commandName}`;
    if (projectionHydrationKeyRef.current === hydrationKey) {
      return;
    }
    projectionHydrationKeyRef.current = hydrationKey;

    void invokeAgentCommandRoute({
      agentId: selectedAgentId,
      threadId: agent.threadId,
      command: {
        name: commandName,
      },
    })
      .then((result) => {
        if (result.domainProjection) {
          agent.applyDomainProjection(result.domainProjection);
        }
      })
      .catch(() => undefined);
  }, [
    agent,
    agent.threadId,
    routeHasRegisteredAgent,
    selectedAgentId,
    selectedIsHired,
    selectedLifecyclePhase,
  ]);

  if (!routeHasRegisteredAgent) {
    return null;
  }

  if (uiPreviewState) {
    const previewAgentId = routeAgentId;
    const config = getAgentConfig(previewAgentId);
    const previewOnboardingOwnerAgentId = config.onboardingOwnerAgentId;

    const isHired = uiPreviewState !== 'prehire';
    const previewLifecycleState = buildUiPreviewLifecycleState({
      agentId: previewAgentId,
      fixture: uiPreviewFixture,
      uiState: uiPreviewState,
    });
    const previewDomainProjection = buildUiPreviewDomainProjection({
      agentId: previewAgentId,
      fixture: uiPreviewFixture,
      uiState: uiPreviewState,
    });
    const previewTaskStatus =
      uiPreviewState === 'active' && uiPreviewFixture === 'managed' ? 'working' : undefined;

    return (
      <AgentDetailPage
        agentId={previewAgentId}
        agentName={config.name}
        agentDescription={config.description}
        creatorName={config.creator}
        creatorVerified={config.creatorVerified}
        rank={1}
        rating={5}
        profile={{
          agentIncome: 754,
          aum: 742_510,
          totalUsers: 5_321,
          apy: 22,
          chains: config.chains ?? ['Arbitrum'],
          protocols: config.protocols ?? [],
          tokens: config.tokens ?? ['USDC'],
        }}
        metrics={{
          iteration: 0,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          rebalanceCycles: 0,
          aumUsd: 742_510,
          apy: 22,
          lifetimePnlUsd: 0,
        }}
        fullMetrics={agent.metrics}
        initialTab={isHired ? (selectedTab ?? undefined) : undefined}
        isHired={isHired}
        isHiring={false}
        hasLoadedView
        isFiring={false}
        isSyncing={false}
        uiError={null}
        onClearUiError={() => undefined}
        onHire={
          previewOnboardingOwnerAgentId
            ? () => handleManagedOwnerNavigation(previewOnboardingOwnerAgentId)
            : () => undefined
        }
        onFire={
          previewOnboardingOwnerAgentId
            ? () => handleManagedOwnerNavigation(previewOnboardingOwnerAgentId)
            : () => undefined
        }
        onSync={() => undefined}
        onBack={handleBack}
        activeInterrupt={null}
        allowedPools={[]}
        onInterruptSubmit={() => undefined}
        taskId={undefined}
        taskStatus={previewTaskStatus}
        haltReason={undefined}
        executionError={undefined}
        delegationsBypassActive={false}
        onboardingFlow={undefined}
        transactions={[]}
        telemetry={[]}
        events={[]}
        messages={EMPTY_MESSAGES}
        lifecycleState={previewLifecycleState}
        domainProjection={previewDomainProjection}
        settings={agent.settings}
        onSendChatMessage={() => undefined}
        onSettingsChange={() => undefined}
        onSettingsSave={() => undefined}
        onManagedMandateSave={undefined}
      />
    );
  }

  return (
    <AgentDetailPage
      agentId={selectedAgentId}
      agentName={selectedConfig.name}
      agentDescription={selectedConfig.description}
      creatorName={selectedConfig.creator}
      creatorVerified={selectedConfig.creatorVerified}
      rank={1}
      rating={5}
      profile={{
        agentIncome: selectedProfile.agentIncome,
        aum: selectedProfile.aum,
        totalUsers: selectedProfile.totalUsers,
        apy: selectedProfile.apy,
        chains: selectedProfile.chains,
        protocols: selectedProfile.protocols,
        tokens: selectedProfile.tokens,
      }}
      metrics={{
        iteration: selectedMetrics.iteration,
        cyclesSinceRebalance: selectedMetrics.cyclesSinceRebalance,
        staleCycles: selectedMetrics.staleCycles,
        rebalanceCycles: selectedMetrics.rebalanceCycles,
        aumUsd: selectedMetrics.aumUsd,
        apy: selectedMetrics.apy,
        lifetimePnlUsd: selectedMetrics.lifetimePnlUsd,
      }}
      fullMetrics={selectedMetrics}
      initialTab={selectedIsHired ? (selectedTab ?? undefined) : undefined}
      isHired={selectedIsHired}
      isRestoringState={isRestoringState}
      isHiring={agent.isHiring}
      hasLoadedView={selectedHasLoadedView}
      isFiring={agent.isFiring}
      isSyncing={agent.isSyncing}
      isRunInFlight={agent.isRunInFlight}
      uiError={agent.uiError}
      onClearUiError={agent.clearUiError}
      onHire={handleHire}
      onFire={handleFire}
      onSync={agent.runSync}
      onBack={handleBack}
      activeInterrupt={agent.activeInterrupt}
      allowedPools={selectedProfile.allowedPools ?? []}
      onInterruptSubmit={agent.resolveInterrupt}
      taskId={selectedTask?.id}
      taskStatus={selectedTask?.taskStatus?.state}
      haltReason={agent.uiState.haltReason}
      executionError={agent.uiState.executionError}
      delegationsBypassActive={agent.uiState.delegationsBypassActive}
      onboardingFlow={selectedOnboardingFlow}
      transactions={agent.transactionHistory}
      telemetry={selectedActivity.telemetry}
      events={agent.events}
      messages={agent.messages}
      lifecycleState={selectedLifecycleState}
      domainProjection={agent.domainProjection}
      settings={agent.settings}
      onSendChatMessage={agent.sendChatMessage}
      onSettingsChange={agent.updateSettings}
      onSettingsSave={agent.saveSettings}
      onManagedMandateSave={handleManagedMandateSave}
    />
  );
}
