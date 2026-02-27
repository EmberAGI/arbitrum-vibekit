'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AgentDetailPage } from '@/components/AgentDetailPage';
import { getAgentConfig, isRegisteredAgentId } from '@/config/agents';
import { useAgent } from '@/contexts/AgentContext';
import type { OnboardingState } from '@/types/agent';

type UiPreviewState = 'prehire' | 'onboarding' | 'active';
type UiPreviewTab = 'blockers' | 'metrics' | 'transactions' | 'chat';

function parseUiPreviewState(value: string | null): UiPreviewState | null {
  if (value === 'prehire' || value === 'onboarding' || value === 'active') return value;
  return null;
}

function parseUiPreviewTab(value: string | null): UiPreviewTab | null {
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

  // Dev-only UI preview for screenshot-driven design work.
  // This is guarded by NODE_ENV by default so it cannot affect production behavior.
  // For local QA runs, it can be explicitly enabled via NEXT_PUBLIC_UI_PREVIEW=true.
  const uiPreviewEnabled =
    process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_UI_PREVIEW === 'true';
  const uiPreviewState =
    uiPreviewEnabled ? parseUiPreviewState(searchParams.get('__uiState')) : null;
  const uiPreviewTab = uiPreviewEnabled ? parseUiPreviewTab(searchParams.get('__tab')) : null;

  if (uiPreviewState) {
    const previewAgentId = routeHasRegisteredAgent ? routeAgentId : selectedAgentId;
    const config = getAgentConfig(previewAgentId);

    const isHired = uiPreviewState !== 'prehire';
    const onboarding: OnboardingState | undefined =
      uiPreviewState === 'onboarding' ? { step: 2, key: 'setup-agent' } : undefined;

    const currentCommand =
      uiPreviewState === 'prehire' ? undefined : uiPreviewState === 'onboarding' ? 'hire' : 'cycle';

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
        initialTab={isHired ? (uiPreviewTab ?? undefined) : undefined}
        isHired={isHired}
        isHiring={false}
        hasLoadedView
        isFiring={false}
        isSyncing={false}
        currentCommand={currentCommand}
        uiError={null}
        onClearUiError={() => undefined}
        onHire={() => undefined}
        onFire={() => undefined}
        onSync={() => undefined}
        onBack={handleBack}
        activeInterrupt={null}
        allowedPools={[]}
        onInterruptSubmit={() => undefined}
        taskId={undefined}
        taskStatus={undefined}
        haltReason={undefined}
        executionError={undefined}
        delegationsBypassActive={false}
        onboarding={onboarding}
        onboardingFlow={undefined}
        setupComplete={false}
        transactions={[]}
        telemetry={[]}
        events={[]}
        settings={agent.settings}
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
      initialTab={agent.isHired ? (uiPreviewTab ?? undefined) : undefined}
      isHired={agent.isHired}
      isHiring={agent.isHiring}
      hasLoadedView={agent.hasLoadedView}
        isFiring={agent.isFiring}
        isSyncing={agent.isSyncing}
        currentCommand={agent.view.command}
        uiError={agent.uiError}
        onClearUiError={agent.clearUiError}
        onHire={agent.runHire}
        onFire={agent.runFire}
        onSync={agent.runSync}
      onBack={handleBack}
      activeInterrupt={agent.activeInterrupt}
      allowedPools={selectedProfile.allowedPools ?? []}
      onInterruptSubmit={agent.resolveInterrupt}
      taskId={agent.view.task?.id}
      taskStatus={agent.view.task?.taskStatus?.state}
      haltReason={agent.view.haltReason}
      executionError={agent.view.executionError}
      delegationsBypassActive={agent.view.delegationsBypassActive}
      onboarding={agent.view.onboarding}
      onboardingFlow={agent.view.onboardingFlow}
      setupComplete={agent.view.setupComplete}
      transactions={agent.transactionHistory}
      telemetry={agent.activity.telemetry}
      events={agent.events}
      settings={agent.settings}
      onSettingsChange={agent.updateSettings}
      onSettingsSave={agent.saveSettings}
    />
  );
}
