'use client';

import { useState } from 'react';
import { CopilotPopup, CopilotKitCSSProperties } from '@copilotkit/react-ui';
import { AppSidebar, type AgentActivity } from '../components/AppSidebar';
import { HireAgentsPage, type Agent, type FeaturedAgent } from '../components/HireAgentsPage';
import {
  AgentDetailPage,
  type Transaction,
  type TelemetryItem,
} from '../components/AgentDetailPage';
import { useAgentConnection } from '../hooks/useAgentConnection';
import { DEFAULT_AGENT_ID, getAllAgents } from '../config/agents';

export default function HomePage() {
  const themeColor = '#fd6731';
  const [currentPage, setCurrentPage] = useState<'chat' | 'hire' | 'acquire' | 'leaderboard'>(
    'hire',
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Connect to the configured agent
  const agent = useAgentConnection(DEFAULT_AGENT_ID);

  // Get all registered agents for the listing
  const registeredAgents = getAllAgents();

  // Build the agent list with live data from the connected agent
  const agentList: Agent[] = registeredAgents.map((agentConfig) => {
    // If this is the connected agent, use live data
    if (agentConfig.id === DEFAULT_AGENT_ID) {
      return {
        id: agentConfig.id,
        rank: 1,
        name: agentConfig.name,
        creator: agentConfig.creator,
        creatorVerified: agentConfig.creatorVerified,
        rating: 5, // Could come from state if available
        weeklyIncome: agent.profile.agentIncome ?? 0,
        apy: agent.profile.apy ?? 0,
        users: agent.profile.totalUsers ?? 0,
        aum: agent.profile.aum ?? 0,
        points: agent.metrics.iteration ?? 0,
        avatar: agentConfig.avatar,
        avatarBg: agentConfig.avatarBg,
        status: agent.isHired ? 'hired' : 'for_hire',
        isActive: agent.isActive,
      };
    }

    // For other agents, show default/unavailable state
    return {
      id: agentConfig.id,
      rank: 0,
      name: agentConfig.name,
      creator: agentConfig.creator,
      creatorVerified: agentConfig.creatorVerified,
      rating: 0,
      weeklyIncome: 0,
      apy: 0,
      users: 0,
      aum: 0,
      points: 0,
      avatar: agentConfig.avatar,
      avatarBg: agentConfig.avatarBg,
      status: 'unavailable' as const,
      isActive: false,
    };
  });

  // Build featured agents from connected agent
  const featuredAgents: FeaturedAgent[] = [
    {
      id: agent.config.id,
      rank: 1,
      name: agent.config.name,
      creator: agent.config.creator,
      rating: 5,
      users: agent.profile.totalUsers ?? 0,
      aum: agent.profile.aum ?? 0,
      apy: agent.profile.apy ?? 0,
      weeklyIncome: agent.profile.agentIncome ?? 0,
      avatar: agent.config.avatar,
      avatarBg: agent.config.avatarBg,
    },
  ];

  // Build agent activity from real state
  const activeAgents: AgentActivity[] = agent.isActive
    ? [
        {
          id: agent.config.id,
          name: agent.config.name,
          subtitle: agent.view.task?.id
            ? `Task: ${agent.view.task.id.slice(0, 8)}...`
            : `Command: ${agent.view.command}`,
          status: 'active',
        },
      ]
    : [];

  const blockedAgents: AgentActivity[] =
    agent.view.haltReason || agent.view.executionError || agent.activeInterrupt
      ? [
          {
            id: `${agent.config.id}-blocked`,
            name: agent.config.name,
            subtitle: agent.activeInterrupt
              ? 'Set up agent'
              : agent.view.haltReason ?? agent.view.executionError ?? 'Blocked',
            status: 'blocked',
          },
        ]
      : [];

  const completedAgents: AgentActivity[] = [];

  // Navigation handlers
  const handleNavigate = (page: 'chat' | 'hire' | 'acquire' | 'leaderboard') => {
    if (page === 'chat') return;
    setCurrentPage(page);
    setSelectedAgentId(null);
  };

  const handleHireAgent = (agentId: string) => {
    if (agentId === agent.config.id) {
      agent.runHire();
    }
  };

  const handleViewAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
  };

  const handleBackToList = () => {
    setSelectedAgentId(null);
  };

  // Map transaction history to the expected format
  const mappedTransactions: Transaction[] = agent.transactionHistory.map((tx) => ({
    cycle: tx.cycle,
    action: tx.action,
    txHash: tx.txHash,
    status: tx.status,
    reason: tx.reason,
    timestamp: tx.timestamp,
  }));

  // Map telemetry to the expected format
  const mappedTelemetry: TelemetryItem[] = (agent.activity.telemetry ?? []).map((t) => ({
    cycle: t.cycle,
    action: t.action,
    reason: t.reason,
    midPrice: t.midPrice,
    timestamp: t.timestamp,
  }));

  // Render the appropriate content
  const renderMainContent = () => {
    // Agent Detail Page - only show for the connected agent
    if (selectedAgentId === agent.config.id && currentPage === 'hire') {
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
          onBack={handleBackToList}
          // Interrupt handling
          activeInterrupt={agent.activeInterrupt}
          allowedPools={agent.profile.allowedPools ?? []}
          onInterruptSubmit={agent.resolveInterrupt}
          // Task state
          taskId={agent.view.task?.id}
          taskStatus={agent.view.task?.taskStatus?.state}
          haltReason={agent.view.haltReason}
          executionError={agent.view.executionError}
          // Transaction history and telemetry
          transactions={mappedTransactions}
          telemetry={mappedTelemetry}
          // Settings
          allocationAmount={agent.settings.amount}
          onAllocationChange={agent.updateSettings}
        />
      );
    }

    // Hire Agents List
    if (currentPage === 'hire') {
      return (
        <HireAgentsPage
          agents={agentList}
          featuredAgents={featuredAgents}
          onHireAgent={handleHireAgent}
          onViewAgent={handleViewAgent}
        />
      );
    }

    // Acquire (Coming Soon)
    if (currentPage === 'acquire') {
      return (
        <div className="flex-1 h-full flex items-center justify-center text-gray-500">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white mb-2">Acquire Agents</h2>
            <p>Coming soon...</p>
          </div>
        </div>
      );
    }

    // Leaderboard (Coming Soon)
    if (currentPage === 'leaderboard') {
      return (
        <div className="flex-1 h-full flex items-center justify-center text-gray-500">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white mb-2">Leaderboard</h2>
            <p>Coming soon...</p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <AppSidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        blockedAgents={blockedAgents}
        activeAgents={activeAgents}
        completedAgents={completedAgents}
      />

      <main
        className="flex-1 overflow-hidden bg-[#121212]"
        style={{ '--copilot-kit-primary-color': themeColor } as CopilotKitCSSProperties}
      >
        {renderMainContent()}
      </main>

      {/* Hidden CopilotPopup - needed for AG-UI interrupt mechanism */}
      <CopilotPopup defaultOpen={false} clickOutsideToClose={false} />
    </>
  );
}
