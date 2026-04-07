'use client';

import { use, type ComponentProps } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Message } from '@ag-ui/core';
import { AgentDetailPage } from '@/components/AgentDetailPage';
import { getAgentConfig, isRegisteredAgentId } from '@/config/agents';
import { useAgent } from '@/contexts/AgentContext';

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
      lastOnboardingBootstrap: {
        rootedWalletContext: {
          metadata: {
            approvedMandateEnvelope: {
              portfolioMandate: {
                approved: true,
                riskLevel: 'medium',
              },
              managedAgentMandates: [
                {
                  agentKey: 'ember-lending-primary',
                  agentType: 'ember-lending',
                  approved: true,
                  settings: {
                    network: 'arbitrum',
                    protocol: 'aave',
                    allowedCollateralAssets: ['USDC'],
                    allowedBorrowAssets: ['USDC'],
                    maxAllocationPct: 35,
                    maxLtvBps: 7000,
                    minHealthFactor: '1.25',
                  },
                },
              ],
            },
          },
        },
        mandates: [
          {
            mandate_ref: 'mandate-ember-lending-001',
            agent_id: 'ember-lending',
            mandate_summary:
              'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
          },
        ],
        reservations: [
          {
            reservation_id: 'reservation-ember-lending-001',
            purpose: 'deploy',
            control_path: 'lending.supply',
          },
        ],
        ownedUnits: [
          {
            unit_id: 'unit-ember-lending-001',
            root_asset: 'USDC',
            quantity: '10',
            reservation_id: 'reservation-ember-lending-001',
          },
        ],
      },
    } as never;
  }

  if (args.agentId === 'agent-ember-lending') {
    return {
      phase: 'active',
      mandateRef: 'mandate-ember-lending-001',
      mandateSummary:
        'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
      mandateContext: {
        network: 'arbitrum',
        protocol: 'aave',
      },
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      rootedWalletContextId: 'rwc-ember-lending-thread-001',
      lastReservationSummary:
        'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
    } as never;
  }

  return undefined;
}

export default function AgentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const agent = useAgent();
  const activeAgentId = agent.config.id;
  const routeAgentId = id;
  const routeHasRegisteredAgent = isRegisteredAgentId(routeAgentId);
  const selectedAgentId = routeHasRegisteredAgent ? routeAgentId : activeAgentId;
  const selectedConfig = getAgentConfig(selectedAgentId);
  const onboardingOwnerAgentId = selectedConfig.onboardingOwnerAgentId;
  const selectedProfile = {
    ...agent.profile,
    chains:
      agent.profile.chains && agent.profile.chains.length > 0
        ? agent.profile.chains
        : selectedConfig.chains ?? [],
    protocols:
      agent.profile.protocols && agent.profile.protocols.length > 0
        ? agent.profile.protocols
        : selectedConfig.protocols ?? [],
    tokens:
      agent.profile.tokens && agent.profile.tokens.length > 0
        ? agent.profile.tokens
        : selectedConfig.tokens ?? [],
  };

  const handleBack = () => {
    router.push('/hire-agents');
  };
  const handleManagedOwnerNavigation = (ownerAgentId: string) => {
    router.push(`/hire-agents/${ownerAgentId}`);
  };
  const handleHire = onboardingOwnerAgentId
    ? () => handleManagedOwnerNavigation(onboardingOwnerAgentId)
    : agent.runHire;
  const handleFire = onboardingOwnerAgentId
    ? () => handleManagedOwnerNavigation(onboardingOwnerAgentId)
    : agent.runFire;

  // Dev-only UI preview for screenshot-driven design work.
  // This is guarded by NODE_ENV by default so it cannot affect production behavior.
  // For local QA runs, it can be explicitly enabled via NEXT_PUBLIC_UI_PREVIEW=true.
  const uiPreviewEnabled =
    process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_UI_PREVIEW === 'true';
  const uiPreviewState =
    uiPreviewEnabled ? parseUiPreviewState(searchParams.get('__uiState')) : null;
  const requestedTab = parseAgentRouteTab(searchParams.get('tab'));
  const uiPreviewTab = uiPreviewEnabled ? parseAgentRouteTab(searchParams.get('__tab')) : null;
  const uiPreviewFixture = uiPreviewEnabled ? parseUiPreviewFixture(searchParams.get('__fixture')) : null;
  const selectedTab = requestedTab ?? uiPreviewTab;

  if (uiPreviewState) {
    const previewAgentId = routeHasRegisteredAgent ? routeAgentId : selectedAgentId;
    const config = getAgentConfig(previewAgentId);
    const previewOnboardingOwnerAgentId = config.onboardingOwnerAgentId;

    const isHired = uiPreviewState !== 'prehire';
    const previewLifecycleState = buildUiPreviewLifecycleState({
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
          chains: ['Arbitrum'],
          protocols: ['Camelot'],
          tokens: ['USDC', 'ARB', 'WETH'],
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
        messageSnapshotEpoch={0}
        lifecycleState={previewLifecycleState}
        settings={agent.settings}
        onSendChatMessage={() => undefined}
        onSettingsChange={() => undefined}
        onSettingsSave={() => undefined}
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
        iteration: agent.metrics.iteration,
        cyclesSinceRebalance: agent.metrics.cyclesSinceRebalance,
        staleCycles: agent.metrics.staleCycles,
        rebalanceCycles: agent.metrics.rebalanceCycles,
        aumUsd: agent.metrics.aumUsd,
        apy: agent.metrics.apy,
        lifetimePnlUsd: agent.metrics.lifetimePnlUsd,
      }}
      fullMetrics={agent.metrics}
      initialTab={agent.isHired ? (selectedTab ?? undefined) : undefined}
      isHired={agent.isHired}
      isHiring={agent.isHiring}
      hasLoadedView={agent.hasLoadedView}
      isFiring={agent.isFiring}
      isSyncing={agent.isSyncing}
      uiError={agent.uiError}
      onClearUiError={agent.clearUiError}
      onHire={handleHire}
      onFire={handleFire}
      onSync={agent.runSync}
      onBack={handleBack}
      activeInterrupt={agent.activeInterrupt}
      allowedPools={selectedProfile.allowedPools ?? []}
      onInterruptSubmit={agent.resolveInterrupt}
      taskId={agent.uiState.task?.id}
      taskStatus={agent.uiState.task?.taskStatus?.state}
      haltReason={agent.uiState.haltReason}
      executionError={agent.uiState.executionError}
      delegationsBypassActive={agent.uiState.delegationsBypassActive}
      onboardingFlow={agent.uiState.onboardingFlow}
      transactions={agent.transactionHistory}
      telemetry={agent.activity.telemetry}
      events={agent.events}
      messages={agent.messages}
      messageSnapshotEpoch={agent.messageSnapshotEpoch}
      lifecycleState={agent.uiState.lifecycle}
      settings={agent.settings}
      onSendChatMessage={agent.sendChatMessage}
      onSettingsChange={agent.updateSettings}
      onSettingsSave={agent.saveSettings}
    />
  );
}
