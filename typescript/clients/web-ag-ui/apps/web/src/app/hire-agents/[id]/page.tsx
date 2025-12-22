'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import {
  AgentDetailPage,
  type Transaction,
  type TelemetryItem,
} from '@/components/AgentDetailPage';
import { useAgentConnection } from '@/hooks/useAgentConnection';
import { DEFAULT_AGENT_ID } from '@/config/agents';

export default function AgentDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const agent = useAgentConnection(DEFAULT_AGENT_ID);

  const handleBack = () => {
    router.push('/hire-agents');
  };

  const mappedTransactions: Transaction[] = agent.transactionHistory.map((tx) => ({
    cycle: tx.cycle,
    action: tx.action,
    txHash: tx.txHash,
    status: tx.status,
    reason: tx.reason,
    timestamp: tx.timestamp,
  }));

  const mappedTelemetry: TelemetryItem[] = (agent.activity.telemetry ?? []).map((t) => ({
    cycle: t.cycle,
    action: t.action,
    reason: t.reason,
    midPrice: t.midPrice,
    timestamp: t.timestamp,
  }));

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
      isHired={agent.isHired}
      isHiring={agent.isHiring}
      isFiring={agent.isFiring}
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
      transactions={mappedTransactions}
      telemetry={mappedTelemetry}
      allocationAmount={agent.settings.amount}
      onAllocationChange={agent.updateSettings}
    />
  );
}
