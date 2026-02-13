'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { AgentDetailPage } from '@/components/AgentDetailPage';
import { useAgent } from '@/contexts/AgentContext';

export default function AgentDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const agent = useAgent();
  const activeAgentId = agent.config.id;
  const routeAgentId = id;
  const selectedAgentId = activeAgentId === routeAgentId ? routeAgentId : activeAgentId;

  const handleBack = () => {
    router.push('/hire-agents');
  };

  return (
    <AgentDetailPage
      agentId={selectedAgentId}
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
        rebalanceCycles: agent.metrics.rebalanceCycles,
        aumUsd: agent.metrics.aumUsd,
        apy: agent.metrics.apy,
        lifetimePnlUsd: agent.metrics.lifetimePnlUsd,
      }}
      fullMetrics={agent.metrics}
      isHired={agent.isHired}
      isHiring={agent.isHiring}
      hasLoadedView={agent.hasLoadedView}
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
