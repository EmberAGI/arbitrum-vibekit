'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { AgentDetailPage } from '@/components/AgentDetailPage';
import { PolymarketAgentDetailPage } from '@/components/polymarket/PolymarketAgentDetailPage';
import { useAgent } from '@/contexts/AgentContext';
// COMMENTED OUT: Web polling replaced with agent's internal cron scheduler (like Pendle)
// import { usePolymarketPolling } from '@/hooks/usePolymarketPolling';

export default function AgentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const agent = useAgent();
  const activeAgentId = agent.config.id;
  const routeAgentId = id;
  const selectedAgentId = activeAgentId === routeAgentId ? routeAgentId : activeAgentId;

  // Note: Agent context syncing is handled by the layout.tsx in this folder
  // The layout ensures the agent is loaded BEFORE this page renders

  // COMMENTED OUT: Web polling replaced with agent's internal cron scheduler (like Pendle)
  // The agent now handles its own polling via node-cron after the first cycle
  // This prevents race conditions with approval updates and matches Pendle's architecture
  // // Extract Polymarket-specific state for polling (safe type cast)
  // const polymarketLifecycleState = (agent.view as { lifecycleState?: string }).lifecycleState;
  //
  // // Get poll interval from environment variable (Next.js requires NEXT_PUBLIC_ prefix for client-side)
  // // Falls back to agent config, then to 60 seconds default
  // const envPollInterval = process.env.NEXT_PUBLIC_POLY_POLL_INTERVAL_MS
  //   ? parseInt(process.env.NEXT_PUBLIC_POLY_POLL_INTERVAL_MS, 10)
  //   : undefined;
  // const configPollInterval = (agent.view as { config?: { pollIntervalMs?: number } }).config
  //   ?.pollIntervalMs;
  // const polymarketPollInterval = envPollInterval ?? configPollInterval ?? 60000;
  //
  // // Frontend-triggered polling for Polymarket agent
  // // Called unconditionally at top level to follow React hooks rules
  // // The hook internally checks if enabled and if lifecycleState is 'running'
  // usePolymarketPolling(
  //   id === 'agent-polymarket',
  //   polymarketLifecycleState,
  //   agent.runCommand,
  //   polymarketPollInterval,
  // );

  const handleBack = () => {
    router.push('/hire-agents');
  };

  // Render Polymarket-specific page for agent-polymarket
  // Use the URL parameter 'id' as the source of truth
  if (id === 'agent-polymarket') {
    // Extract Polymarket-specific state from agent.view
    const polymarketView = agent.view as unknown as {
      lifecycleState?: 'running' | 'stopped' | 'waiting-funds' | 'disabled';
      portfolioValueUsd?: number;
      approvalStatus?: {
        needsApproval: boolean;
        usdcApproved: boolean;
        ctfApproved: boolean;
        usdcAllowance?: number;
        polBalance: number;
        usdcBalance: number;
      };
      needsApprovalAmountInput?: boolean;
      requestedApprovalAmount?: string;
      needsUsdcPermitSignature?: boolean;
      usdcPermitTypedData?: {
        domain: {
          name: string;
          version: string;
          chainId: number;
          verifyingContract: string;
        };
        types: {
          Permit: Array<{ name: string; type: string }>;
        };
        value: {
          owner: string;
          spender: string;
          value: string;
          nonce: string;
          deadline: number;
        };
      };
      needsCtfApprovalTransaction?: boolean;
      ctfApprovalTransaction?: {
        to: string;
        data: string;
        description: string;
        gasLimit?: number;
      };
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
      crossMarketOpportunities?: Array<{
        relationship: {
          type: 'IMPLIES' | 'REQUIRES' | 'MUTUAL_EXCLUSION' | 'EQUIVALENCE';
          parentMarket: {
            id: string;
            title: string;
            yesPrice: number;
          };
          childMarket: {
            id: string;
            title: string;
            yesPrice: number;
          };
          confidence?: 'high' | 'medium' | 'low';
          reasoning?: string;
        };
        violation: {
          type: 'PRICE_INVERSION' | 'SUM_EXCEEDS_ONE';
          description: string;
          severity: number;
        };
        trades: {
          sellMarket: {
            marketId: string;
            outcome: 'yes' | 'no';
            price: number;
          };
          buyMarket: {
            marketId: string;
            outcome: 'yes' | 'no';
            price: number;
          };
        };
        expectedProfitPerShare: number;
        timestamp: string;
      }>;
      detectedRelationships?: Array<{
        id: string;
        type: 'IMPLIES' | 'REQUIRES' | 'MUTUAL_EXCLUSION' | 'EQUIVALENCE';
        parentMarket: {
          id: string;
          title: string;
          yesPrice: number;
        };
        childMarket: {
          id: string;
          title: string;
          yesPrice: number;
        };
        detectedAt: string;
        confidence?: 'high' | 'medium' | 'low';
        reasoning?: string;
      }>;
      transactionHistory?: Array<{
        id: string;
        cycle: number;
        action: string;
        marketId: string;
        marketTitle: string;
        shares: number;
        price: number;
        totalCost: number;
        status: string;
        timestamp: string;
        orderId?: string;
        error?: string;
      }>;
      userPositions?: Array<{
        marketId: string;
        marketTitle: string;
        outcomeId: 'yes' | 'no';
        outcomeName?: string;
        tokenId: string;
        size: string;
        currentPrice?: string;
        avgPrice?: string;
        pnl?: string;
        pnlPercent?: string;
      }>;
      tradingHistory?: Array<{
        id: string;
        market: string;
        marketTitle: string;
        side: string;
        outcome: string;
        size: string;
        price: string;
        matchTime: string;
        transactionHash?: string;
        usdcSize?: string;
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

    // Debug: Log polymarket view data
    console.log('[PAGE] polymarketView data:');
    console.log(
      '[PAGE] - userPositions:',
      polymarketView.userPositions?.length ?? 0,
      polymarketView.userPositions,
    );
    console.log(
      '[PAGE] - tradingHistory:',
      polymarketView.tradingHistory?.length ?? 0,
      polymarketView.tradingHistory,
    );
    console.log('[PAGE] - full view keys:', Object.keys(polymarketView));

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
        metrics={
          polymarketView.metrics ?? {
            iteration: 0,
            totalPnl: 0,
            realizedPnl: 0,
            unrealizedPnl: 0,
            activePositions: 0,
            opportunitiesFound: 0,
            opportunitiesExecuted: 0,
            tradesExecuted: 0,
            tradesFailed: 0,
          }
        }
        config={
          polymarketView.config ?? {
            minSpreadThreshold: 0.02,
            maxPositionSizeUsd: 100,
            portfolioRiskPct: 3,
            pollIntervalMs: 30000,
            maxTotalExposureUsd: 500,
          }
        }
        portfolioValueUsd={polymarketView.portfolioValueUsd ?? 0}
        opportunities={polymarketView.opportunities ?? []}
        crossMarketOpportunities={polymarketView.crossMarketOpportunities ?? []}
        detectedRelationships={polymarketView.detectedRelationships ?? []}
        transactionHistory={polymarketView.transactionHistory ?? []}
        positions={polymarketView.userPositions ?? []}
        tradingHistory={polymarketView.tradingHistory ?? []}
        isHired={agent.isHired}
        isHiring={agent.isHiring}
        isFiring={agent.isFiring}
        isSyncing={agent.isSyncing}
        currentCommand={agent.view.command}
        onHire={agent.runHire}
        onFire={agent.runFire}
        onSync={agent.runSync}
        onBack={handleBack}
        approvalStatus={polymarketView.approvalStatus}
        needsApprovalAmountInput={polymarketView.needsApprovalAmountInput}
        requestedApprovalAmount={polymarketView.requestedApprovalAmount}
        needsUsdcPermitSignature={polymarketView.needsUsdcPermitSignature}
        usdcPermitTypedData={polymarketView.usdcPermitTypedData}
        needsCtfApprovalTransaction={polymarketView.needsCtfApprovalTransaction}
        ctfApprovalTransaction={polymarketView.ctfApprovalTransaction}
        onApprovalAmountSubmit={(amount: string, userWalletAddress: string) => {
          console.log('[APPROVAL FLOW] Page callback received amount:', amount);
          console.log('[APPROVAL FLOW] Page callback received user wallet:', userWalletAddress);
          console.log('[APPROVAL FLOW] Calling resolveInterrupt with amount and wallet');
          // Pass data directly in interrupt payload - backend will merge it into state
          agent.resolveInterrupt({
            requestedApprovalAmount: amount,
            userWalletAddress: userWalletAddress as `0x${string}`,
          });
          console.log('[APPROVAL FLOW] resolveInterrupt called');
        }}
        onUsdcPermitSign={async (signature: {
          v: number;
          r: string;
          s: string;
          deadline: number;
        }) => {
          console.log('[APPROVAL FLOW] Page callback received permit signature:', signature);
          console.log('[APPROVAL FLOW] Calling resolveInterrupt with signature');
          // Pass signature directly in interrupt payload
          agent.resolveInterrupt({ usdcPermitSignature: signature });
          console.log('[APPROVAL FLOW] resolveInterrupt called');
        }}
        onCtfApprovalSubmit={(txHash: string) => {
          console.log('[APPROVAL FLOW] Page callback received CTF tx hash:', txHash);
          console.log('[APPROVAL FLOW] Calling resolveInterrupt with txHash');
          // Pass txHash directly in interrupt payload
          agent.resolveInterrupt({ ctfApprovalTxHash: txHash });
          console.log('[APPROVAL FLOW] resolveInterrupt called');
        }}
        onUpdateApproval={(amount: string, userWalletAddress: string) => {
          console.log('[SETTINGS] Update approval requested:', amount, userWalletAddress);

          // Use CopilotKit's runCommand instead of direct API calls
          // This keeps CopilotKit in sync with backend state and prevents conflicts
          // The interrupt mechanism (useLangGraphInterruptCustomUI) handles permit signing UI
          agent.runCommand('updateApproval', {
            approvalAmount: amount,
            userWalletAddress,
          });
        }}
        onUpdateConfig={(configUpdate: Partial<typeof polymarketView.config>) => {
          console.log('[SETTINGS] Config update requested:', configUpdate);

          // Update config via view state
          agent.setStateFromApiResponse({
            ...polymarketView,
            config: {
              ...polymarketView.config,
              ...configUpdate,
            },
          } as any);

          // Sync to apply changes
          setTimeout(() => {
            agent.runSync();
          }, 300);
        }}
      />
    );
  }

  // Render CLMM-specific page for agent-clmm
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
