'use client';

import { ChevronRight, Check, RefreshCw, Star } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { hexToSignature, createPublicClient, http, formatUnits } from 'viem';
import { polygon } from 'viem/chains';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { PolymarketOpportunityCard, type ArbitrageOpportunity } from './PolymarketOpportunityCard';
import { PolymarketMetrics, type PolymarketAgentMetrics, type PolymarketStrategyConfig } from './PolymarketMetrics';
import { CrossMarketOpportunityCard } from './CrossMarketOpportunityCard';
import { RelationshipsTable } from './RelationshipsTable';
import type { AgentProfile } from '@/types/agent';

interface CrossMarketOpportunity {
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
}

interface MarketRelationship {
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
}

interface Transaction {
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
}

interface ApprovalStatus {
  ctfApproved: boolean;
  usdcApproved: boolean;
  polBalance: number;
  usdcBalance: number;
  usdcAllowance?: number;
  needsApproval: boolean;
}

export interface UserPosition {
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
}

export interface TradingHistoryItem {
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
}

interface EIP712TypedData {
  domain: {
    name: string;
    version: string;
    chainId?: number;
    salt?: string;
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
}

interface ApprovalTransaction {
  to: string;
  data: string;
  description: string;
  gasLimit?: number;
}

interface PolymarketAgentDetailPageProps {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  creatorName?: string;
  creatorVerified?: boolean;
  rank?: number;
  rating?: number;
  avatar?: string;
  avatarBg?: string;
  profile: AgentProfile;
  metrics: PolymarketAgentMetrics;
  config: PolymarketStrategyConfig;
  portfolioValueUsd: number;
  opportunities: ArbitrageOpportunity[];
  crossMarketOpportunities: CrossMarketOpportunity[];
  detectedRelationships: MarketRelationship[];
  transactionHistory: Transaction[];
  isHired: boolean;
  isHiring: boolean;
  isFiring?: boolean;
  isSyncing?: boolean;
  currentCommand?: string;
  onHire: () => void;
  onFire: () => void;
  onSync: () => void;
  onBack: () => void;

  // Approval flow props
  approvalStatus?: ApprovalStatus;
  needsApprovalAmountInput?: boolean;
  requestedApprovalAmount?: string;
  needsUsdcPermitSignature?: boolean;
  usdcPermitTypedData?: EIP712TypedData;
  needsCtfApprovalTransaction?: boolean;
  ctfApprovalTransaction?: ApprovalTransaction;
  onApprovalAmountSubmit?: (amount: string, userWalletAddress: string) => void;
  onUsdcPermitSign?: (signature: { v: number; r: string; s: string; deadline: number }) => void;
  onCtfApprovalSubmit?: (txHash: string) => void;

  // Positions and trading history
  positions?: UserPosition[];
  tradingHistory?: TradingHistoryItem[];

  // Settings update callbacks
  onUpdateApproval?: (amount: string, userWalletAddress: string) => void;
  onUpdateConfig?: (config: Partial<PolymarketStrategyConfig>) => void;
}

type TabType = 'approvals' | 'opportunities' | 'cross-market' | 'relationships' | 'positions' | 'history' | 'metrics' | 'settings';

const DEFAULT_AVATAR = '🎯';
const DEFAULT_AVATAR_BG = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';

export function PolymarketAgentDetailPage({
  agentName,
  agentDescription,
  creatorName,
  creatorVerified,
  rank,
  rating,
  avatar = DEFAULT_AVATAR,
  avatarBg = DEFAULT_AVATAR_BG,
  profile,
  metrics,
  config,
  portfolioValueUsd,
  opportunities,
  crossMarketOpportunities,
  detectedRelationships,
  transactionHistory,
  isHired,
  isHiring,
  isFiring,
  isSyncing,
  currentCommand,
  onHire,
  onFire,
  onSync,
  onBack,
  // Approval flow props
  approvalStatus,
  needsApprovalAmountInput,
  requestedApprovalAmount,
  needsUsdcPermitSignature,
  usdcPermitTypedData,
  needsCtfApprovalTransaction,
  ctfApprovalTransaction,
  onApprovalAmountSubmit,
  onUsdcPermitSign,
  onCtfApprovalSubmit,
  // Positions and trading history
  positions = [],
  tradingHistory = [],
  // Settings update callbacks
  onUpdateApproval,
  onUpdateConfig,
}: PolymarketAgentDetailPageProps) {
  // Debug: Log received positions and trading history
  console.log('[UI] PolymarketAgentDetailPage received:');
  console.log('[UI] - positions:', positions?.length ?? 0, positions);
  console.log('[UI] - tradingHistory:', tradingHistory?.length ?? 0, tradingHistory);

  // Show approvals tab if any approval step is active
  const needsApprovals = needsApprovalAmountInput || needsUsdcPermitSignature || needsCtfApprovalTransaction;
  const [activeTab, setActiveTab] = useState<TabType>(needsApprovals ? 'approvals' : isHired ? 'opportunities' : 'metrics');

  // Track previous approval states to detect transitions
  const prevNeedsUsdcPermitRef = useRef(needsUsdcPermitSignature);
  const prevNeedsCtfApprovalRef = useRef(needsCtfApprovalTransaction);

  // Auto-switch to approvals tab when permit signing becomes required (e.g., from Settings update)
  useEffect(() => {
    const usdcPermitJustRequired = needsUsdcPermitSignature && !prevNeedsUsdcPermitRef.current;
    const ctfApprovalJustRequired = needsCtfApprovalTransaction && !prevNeedsCtfApprovalRef.current;

    if (usdcPermitJustRequired || ctfApprovalJustRequired) {
      // Use a microtask to avoid the cascading render warning
      queueMicrotask(() => setActiveTab('approvals'));
    }

    prevNeedsUsdcPermitRef.current = needsUsdcPermitSignature;
    prevNeedsCtfApprovalRef.current = needsCtfApprovalTransaction;
  }, [needsUsdcPermitSignature, needsCtfApprovalTransaction]);

  // Wallet client for signing permits and transactions
  const { walletClient, chainId, switchChain } = usePrivyWalletClient();

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return null;
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${value.toLocaleString()}`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatNumber = (value: number | undefined) => {
    if (value === undefined || value === null) return null;
    return value.toLocaleString();
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || value === null) return null;
    return `${value.toFixed(0)}%`;
  };

  const renderStars = (ratingValue: number) => {
    const stars = [];
    const fullStars = Math.floor(ratingValue);
    const hasHalfStar = ratingValue % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<Star key={i} className="w-4 h-4 fill-yellow-400/50 text-yellow-400" />);
      } else {
        stars.push(<Star key={i} className="w-4 h-4 text-gray-600" />);
      }
    }
    return stars;
  };

  // Render hired state layout
  if (isHired) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1200px] mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <button onClick={onBack} className="hover:text-white transition-colors">
                Agents
              </button>
              <ChevronRight className="w-4 h-4" />
              <span className="text-white">{agentName}</span>
            </div>
            {/* Sync Button */}
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </button>
          </nav>

          {/* Compact Header Card */}
          <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 mb-6">
            <div className="flex gap-6">
              {/* Agent Avatar */}
              <div
                className="w-32 h-32 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: avatarBg }}
              >
                <div className="text-6xl">{avatar}</div>
              </div>

              {/* Agent Info */}
              <div className="flex-1 min-w-0">
                {/* Top Row: Rank, Rating, Creator */}
                <div className="flex items-center gap-4 mb-2">
                  {rank !== undefined && <span className="text-gray-400 text-sm">#{rank}</span>}
                  {rating !== undefined && (
                    <div className="flex items-center gap-1">{renderStars(rating)}</div>
                  )}
                </div>

                <div className="flex items-center gap-4 mb-3">
                  {creatorName && (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#fd6731] flex items-center justify-center text-[10px] font-bold">
                        E
                      </div>
                      <span className="text-sm text-white">{creatorName}</span>
                      {creatorVerified && <span className="text-blue-400 text-xs">✓</span>}
                    </div>
                  )}
                </div>

                {/* Agent Name & Description */}
                <h1 className="text-xl font-bold text-white mb-1">{agentName}</h1>
                {agentDescription && <p className="text-gray-400 text-sm">{agentDescription}</p>}

                {/* Status & Fire Button */}
                <div className="flex items-center gap-3 mt-4">
                  <span className="px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 text-sm font-medium flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Agent is hired
                  </span>
                  {currentCommand && (
                    <span className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-gray-300 text-sm">
                      Command: {currentCommand}
                    </span>
                  )}
                  <button
                    onClick={onFire}
                    disabled={isFiring}
                    className={`px-4 py-1.5 rounded-lg text-white text-sm font-medium transition-colors ${
                      isFiring
                        ? 'bg-gray-600 cursor-wait'
                        : 'bg-[#fd6731] hover:bg-[#e55a28]'
                    }`}
                  >
                    {isFiring ? 'Firing...' : 'Fire'}
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-6 gap-4 mt-6 pt-6 border-t border-[#2a2a2a]">
              <StatBox label="Portfolio" value={formatCurrency(portfolioValueUsd)} />
              <StatBox label="Total P&L" value={formatCurrency(metrics.totalPnl)} valueColor={metrics.totalPnl >= 0 ? 'text-teal-400' : 'text-red-400'} />
              <StatBox label="Opportunities" value={metrics.opportunitiesFound.toString()} />
              <StatBox label="Executed" value={metrics.opportunitiesExecuted.toString()} valueColor="text-teal-400" />
              <StatBox label="Active Positions" value={metrics.activePositions.toString()} />
              <StatBox label="Poll Cycles" value={metrics.iteration.toString()} />
            </div>

            {/* Tags Row */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#2a2a2a]">
              <TagColumn title="Network" items={['Polygon']} />
              <TagColumn title="Protocol" items={['Polymarket']} />
              <TagColumn title="Strategy" items={['Intra-Market Arbitrage']} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-6 border-b border-[#2a2a2a] overflow-x-auto">
            {needsApprovals && (
              <TabButton
                active={activeTab === 'approvals'}
                onClick={() => setActiveTab('approvals')}
                highlight={true}
              >
                Setup Required
              </TabButton>
            )}
            <TabButton
              active={activeTab === 'opportunities'}
              onClick={() => setActiveTab('opportunities')}
              highlight={opportunities.length > 0}
            >
              Intra-Market {opportunities.length > 0 && `(${opportunities.length})`}
            </TabButton>
            <TabButton
              active={activeTab === 'cross-market'}
              onClick={() => setActiveTab('cross-market')}
              highlight={crossMarketOpportunities.length > 0}
            >
              Cross-Market {crossMarketOpportunities.length > 0 && `(${crossMarketOpportunities.length})`}
            </TabButton>
            <TabButton
              active={activeTab === 'relationships'}
              onClick={() => setActiveTab('relationships')}
            >
              Relationships {detectedRelationships.length > 0 && `(${detectedRelationships.length})`}
            </TabButton>
            <TabButton
              active={activeTab === 'positions'}
              onClick={() => setActiveTab('positions')}
              highlight={positions.length > 0}
            >
              Positions {positions.length > 0 && `(${positions.length})`}
            </TabButton>
            <TabButton
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
            >
              History {(tradingHistory.length > 0 || transactionHistory.length > 0) && `(${tradingHistory.length + transactionHistory.length})`}
            </TabButton>
            <TabButton active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')}>
              Metrics
            </TabButton>
            <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
              Settings
            </TabButton>
          </div>

          {/* Tab Content */}
          {activeTab === 'approvals' && (
            <div className="space-y-6">
              <div className="p-4 bg-purple-900/20 border border-purple-800/50 rounded-lg">
                <h3 className="text-sm font-semibold text-purple-400 mb-2">Setup Required</h3>
                <p className="text-xs text-gray-300">
                  To trade on Polymarket, the agent needs approval to spend USDC and CTF tokens on your behalf.
                  This is a one-time setup process.
                </p>
              </div>

              {/* Step 1: USDC Amount Input */}
              {needsApprovalAmountInput && (
                <div className="p-6 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center text-sm font-bold text-purple-400">
                      1
                    </div>
                    <h3 className="text-lg font-semibold text-white">Set USDC Approval Amount</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    Enter the maximum amount of USDC the agent can spend. You can always revoke this later.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      console.log('[APPROVAL FLOW] Form submitted');
                      const formData = new FormData(e.currentTarget);
                      const amount = formData.get('amount') as string;
                      const userWalletAddress = walletClient?.account?.address;
                      console.log('[APPROVAL FLOW] Form extracted amount:', amount);
                      console.log('[APPROVAL FLOW] User wallet address:', userWalletAddress);
                      console.log('[APPROVAL FLOW] Has callback?', !!onApprovalAmountSubmit);
                      if (amount && userWalletAddress && onApprovalAmountSubmit) {
                        console.log('[APPROVAL FLOW] Calling onApprovalAmountSubmit callback with wallet');
                        onApprovalAmountSubmit(amount, userWalletAddress);
                      } else {
                        console.error('[APPROVAL FLOW] Missing amount, wallet or callback', {
                          hasAmount: !!amount,
                          hasWallet: !!userWalletAddress,
                          hasCallback: !!onApprovalAmountSubmit,
                        });
                        if (!userWalletAddress) {
                          alert('Please connect your wallet first');
                        }
                      }
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label htmlFor="approval-amount" className="block text-sm font-medium text-gray-300 mb-2">
                        USDC Amount
                      </label>
                      <input
                        id="approval-amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g., 1000"
                        required
                        className="w-full px-4 py-3 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 rounded-xl font-medium bg-purple-500 hover:bg-purple-600 text-white transition-colors"
                    >
                      Continue
                    </button>
                  </form>
                </div>
              )}

              {/* Step 2: USDC Permit Signature */}
              {needsUsdcPermitSignature && usdcPermitTypedData && (
                <div className="p-6 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center text-sm font-bold text-purple-400">
                      2
                    </div>
                    <h3 className="text-lg font-semibold text-white">Sign USDC Approval</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    Sign a gasless approval message. This won&apos;t cost you any gas - the backend will submit it for you.
                  </p>
                  <div className="p-4 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-400">Amount:</span>
                      <span className="text-sm text-white font-mono">
                        {requestedApprovalAmount} USDC
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-400">Spender:</span>
                      <span className="text-xs text-white font-mono">
                        {usdcPermitTypedData.value.spender.substring(0, 10)}...
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Gas Cost:</span>
                      <span className="text-sm text-teal-400 font-semibold">FREE (Gasless)</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!onUsdcPermitSign || !walletClient || !usdcPermitTypedData) return;
                      try {
                        // Ensure we're on Polygon (chainId 137)
                        if (chainId !== 137) {
                          await switchChain(137);
                        }

                        // Sign EIP-712 typed data
                        const signature = await walletClient.signTypedData({
                          account: walletClient.account,
                          domain: {
                            ...usdcPermitTypedData.domain,
                            verifyingContract: usdcPermitTypedData.domain.verifyingContract as `0x${string}`,
                            salt: usdcPermitTypedData.domain.salt as `0x${string}` | undefined,
                          },
                          types: usdcPermitTypedData.types,
                          primaryType: 'Permit',
                          message: usdcPermitTypedData.value,
                        });

                        // Split signature into v, r, s components using viem
                        const { v, r, s } = hexToSignature(signature);

                        // Submit signature to backend
                        onUsdcPermitSign({
                          v: Number(v),
                          r,
                          s,
                          deadline: usdcPermitTypedData.value.deadline,
                        });
                      } catch (error) {
                        console.error('Failed to sign USDC permit:', error);
                        alert('Failed to sign permit. Please try again.');
                      }
                    }}
                    disabled={!walletClient}
                    className={`w-full py-3 rounded-xl font-medium transition-colors ${
                      !walletClient
                        ? 'bg-gray-500 cursor-not-allowed'
                        : 'bg-purple-500 hover:bg-purple-600'
                    } text-white`}
                  >
                    {!walletClient ? 'Connect Wallet' : 'Sign Message'}
                  </button>
                </div>
              )}

              {/* Approval Status Summary */}
              {approvalStatus && (
                <div className="p-4 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a]">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Approval Status</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">USDC Approval</span>
                      <span className={`text-sm font-semibold ${approvalStatus.usdcApproved ? 'text-teal-400' : 'text-gray-500'}`}>
                        {approvalStatus.usdcApproved ? '✓ Approved' : '⏳ Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'opportunities' && (
            <OpportunitiesTab opportunities={opportunities} />
          )}

          {activeTab === 'cross-market' && (
            <div className="space-y-4">
              {crossMarketOpportunities.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">No cross-market arbitrage opportunities detected yet.</p>
                  <p className="text-sm mt-2">The agent is scanning for logical relationships between markets.</p>
                </div>
              ) : (
                crossMarketOpportunities.map((opp, idx) => (
                  <CrossMarketOpportunityCard key={`${opp.relationship.parentMarket.id}-${idx}`} opportunity={opp} />
                ))
              )}
            </div>
          )}

          {activeTab === 'relationships' && (
            <div>
              <div className="mb-4 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-400 mb-2">Detected Market Relationships</h3>
                <p className="text-xs text-gray-300">
                  The agent automatically detects logical relationships between markets (IMPLIES, MUTUAL_EXCLUSION, etc.).
                  When prices violate these relationships, arbitrage opportunities are created.
                </p>
              </div>
              <RelationshipsTable relationships={detectedRelationships} />
            </div>
          )}

          {activeTab === 'positions' && (
            <PositionsTab positions={positions} />
          )}

          {activeTab === 'history' && (
            <HistoryTab transactionHistory={transactionHistory} tradingHistory={tradingHistory} />
          )}

          {activeTab === 'metrics' && (
            <PolymarketMetrics
              metrics={metrics}
              config={config}
              portfolioValueUsd={portfolioValueUsd}
              intraMarketCount={opportunities.length}
              crossMarketCount={crossMarketOpportunities.length}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              config={config}
              approvalStatus={approvalStatus}
              userWalletAddress={walletClient?.account?.address}
              onUpdateApproval={onUpdateApproval}
              onUpdateConfig={onUpdateConfig}
            />
          )}
        </div>
      </div>
    );
  }

  // Render pre-hire state layout
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1200px] mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <button onClick={onBack} className="hover:text-white transition-colors">
            Agents
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">{agentName}</span>
        </nav>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
          {/* Left Column - Agent Card */}
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
              <div
                className="w-full aspect-square rounded-xl flex items-center justify-center mb-6 overflow-hidden"
                style={{ background: avatarBg }}
              >
                <div className="text-8xl">{avatar}</div>
              </div>

              <button
                onClick={onHire}
                disabled={isHiring}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  isHiring
                    ? 'bg-purple-500/50 text-white cursor-wait'
                    : 'bg-purple-500 hover:bg-purple-600 text-white'
                }`}
              >
                {isHiring ? 'Hiring...' : 'Hire'}
              </button>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <StatBox label="Agent Income" value={formatCurrency(profile.agentIncome)} />
                <StatBox label="AUM" value={formatCurrency(profile.aum)} />
                <StatBox label="Total Users" value={formatNumber(profile.totalUsers)} />
                <StatBox
                  label="APY"
                  value={formatPercent(profile.apy)}
                  valueColor="text-teal-400"
                />
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
              <div className="flex items-center gap-3 mb-4">
                {rank !== undefined && <span className="text-gray-400 text-sm">#{rank}</span>}
                {rating !== undefined && (
                  <div className="flex items-center gap-1">{renderStars(rating)}</div>
                )}
              </div>

              <div className="flex items-center gap-4 mb-4">
                {creatorName && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#fd6731] flex items-center justify-center text-xs font-bold">
                      E
                    </div>
                    <span className="text-sm text-white">{creatorName}</span>
                    {creatorVerified && <span className="text-blue-400 text-xs">✓</span>}
                  </div>
                )}
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">{agentName}</h1>
              {agentDescription ? (
                <p className="text-gray-400 text-sm leading-relaxed">{agentDescription}</p>
              ) : (
                <p className="text-gray-500 text-sm italic">No description available</p>
              )}

              <div className="grid grid-cols-3 gap-4 mt-6">
                <TagColumn title="Network" items={['Polygon']} />
                <TagColumn title="Protocol" items={['Polymarket']} />
                <TagColumn title="Strategy" items={['Arbitrage']} />
              </div>
            </div>

            {/* Live Market Preview */}
            <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Live Market Preview</h3>
              <p className="text-gray-400 text-sm mb-4">
                Current arbitrage opportunities on Polymarket (no wallet required)
              </p>
              {opportunities.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {opportunities.slice(0, 3).map((opp) => (
                    <PolymarketOpportunityCard key={opp.marketId} opportunity={opp} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No opportunities available at the moment</p>
                  <p className="text-sm mt-1">Markets are being scanned...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Opportunities Tab Component
interface OpportunitiesTabProps {
  opportunities: ArbitrageOpportunity[];
}

function OpportunitiesTab({ opportunities }: OpportunitiesTabProps) {
  if (opportunities.length === 0) {
    return (
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-8 text-center">
        <div className="text-gray-600 text-4xl mb-2">🔍</div>
        <p className="text-gray-500">No opportunities found</p>
        <p className="text-gray-600 text-sm mt-1">
          The agent is monitoring markets for arbitrage opportunities (spread ≥ 2%)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Current Opportunities ({opportunities.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {opportunities.map((opp) => (
            <PolymarketOpportunityCard key={opp.marketId} opportunity={opp} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Positions Tab Component
interface PositionsTabProps {
  positions: UserPosition[];
}

function PositionsTab({ positions }: PositionsTabProps) {
  const formatNumber = (value: string | undefined) => {
    if (!value) return '—';
    const num = parseFloat(value);
    if (isNaN(num)) return '—';
    // If the value is in raw units (6 decimals), convert to readable
    if (num > 1000000) {
      return (num / 1000000).toFixed(2);
    }
    return num.toFixed(2);
  };

  const formatPrice = (value: string | undefined) => {
    if (!value) return '—';
    const num = parseFloat(value);
    if (isNaN(num)) return '—';
    return `$${num.toFixed(4)}`;
  };

  const formatPnl = (pnl: string | undefined, pnlPercent: string | undefined) => {
    if (!pnl) return { text: '—', color: 'text-gray-400' };
    const pnlNum = parseFloat(pnl);
    if (isNaN(pnlNum)) return { text: '—', color: 'text-gray-400' };
    const pctNum = pnlPercent ? parseFloat(pnlPercent) : null;
    const pctText = pctNum !== null ? ` (${pctNum >= 0 ? '+' : ''}${pctNum.toFixed(1)}%)` : '';
    return {
      text: `${pnlNum >= 0 ? '+' : ''}$${Math.abs(pnlNum).toFixed(2)}${pctText}`,
      color: pnlNum >= 0 ? 'text-teal-400' : 'text-red-400',
    };
  };

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-8 text-center">
        <div className="text-gray-600 text-4xl mb-2">📊</div>
        <p className="text-gray-500">No open positions</p>
        <p className="text-gray-600 text-sm mt-1">
          Your Polymarket positions will appear here once you start trading.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] overflow-hidden">
        <div className="p-4 border-b border-[#2a2a2a]">
          <h3 className="text-lg font-semibold text-white">Open Positions ({positions.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase border-b border-[#2a2a2a]">
                <th className="px-4 py-3">Market</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3 text-right">Size</th>
                <th className="px-4 py-3 text-right">Avg Price</th>
                <th className="px-4 py-3 text-right">Current Price</th>
                <th className="px-4 py-3 text-right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, idx) => {
                const pnlInfo = formatPnl(pos.pnl, pos.pnlPercent);
                return (
                  <tr
                    key={`${pos.tokenId}-${idx}`}
                    className="border-b border-[#2a2a2a] last:border-0 hover:bg-[#252525] transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="text-sm text-white max-w-[300px] truncate" title={pos.marketTitle}>
                        {pos.marketTitle}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        pos.outcomeId === 'yes'
                          ? 'bg-teal-900/30 text-teal-400'
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        {pos.outcomeName || pos.outcomeId.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-white font-mono">{formatNumber(pos.size)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-gray-300 font-mono">{formatPrice(pos.avgPrice)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-gray-300 font-mono">{formatPrice(pos.currentPrice)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`font-semibold ${pnlInfo.color}`}>{pnlInfo.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// History Tab Component
interface HistoryTabProps {
  transactionHistory: Transaction[];
  tradingHistory: TradingHistoryItem[];
}

function HistoryTab({ transactionHistory, tradingHistory }: HistoryTabProps) {
  const [activeSection, setActiveSection] = useState<'trades' | 'agent'>('trades');

  const formatTimestamp = (timestamp: string) => {
    // Handle both ISO strings and Unix timestamps
    const num = parseInt(timestamp, 10);
    if (!isNaN(num) && num > 1000000000) {
      // Unix timestamp in seconds
      return new Date(num * 1000).toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-4">
      {/* Section Toggle */}
      <div className="flex gap-2 p-1 bg-[#1e1e1e] rounded-lg w-fit">
        <button
          onClick={() => setActiveSection('trades')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeSection === 'trades'
              ? 'bg-purple-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Polymarket Trades ({tradingHistory.length})
        </button>
        <button
          onClick={() => setActiveSection('agent')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeSection === 'agent'
              ? 'bg-purple-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Agent Transactions ({transactionHistory.length})
        </button>
      </div>

      {/* Polymarket Trades Section */}
      {activeSection === 'trades' && (
        <div className="space-y-2">
          {tradingHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">No trades found.</p>
              <p className="text-sm mt-2">Your Polymarket trading history will appear here.</p>
            </div>
          ) : (
            tradingHistory.map((trade, idx) => (
              <div
                key={`${trade.id}-${idx}`}
                className="p-4 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      trade.side.toUpperCase() === 'BUY'
                        ? 'bg-teal-900/30 text-teal-400'
                        : 'bg-red-900/30 text-red-400'
                    }`}>
                      {trade.side.toUpperCase()}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      trade.outcome.toUpperCase() === 'YES'
                        ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-orange-900/30 text-orange-400'
                    }`}>
                      {trade.outcome.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      {parseFloat(trade.size).toFixed(2)} shares @ ${parseFloat(trade.price).toFixed(4)}
                    </div>
                    {trade.usdcSize && (
                      <div className="text-xs text-gray-400">
                        ${parseFloat(trade.usdcSize).toFixed(2)} USDC
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-300 truncate">{trade.marketTitle}</div>
                {trade.transactionHash && (
                  <a
                    href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:text-purple-300 mt-1 font-mono inline-block"
                  >
                    {trade.transactionHash.substring(0, 16)}...
                  </a>
                )}
                <div className="text-xs text-gray-500 mt-2">{formatTimestamp(trade.matchTime)}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Agent Transactions Section */}
      {activeSection === 'agent' && (
        <div className="space-y-2">
          {transactionHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">No agent transactions yet.</p>
              <p className="text-sm mt-2">Agent-executed trades will appear here.</p>
            </div>
          ) : (
            transactionHistory.map((tx) => (
              <div
                key={tx.id}
                className="p-4 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      tx.status === 'success' ? 'bg-green-900/30 text-green-400' :
                      tx.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                      'bg-yellow-900/30 text-yellow-400'
                    }`}>
                      {tx.status.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-400">Cycle {tx.cycle}</span>
                    <span className="text-sm font-mono text-gray-500">{tx.action}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{tx.shares} shares @ ${tx.price.toFixed(4)}</div>
                    <div className="text-xs text-gray-400">Total: ${tx.totalCost.toFixed(2)}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-300 truncate">{tx.marketTitle}</div>
                {tx.orderId && (
                  <div className="text-xs text-gray-500 mt-1 font-mono">Order: {tx.orderId}</div>
                )}
                {tx.error && (
                  <div className="text-xs text-red-400 mt-2 p-2 bg-red-900/20 rounded">{tx.error}</div>
                )}
                <div className="text-xs text-gray-500 mt-2">{new Date(tx.timestamp).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Contract addresses for Polygon Mainnet
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const;
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as const;

// Use environment variable for RPC URL (NEXT_PUBLIC_ prefix required for client-side access)
// Falls back to polygon-rpc.com if not set
const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';

// Settings Tab Component
interface SettingsTabProps {
  config: PolymarketStrategyConfig;
  approvalStatus?: ApprovalStatus;
  userWalletAddress?: string;
  onUpdateApproval?: (amount: string, userWalletAddress: string) => void;
  onUpdateConfig?: (config: Partial<PolymarketStrategyConfig>) => void;
}

function SettingsTab({ config, approvalStatus, userWalletAddress, onUpdateApproval, onUpdateConfig }: SettingsTabProps) {
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [showApprovalInput, setShowApprovalInput] = useState(false);
  const [approvalAmount, setApprovalAmount] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);
  // State for user's actual USDC.e allowance to CTF Exchange
  const [userAllowance, setUserAllowance] = useState<number | null>(null);
  const [isLoadingAllowance, setIsLoadingAllowance] = useState(false);
  const [editedConfig, setEditedConfig] = useState({
    minPositionSizeUsd: config.minPositionSizeUsd ?? 1,
    maxPositionSizeUsd: config.maxPositionSizeUsd,
    portfolioRiskPct: config.portfolioRiskPct,
    pollIntervalMs: config.pollIntervalMs,
    maxTotalExposureUsd: config.maxTotalExposureUsd,
  });

  // Fetch user's USDC.e allowance to CTF Exchange when wallet is connected
  useEffect(() => {
    if (!userWalletAddress) {
      setUserAllowance(null);
      return;
    }

    const fetchAllowance = async () => {
      setIsLoadingAllowance(true);
      try {
        const client = createPublicClient({
          chain: polygon,
          transport: http(POLYGON_RPC_URL),
        });

        const allowance = await client.readContract({
          address: USDC_E_ADDRESS,
          abi: [
            {
              name: 'allowance',
              type: 'function',
              stateMutability: 'view',
              inputs: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
              ],
              outputs: [{ type: 'uint256' }],
            },
          ],
          functionName: 'allowance',
          args: [userWalletAddress as `0x${string}`, CTF_EXCHANGE_ADDRESS],
        });

        // Convert from 6 decimals to USDC units
        const allowanceInUsdc = parseFloat(formatUnits(allowance, 6));
        console.log('[SETTINGS] Fetched user USDC.e allowance:', allowanceInUsdc, 'for wallet:', userWalletAddress);
        setUserAllowance(allowanceInUsdc);
      } catch (error) {
        console.error('[SETTINGS] Failed to fetch user allowance:', error);
        setUserAllowance(null);
      } finally {
        setIsLoadingAllowance(false);
      }
    };

    fetchAllowance();
  }, [userWalletAddress]);

  const handleSaveConfig = () => {
    // Validate min position size (must be >= $1)
    if (editedConfig.minPositionSizeUsd < 1) {
      setConfigError('Minimum position size cannot be less than $1');
      return;
    }
    // Validate max >= min
    if (editedConfig.maxPositionSizeUsd < editedConfig.minPositionSizeUsd) {
      setConfigError('Maximum position size must be greater than or equal to minimum');
      return;
    }
    setConfigError(null);
    if (onUpdateConfig) {
      onUpdateConfig(editedConfig);
    }
    setIsEditingConfig(false);
  };

  const handleApprovalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (approvalAmount && onUpdateApproval && userWalletAddress) {
      console.log('[SETTINGS] Submitting approval update:', approvalAmount, 'for wallet:', userWalletAddress);
      onUpdateApproval(approvalAmount, userWalletAddress);
      setShowApprovalInput(false);
      setApprovalAmount('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Approvals Section */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Token Approvals</h3>
        <p className="text-gray-400 text-sm mb-6">
          Manage your USDC.e allowance to CTF Exchange for trading on Polymarket
        </p>

        <div className="space-y-4">
          {/* USDC.e Allowance - Shows USER's actual allowance to CTF Exchange */}
          <div className="flex items-center justify-between py-3 border-b border-[#2a2a2a]">
            <div>
              <div className="text-white font-medium">Your USDC.e Allowance</div>
              <div className="text-sm text-gray-500 mt-0.5">
                Amount CTF Exchange can spend from your wallet
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold">
                {isLoadingAllowance ? (
                  'Loading...'
                ) : userAllowance !== null ? (
                  `$${userAllowance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : !userWalletAddress ? (
                  'Connect wallet'
                ) : (
                  'Not Set'
                )}
              </span>
              {onUpdateApproval && (
                <button
                  onClick={() => setShowApprovalInput(!showApprovalInput)}
                  className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-sm hover:bg-purple-500/30 transition-colors"
                >
                  Update
                </button>
              )}
            </div>
          </div>

          {/* Approval Input Form */}
          {showApprovalInput && (
            <form onSubmit={handleApprovalSubmit} className="p-4 bg-[#252525] rounded-lg">
              <label className="block text-sm text-gray-400 mb-2">New USDC Approval Amount</label>
              {!userWalletAddress ? (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-3">
                  <p className="text-yellow-400 text-sm">Please connect your wallet to update approval</p>
                </div>
              ) : null}
              <div className="flex gap-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={approvalAmount}
                  onChange={(e) => setApprovalAmount(e.target.value)}
                  placeholder="e.g., 1000"
                  className="flex-1 px-4 py-2 rounded-lg bg-[#1e1e1e] border border-[#3a3a3a] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={!userWalletAddress}
                />
                <button
                  type="submit"
                  disabled={!approvalAmount || !userWalletAddress}
                  className="px-4 py-2 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sign Approval
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This will generate a gasless permit signature for you to sign
              </p>
            </form>
          )}

          {/* CTF Approval Status */}
          <div className="flex items-center justify-between py-3 border-b border-[#2a2a2a]">
            <div>
              <div className="text-white font-medium">CTF Token Approval</div>
              <div className="text-sm text-gray-500 mt-0.5">
                Required for trading prediction market tokens
              </div>
            </div>
            <span className={`font-semibold ${
              approvalStatus?.ctfApproved ? 'text-teal-400' : 'text-gray-500'
            }`}>
              {approvalStatus?.ctfApproved ? 'Approved' : 'Not Approved'}
            </span>
          </div>

          {/* Balance Info */}
          {approvalStatus && (
            <>
              <div className="flex items-center justify-between py-3 border-b border-[#2a2a2a]">
                <div>
                  <div className="text-white font-medium">USDC Balance</div>
                  <div className="text-sm text-gray-500 mt-0.5">Available for trading</div>
                </div>
                <span className="text-white font-semibold">
                  ${approvalStatus.usdcBalance.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="text-white font-medium">POL Balance</div>
                  <div className="text-sm text-gray-500 mt-0.5">For gas fees</div>
                </div>
                <span className="text-white font-semibold">
                  {approvalStatus.polBalance.toFixed(4)} POL
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Strategy Configuration */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Strategy Configuration</h3>
            <p className="text-gray-400 text-sm mt-1">
              {isEditingConfig ? 'Edit your trading parameters' : 'Current agent configuration for arbitrage trading'}
            </p>
          </div>
          {onUpdateConfig && (
            <button
              onClick={() => {
                if (isEditingConfig) {
                  // Reset to original values
                  setEditedConfig({
                    minPositionSizeUsd: config.minPositionSizeUsd ?? 1,
                    maxPositionSizeUsd: config.maxPositionSizeUsd,
                    portfolioRiskPct: config.portfolioRiskPct,
                    pollIntervalMs: config.pollIntervalMs,
                    maxTotalExposureUsd: config.maxTotalExposureUsd,
                  });
                  setConfigError(null);
                }
                setIsEditingConfig(!isEditingConfig);
              }}
              className="px-4 py-2 rounded-lg bg-[#2a2a2a] text-white text-sm hover:bg-[#333] transition-colors"
            >
              {isEditingConfig ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>

        <div className="space-y-4">
          <SettingRow
            label="Minimum Spread Threshold"
            value={`${(config.minSpreadThreshold * 100).toFixed(1)}%`}
            description="Minimum price difference to consider an opportunity"
          />

          {isEditingConfig ? (
            <>
              <EditableSettingRow
                label="Min Position Size"
                value={editedConfig.minPositionSizeUsd}
                onChange={(val) => setEditedConfig(prev => ({ ...prev, minPositionSizeUsd: Math.max(1, val) }))}
                description="Minimum USD value per order (cannot be less than $1)"
                prefix="$"
                min={1}
              />
              <EditableSettingRow
                label="Max Position Size"
                value={editedConfig.maxPositionSizeUsd}
                onChange={(val) => setEditedConfig(prev => ({ ...prev, maxPositionSizeUsd: val }))}
                description="Maximum USD value per single position"
                prefix="$"
                min={1}
              />
              <EditableSettingRow
                label="Portfolio Risk Per Trade"
                value={editedConfig.portfolioRiskPct}
                onChange={(val) => setEditedConfig(prev => ({ ...prev, portfolioRiskPct: val }))}
                description="Percentage of portfolio to risk on each trade"
                suffix="%"
                min={0.1}
                max={100}
              />
              <EditableSettingRow
                label="Poll Interval"
                value={editedConfig.pollIntervalMs / 1000}
                onChange={(val) => setEditedConfig(prev => ({ ...prev, pollIntervalMs: val * 1000 }))}
                description="How often the agent checks for opportunities (seconds)"
                suffix="s"
                min={5}
              />
              <EditableSettingRow
                label="Max Total Exposure"
                value={editedConfig.maxTotalExposureUsd}
                onChange={(val) => setEditedConfig(prev => ({ ...prev, maxTotalExposureUsd: val }))}
                description="Maximum total USD exposure across all positions"
                prefix="$"
                min={1}
              />
              {configError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{configError}</p>
                </div>
              )}
              <div className="pt-4">
                <button
                  onClick={handleSaveConfig}
                  className="w-full py-3 rounded-xl font-medium bg-purple-500 hover:bg-purple-600 text-white transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </>
          ) : (
            <>
              <SettingRow
                label="Min Position Size"
                value={`$${config.minPositionSizeUsd ?? 1}`}
                description="Minimum USD value per order"
              />
              <SettingRow
                label="Max Position Size"
                value={`$${config.maxPositionSizeUsd}`}
                description="Maximum USD value per single position"
              />
              <SettingRow
                label="Portfolio Risk Per Trade"
                value={`${config.portfolioRiskPct}%`}
                description="Percentage of portfolio to risk on each trade"
              />
              <SettingRow
                label="Poll Interval"
                value={`${config.pollIntervalMs / 1000}s`}
                description="How often the agent checks for opportunities"
              />
              <SettingRow
                label="Max Total Exposure"
                value={`$${config.maxTotalExposureUsd}`}
                description="Maximum total USD exposure across all positions"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components
interface StatBoxProps {
  label: string;
  value: string | null;
  valueColor?: string;
}

function StatBox({ label, value, valueColor = 'text-white' }: StatBoxProps) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      {value !== null ? (
        <div className={`text-xl font-semibold ${valueColor}`}>{value}</div>
      ) : (
        <div className="text-gray-600 text-sm">—</div>
      )}
    </div>
  );
}

interface TagColumnProps {
  title: string;
  items: string[];
}

function TagColumn({ title, items }: TagColumnProps) {
  if (items.length === 0) {
    return (
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</div>
        <div className="text-gray-600 text-sm">—</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item} className="text-sm text-white">{item}</div>
        ))}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  highlight?: boolean;
}

function TabButton({ active, onClick, children, highlight }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[2px] ${
        active
          ? highlight
            ? 'text-[#fd6731] border-[#fd6731]'
            : 'text-white border-white'
          : 'text-gray-400 hover:text-white border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

interface SettingRowProps {
  label: string;
  value: string;
  description: string;
}

function SettingRow({ label, value, description }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-0">
      <div>
        <div className="text-white font-medium">{label}</div>
        <div className="text-sm text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  );
}

interface EditableSettingRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  description: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
}

function EditableSettingRow({
  label,
  value,
  onChange,
  description,
  prefix,
  suffix,
  min,
  max,
}: EditableSettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-0">
      <div className="flex-1">
        <div className="text-white font-medium">{label}</div>
        <div className="text-sm text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-gray-400">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              onChange(val);
            }
          }}
          min={min}
          max={max}
          step={value < 10 ? 0.1 : 1}
          className="w-24 px-3 py-1.5 rounded-lg bg-[#0f0f0f] border border-[#3a3a3a] text-white text-right font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {suffix && <span className="text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}
