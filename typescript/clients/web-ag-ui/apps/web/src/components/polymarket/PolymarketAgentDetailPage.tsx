'use client';

import { ChevronRight, Check, RefreshCw, Star } from 'lucide-react';
import { useState } from 'react';
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
}

type TabType = 'opportunities' | 'cross-market' | 'relationships' | 'history' | 'metrics' | 'settings';

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
}: PolymarketAgentDetailPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>(isHired ? 'opportunities' : 'metrics');

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
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
            >
              History {transactionHistory.length > 0 && `(${transactionHistory.length})`}
            </TabButton>
            <TabButton active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')}>
              Metrics
            </TabButton>
            <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
              Settings
            </TabButton>
          </div>

          {/* Tab Content */}
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

          {activeTab === 'history' && (
            <div className="space-y-4">
              {transactionHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">No transactions yet.</p>
                  <p className="text-sm mt-2">Trade history will appear here once the agent starts executing.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactionHistory.map((tx) => (
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
                  ))}
                </div>
              )}
            </div>
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
            <SettingsTab config={config} />
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

// Settings Tab Component
interface SettingsTabProps {
  config: PolymarketStrategyConfig;
}

function SettingsTab({ config }: SettingsTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Strategy Configuration</h3>
        <p className="text-gray-400 text-sm mb-6">
          Current agent configuration for arbitrage trading
        </p>

        <div className="space-y-4">
          <SettingRow
            label="Minimum Spread Threshold"
            value={`${(config.minSpreadThreshold * 100).toFixed(1)}%`}
            description="Minimum price difference to consider an opportunity"
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
