'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { AgentDetailPage } from '@/components/AgentDetailPage';
import { PolymarketAgentDetailPage } from '@/components/polymarket/PolymarketAgentDetailPage';
import { useAgent } from '@/contexts/AgentContext';

export default function AgentDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const agent = useAgent();

  // Note: Agent context syncing is handled by the layout.tsx in this folder
  // The layout ensures the agent is loaded BEFORE this page renders

  const handleBack = () => {
    router.push('/hire-agents');
  };

  // Render Polymarket-specific page for agent-polymarket
  // Use the URL parameter 'id' as the source of truth
  if (id === 'agent-polymarket') {
    // Extract Polymarket-specific state from agent.view
    const polymarketView = agent.view as unknown as {
      portfolioValueUsd?: number;
      opportunities?: Array<{
        marketId: string;
        marketTitle: string;
        yesTokenId: string;
        noTokenId: string;
        yesPrice: number;
        noPrice: number;
        spread: number;
        profitPotential: number;
        timestamp: string;
      }>;
      config?: {
        minSpreadThreshold: number;
        maxPositionSizeUsd: number;
        portfolioRiskPct: number;
        pollIntervalMs: number;
        maxTotalExposureUsd: number;
      };
      metrics?: {
        iteration: number;
        lastPoll?: string;
        totalPnl: number;
        realizedPnl: number;
        unrealizedPnl: number;
        activePositions: number;
        opportunitiesFound: number;
        opportunitiesExecuted: number;
        tradesExecuted: number;
        tradesFailed: number;
      };
    };

    return (
      <PolymarketAgentDetailPage
        agentId={agent.config.id}
        agentName={agent.config.name}
        agentDescription={agent.config.description}
        creatorName={agent.config.creator}
        creatorVerified={agent.config.creatorVerified}
        avatar={agent.config.avatar}
        avatarBg={agent.config.avatarBg}
        rank={2}
        rating={5}
        profile={{
          agentIncome: agent.profile.agentIncome,
          aum: agent.profile.aum,
          totalUsers: agent.profile.totalUsers,
          apy: agent.profile.apy,
          chains: ['Polygon'],
          protocols: ['Polymarket'],
          tokens: ['USDC'],
        }}
        metrics={polymarketView.metrics ?? {
          iteration: 0,
          totalPnl: 0,
          realizedPnl: 0,
          unrealizedPnl: 0,
          activePositions: 0,
          opportunitiesFound: 0,
          opportunitiesExecuted: 0,
          tradesExecuted: 0,
          tradesFailed: 0,
        }}
        config={polymarketView.config ?? {
          minSpreadThreshold: 0.02,
          maxPositionSizeUsd: 100,
          portfolioRiskPct: 3,
          pollIntervalMs: 30000,
          maxTotalExposureUsd: 500,
        }}
        portfolioValueUsd={polymarketView.portfolioValueUsd ?? 0}
        opportunities={polymarketView.opportunities ?? []}
        isHired={agent.isHired}
        isHiring={agent.isHiring}
        isFiring={agent.isFiring}
        isSyncing={agent.isSyncing}
        currentCommand={agent.view.command}
        onHire={agent.runHire}
        onFire={agent.runFire}
        onSync={agent.runSync}
        onBack={handleBack}
      />
    );
  }

  // Render CLMM-specific page for agent-clmm
  return (
    <AgentDetailPage
      agentId={agent.config.id}
      agentName={agent.config.name}
      agentDescription={agent.config.description}
      creatorName={agent.config.creator}
      creatorVerified={agent.config.creatorVerified}
      avatar={agent.config.avatar}
      avatarBg={agent.config.avatarBg}
      rank={1}
      rating={5}
      profile={{
        agentIncome: agent.profile.agentIncome,
        aum: agent.profile.aum,
        totalUsers: agent.profile.totalUsers,
        apy: agent.profile.apy,
        chains: agent.profile.chains ?? [],
        protocols: agent.profile.protocols ?? [],
        tokens: agent.profile.tokens ?? [],
      }}
      metrics={{
        iteration: agent.metrics.iteration,
        cyclesSinceRebalance: agent.metrics.cyclesSinceRebalance,
        staleCycles: agent.metrics.staleCycles,
      }}
      fullMetrics={agent.metrics}
      isHired={agent.isHired}
      isHiring={agent.isHiring}
      isFiring={agent.isFiring}
      isSyncing={agent.isSyncing}
      currentCommand={agent.view.command}
      onHire={agent.runHire}
      onFire={agent.runFire}
      onSync={agent.runSync}
      onBack={handleBack}
      activeInterrupt={agent.activeInterrupt}
      allowedPools={agent.profile.allowedPools ?? []}
      onInterruptSubmit={agent.resolveInterrupt}
      taskId={agent.view.task?.id}
      taskStatus={agent.view.task?.taskStatus?.state}
      haltReason={agent.view.haltReason}
      executionError={agent.view.executionError}
      delegationsBypassActive={agent.view.delegationsBypassActive}
      onboarding={agent.view.onboarding}
      transactions={agent.transactionHistory}
      telemetry={agent.activity.telemetry}
      events={agent.events}
      settings={agent.settings}
      onSettingsChange={agent.updateSettings}
    />
  );
}
