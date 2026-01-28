'use client';

import {
  ChevronRight,
  Star,
  Globe,
  Printer,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  RefreshCw,
} from 'lucide-react';
import { signDelegation } from '@metamask/delegation-toolkit/actions';
import { formatUnits } from 'viem';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  AgentProfile,
  AgentMetrics,
  AgentInterrupt,
  AgentSettings,
  AgentViewMetrics,
  FundingTokenOption,
  OnboardingState,
  Pool,
  OperatorConfigInput,
  FundingTokenInput,
  DelegationSigningResponse,
  UnsignedDelegation,
  Transaction,
  TelemetryItem,
  ClmmEvent,
} from '../types/agent';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';

export type { AgentProfile, AgentMetrics, Transaction, TelemetryItem, ClmmEvent };

interface AgentDetailPageProps {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  creatorName?: string;
  creatorVerified?: boolean;
  ownerAddress?: string;
  rank?: number;
  rating?: number;
  avatar?: string;
  avatarBg?: string;
  profile: AgentProfile;
  metrics: AgentMetrics;
  fullMetrics?: AgentViewMetrics;
  isHired: boolean;
  isHiring: boolean;
  isFiring?: boolean;
  isSyncing?: boolean;
  currentCommand?: string;
  onHire: () => void;
  onFire: () => void;
  onSync: () => void;
  onBack: () => void;
  // Interrupt handling
  activeInterrupt?: AgentInterrupt | null;
  allowedPools: Pool[];
  onInterruptSubmit?: (
    input: OperatorConfigInput | FundingTokenInput | DelegationSigningResponse,
  ) => void;
  // Task state
  taskId?: string;
  taskStatus?: string;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive?: boolean;
  onboarding?: OnboardingState;
  // Activity data
  transactions?: Transaction[];
  telemetry?: TelemetryItem[];
  events?: ClmmEvent[];
  // Settings
  settings?: AgentSettings;
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
}

type TabType = 'blockers' | 'metrics' | 'transactions' | 'settings' | 'chat';

const DEFAULT_AVATAR = '🤖';
const DEFAULT_AVATAR_BG = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';

export function AgentDetailPage({
  agentName,
  agentDescription,
  creatorName,
  creatorVerified,
  ownerAddress,
  rank,
  rating,
  avatar = DEFAULT_AVATAR,
  avatarBg = DEFAULT_AVATAR_BG,
  profile,
  metrics,
  fullMetrics,
  isHired,
  isHiring,
  isFiring,
  isSyncing,
  currentCommand,
  onHire,
  onFire,
  onSync,
  onBack,
  activeInterrupt,
  allowedPools,
  onInterruptSubmit,
  taskId,
  taskStatus,
  haltReason,
  executionError,
  delegationsBypassActive,
  onboarding,
  transactions = [],
  telemetry = [],
  events = [],
  settings,
  onSettingsChange,
}: AgentDetailPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>(isHired ? 'blockers' : 'metrics');
  const resolvedTab: TabType = activeInterrupt ? 'blockers' : activeTab;

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 5)}...${address.slice(-3)}`;
  };

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
                  {ownerAddress && (
                    <div className="text-sm text-gray-400">
                      Owned by <span className="text-white">{formatAddress(ownerAddress)}</span>
                    </div>
                  )}
                  {/* Action Icons */}
                  <div className="flex items-center gap-1 ml-auto">
                    <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </button>
                    <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                      <Globe className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
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
              <StatBox label="Agent Income" value={formatCurrency(profile.agentIncome)} />
              <StatBox label="AUM" value={formatCurrency(profile.aum)} />
              <StatBox label="Total Users" value={formatNumber(profile.totalUsers)} />
              <StatBox label="APY" value={formatPercent(profile.apy)} valueColor="text-teal-400" />
              <StatBox label="Your Assets" value={null} />
              <StatBox label="Your PnL" value={null} />
            </div>

            {/* Tags Row */}
            <div className="grid grid-cols-5 gap-4 mt-6 pt-6 border-t border-[#2a2a2a]">
              <TagColumn title="Chains" items={profile.chains} />
              <TagColumn title="Protocols" items={profile.protocols} />
              <TagColumn title="Tokens" items={profile.tokens} />
              <PointsColumn metrics={metrics} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-6 border-b border-[#2a2a2a]">
            <TabButton
              active={resolvedTab === 'blockers'}
              onClick={() => setActiveTab('blockers')}
              highlight
            >
              Agent Blockers
            </TabButton>
            <TabButton active={resolvedTab === 'metrics'} onClick={() => setActiveTab('metrics')}>
              Metrics
            </TabButton>
            <TabButton
              active={resolvedTab === 'transactions'}
              onClick={() => setActiveTab('transactions')}
            >
              Transaction history
            </TabButton>
            <TabButton active={resolvedTab === 'settings'} onClick={() => setActiveTab('settings')}>
              Settings and policies
            </TabButton>
            <TabButton active={resolvedTab === 'chat'} onClick={() => {}} disabled>
              Chat
            </TabButton>
          </div>

          {/* Tab Content */}
          {resolvedTab === 'blockers' && (
            <AgentBlockersTab
              activeInterrupt={activeInterrupt}
              allowedPools={allowedPools}
              onInterruptSubmit={onInterruptSubmit}
              taskId={taskId}
              taskStatus={taskStatus}
              haltReason={haltReason}
              executionError={executionError}
              delegationsBypassActive={delegationsBypassActive}
              onboarding={onboarding}
              telemetry={telemetry}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          )}

          {resolvedTab === 'metrics' && (
            <MetricsTab
              profile={profile}
              metrics={metrics}
              fullMetrics={fullMetrics}
              events={events}
            />
          )}

          {resolvedTab === 'transactions' && (
            <TransactionHistoryTab transactions={transactions} />
          )}

          {resolvedTab === 'settings' && (
            <SettingsTab
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          )}
        </div>
      </div>
    );
  }

  // Render pre-hire state layout (original)
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
                {ownerAddress && (
                  <div className="text-sm text-gray-400">
                    Owned by <span className="text-white">{formatAddress(ownerAddress)}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mb-6">
                <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </button>
                <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                  <Globe className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                  <Printer className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">{agentName}</h1>
              {agentDescription ? (
                <p className="text-gray-400 text-sm leading-relaxed">{agentDescription}</p>
              ) : (
                <p className="text-gray-500 text-sm italic">No description available</p>
              )}

              <div className="grid grid-cols-4 gap-4 mt-6">
                <TagColumn title="Chains" items={profile.chains} />
                <TagColumn title="Protocols" items={profile.protocols} />
                <TagColumn title="Tokens" items={profile.tokens} />
                <PointsColumn metrics={metrics} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('metrics')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'metrics'
                    ? 'bg-[#fd6731] text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Metrics
              </button>
              <button
                disabled
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 cursor-not-allowed"
              >
                Chat
              </button>
            </div>

            {activeTab === 'metrics' && (
              <MetricsTab
                profile={profile}
                metrics={metrics}
                events={[]}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  highlight?: boolean;
}

function TabButton({ active, onClick, children, disabled, highlight }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[2px] ${
        disabled
          ? 'text-gray-600 cursor-not-allowed border-transparent'
          : active
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

// Transaction History Tab Component
interface TransactionHistoryTabProps {
  transactions: Transaction[];
}

function TransactionHistoryTab({ transactions }: TransactionHistoryTabProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-8 text-center">
        <div className="text-gray-600 text-4xl mb-2">📋</div>
        <p className="text-gray-500">No transactions yet</p>
        <p className="text-gray-600 text-sm mt-1">
          Transactions will appear here once the agent starts operating
        </p>
      </div>
    );
  }

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] overflow-hidden">
      <div className="p-4 border-b border-[#2a2a2a]">
        <h3 className="text-lg font-semibold text-white">Transaction History</h3>
        <p className="text-sm text-gray-500">{transactions.length} transactions</p>
      </div>
      <div className="divide-y divide-[#2a2a2a]">
        {transactions.slice(-10).reverse().map((tx, index) => (
          <div key={`${tx.cycle}-${index}`} className="p-4 hover:bg-[#252525] transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-white">
                  Cycle {tx.cycle} • {tx.action}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {tx.txHash ? `${tx.txHash.slice(0, 12)}…` : 'pending'}
                  {tx.reason ? ` · ${tx.reason}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    tx.status === 'success'
                      ? 'bg-teal-500/20 text-teal-400'
                      : tx.status === 'failed'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  {tx.status}
                </span>
                <span className="text-xs text-gray-500">{formatDate(tx.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Agent Blockers Tab Component
interface AgentBlockersTabProps {
  activeInterrupt?: AgentInterrupt | null;
  allowedPools: Pool[];
  onInterruptSubmit?: (
    input: OperatorConfigInput | FundingTokenInput | DelegationSigningResponse,
  ) => void;
  taskId?: string;
  taskStatus?: string;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive?: boolean;
  onboarding?: OnboardingState;
  telemetry?: TelemetryItem[];
  settings?: AgentSettings;
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
}

const SETUP_STEPS = [
  {
    id: 1,
    name: 'Agent Preferences',
    description:
      'Define boundaries and ensure compatibility with your strategy. You can update permissions after deployment.',
  },
  {
    id: 2,
    name: 'Allowed Assets & Protocols',
    description: 'Select which assets and protocols the agent can interact with.',
  },
  { id: 3, name: 'Signing Policies', description: 'Configure transaction signing requirements.' },
  { id: 4, name: 'Claims & Unwinds', description: 'Set up claim and unwind procedures.' },
  { id: 5, name: 'Summary', description: 'Review and confirm your settings.' },
];

function AgentBlockersTab({
  activeInterrupt,
  allowedPools,
  onInterruptSubmit,
  taskId,
  taskStatus,
  haltReason,
  executionError,
  delegationsBypassActive,
  onboarding,
  telemetry = [],
  settings,
  onSettingsChange,
}: AgentBlockersTabProps) {
  const {
    walletClient,
    privyWallet,
    chainId,
    switchChain,
    isLoading: isWalletLoading,
    error: walletError,
  } = usePrivyWalletClient();
  const walletBypassEnabled = process.env.NEXT_PUBLIC_WALLET_BYPASS === 'true';
  const walletBypassAddress =
    process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS ?? '0x0000000000000000000000000000000000000000';

  const [currentStep, setCurrentStep] = useState(1);
  const [poolAddress, setPoolAddress] = useState('');
  const [baseContributionUsd, setBaseContributionUsd] = useState(
    settings?.amount?.toString() ?? '',
  );
  const [fundingTokenAddress, setFundingTokenAddress] = useState('');
  const [isSigningDelegations, setIsSigningDelegations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHexAddress = (value: string) => /^0x[0-9a-fA-F]+$/.test(value);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!poolAddress) {
      setError('Please select a pool.');
      return;
    }

    const operatorWalletAddress =
      privyWallet?.address ?? (walletBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      setError(
        walletBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
      return;
    }

    if (!isHexAddress(operatorWalletAddress)) {
      setError(
        walletBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
      return;
    }

    let baseContributionNumber: number | undefined;
    if (baseContributionUsd.trim() !== '') {
      const parsed = Number(baseContributionUsd);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setError('Base contribution must be a positive number when provided.');
        return;
      }
      baseContributionNumber = parsed;
      onSettingsChange?.({ amount: baseContributionNumber });
    }

    onInterruptSubmit?.({
      poolAddress: poolAddress as `0x${string}`,
      walletAddress: operatorWalletAddress as `0x${string}`,
      ...(baseContributionNumber !== undefined
        ? { baseContributionUsd: baseContributionNumber }
        : {}),
    });
    setCurrentStep(2);
  };

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Derive which form to show from the interrupt type (the authoritative source)
  const showOperatorConfigForm = activeInterrupt?.type === 'operator-config-request';
  const showFundingTokenForm = activeInterrupt?.type === 'clmm-funding-token-request';
  const showDelegationSigningForm = activeInterrupt?.type === 'clmm-delegation-signing-request';

  // Sync currentStep with the interrupt type when it changes
  useEffect(() => {
    if (showOperatorConfigForm) {
      setCurrentStep(1);
    } else if (showFundingTokenForm) {
      setCurrentStep(2);
    } else if (showDelegationSigningForm) {
      setCurrentStep(3);
    }
  }, [showOperatorConfigForm, showFundingTokenForm, showDelegationSigningForm]);

  // Also sync from onboarding.step if provided by the agent
  useEffect(() => {
    const nextStep = onboarding?.step;
    if (typeof nextStep === 'number' && Number.isFinite(nextStep) && nextStep > 0) {
      setCurrentStep(nextStep);
    }
  }, [onboarding?.step]);

  const fundingOptions: FundingTokenOption[] = showFundingTokenForm
    ? [...(activeInterrupt as { options: FundingTokenOption[] }).options].sort((a, b) => {
        try {
          const aBal = BigInt(a.balance);
          const bBal = BigInt(b.balance);
          if (aBal === bBal) return a.symbol.localeCompare(b.symbol);
          return aBal > bBal ? -1 : 1;
        } catch {
          return a.symbol.localeCompare(b.symbol);
        }
      })
    : [];

  const formatFundingBalance = (option: FundingTokenOption) => {
    try {
      return formatUnits(BigInt(option.balance), option.decimals);
    } catch {
      return option.balance;
    }
  };

  const handleFundingTokenSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isHexAddress(fundingTokenAddress)) {
      setError('Funding token address must be a 0x-prefixed hex string.');
      return;
    }

    setCurrentStep(3);
    onInterruptSubmit?.({
      fundingTokenAddress: fundingTokenAddress as `0x${string}`,
    });
  };

  const handleRejectDelegations = () => {
    setError(null);
    setCurrentStep(5);
    onInterruptSubmit?.({ outcome: 'rejected' });
  };

  const handleSignDelegations = async (delegationsToSign: UnsignedDelegation[]) => {
    setError(null);
    if (showDelegationSigningForm !== true) return;

    const interrupt = activeInterrupt as unknown as {
      chainId: number;
      delegationManager: `0x${string}`;
      delegationsToSign: UnsignedDelegation[];
    };

    if (!walletClient) {
      setError('Connect a wallet to sign delegations.');
      return;
    }
    if (isWalletLoading) {
      setError('Wallet is still loading. Try again in a moment.');
      return;
    }
    if (walletError) {
      setError(walletError.message);
      return;
    }
    if (chainId !== interrupt.chainId) {
      setError(`Switch your wallet to chainId=${interrupt.chainId} to sign delegations.`);
      return;
    }

    setIsSigningDelegations(true);
    try {
      const signedDelegations = [];
      for (const delegation of delegationsToSign) {
        const signature = await signDelegation(walletClient, {
          delegation,
          delegationManager: interrupt.delegationManager,
          chainId: interrupt.chainId,
          account: walletClient.account,
        });
        signedDelegations.push({ ...delegation, signature });
      }

      const response: DelegationSigningResponse = { outcome: 'signed', signedDelegations };
      setCurrentStep(5);
      onInterruptSubmit?.(response);
    } catch (signError: unknown) {
      const message =
        signError instanceof Error ? signError.message : typeof signError === 'string' ? signError : 'Unknown error';
      setError(`Failed to sign delegations: ${message}`);
    } finally {
      setIsSigningDelegations(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Error/Halt Display */}
      {(haltReason || executionError) && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="font-medium">Agent Blocked</span>
          </div>
          <p className="text-red-300 text-sm">{haltReason || executionError}</p>
        </div>
      )}

      {delegationsBypassActive && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
          <div className="text-yellow-300 text-sm font-medium mb-1">Delegation bypass active</div>
          <p className="text-yellow-200 text-xs">
            `CLMM_DELEGATIONS_BYPASS=true` is set. The agent will use its own wallet for liquidity management (not your wallet).
          </p>
        </div>
      )}

      {walletBypassEnabled && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
          <div className="text-yellow-300 text-sm font-medium mb-1">Wallet bypass enabled</div>
          <p className="text-yellow-200 text-xs">
            `NEXT_PUBLIC_WALLET_BYPASS=true` is set. When no wallet is connected, the UI will use
            {` ${walletBypassAddress} `}for onboarding. Run the agent with
            {` CLMM_DELEGATIONS_BYPASS=true `}to skip delegation signing.
          </p>
        </div>
      )}

      {/* Task Status */}
      {taskId && (
        <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Current Task</span>
              <p className="text-white font-medium">{taskId.slice(0, 12)}...</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                taskStatus === 'working'
                  ? 'bg-teal-500/20 text-teal-400'
                  : taskStatus === 'completed'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {taskStatus || 'pending'}
            </span>
          </div>
        </div>
      )}

      {/* Latest Telemetry */}
      {telemetry.length > 0 && (
        <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Latest Activity</div>
          <div className="space-y-2">
            {telemetry.slice(-3).reverse().map((t, i) => (
              <div
                key={`${t.cycle}-${i}`}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <span className="text-white">Cycle {t.cycle}</span>
                  <span className="text-gray-500 mx-2">•</span>
                  <span className="text-gray-400">{t.action}</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(t.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Set up agent section */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Set up agent</h2>
        <p className="text-gray-400 text-sm mb-6">
          Get this agent started working on your wallet in a few steps, delegate assets and set
          your preferences.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Form Area */}
          <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
            {showOperatorConfigForm ? (
              <form onSubmit={handleSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">Agent Preferences</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Select Pool</label>
                    <select
                      value={poolAddress}
                      onChange={(e) => setPoolAddress(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white focus:border-[#fd6731] focus:outline-none transition-colors"
                    >
                      <option value="">Choose a pool...</option>
                      {allowedPools.map((pool) => (
                        <option key={pool.address} value={pool.address}>
                          {pool.token0.symbol}/{pool.token1.symbol} — {pool.address.slice(0, 10)}
                          ...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Allocated Funds (USD)</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder="$12,561"
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      className="mt-2 px-4 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm transition-colors"
                    >
                      Approve
                    </button>
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isWalletLoading}
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showFundingTokenForm ? (
              <form onSubmit={handleFundingTokenSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">Select Funding Token</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">Funding Token</label>
                  <select
                    value={fundingTokenAddress}
                    onChange={(e) => setFundingTokenAddress(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white focus:border-[#fd6731] focus:outline-none transition-colors"
                  >
                    <option value="">Choose a token...</option>
                    {fundingOptions.map((option) => (
                      <option key={option.address} value={option.address}>
                        {option.symbol} — {formatFundingBalance(option)} ({option.address.slice(0, 8)}…)
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showDelegationSigningForm ? (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Review & Sign Delegations</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  {(activeInterrupt as unknown as { warnings?: string[] }).warnings?.length ? (
                    <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
                      <div className="text-yellow-300 text-sm font-medium mb-2">Warnings</div>
                      <ul className="space-y-1 text-yellow-200 text-xs">
                        {(activeInterrupt as unknown as { warnings: string[] }).warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">What you are authorizing</div>
                    <ul className="space-y-1 text-gray-400 text-xs">
                      {(activeInterrupt as unknown as { descriptions?: string[] }).descriptions?.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                {walletError && !error && (
                  <p className="text-red-400 text-sm mb-4">{walletError.message}</p>
                )}
                {walletBypassEnabled && !walletClient && !error && !walletError && (
                  <p className="text-yellow-300 text-sm mb-4">
                    Wallet bypass is enabled. To skip delegation signing, run the agent with
                    {` CLMM_DELEGATIONS_BYPASS=true`}.
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRejectDelegations}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-sm transition-colors"
                    disabled={isSigningDelegations}
                  >
                    Reject
                  </button>
                  <div className="flex items-center gap-2">
                    {chainId !== null &&
                      (activeInterrupt as unknown as { chainId?: number }).chainId !== undefined &&
                      chainId !== (activeInterrupt as unknown as { chainId: number }).chainId && (
                        <button
                          type="button"
                          onClick={() =>
                            switchChain((activeInterrupt as unknown as { chainId: number }).chainId).catch(
                              () => void 0,
                            )
                          }
                          className="px-4 py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm transition-colors"
                          disabled={isSigningDelegations}
                        >
                          Switch Chain
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() =>
                        handleSignDelegations(
                          (activeInterrupt as unknown as { delegationsToSign: UnsignedDelegation[] })
                            .delegationsToSign,
                        )
                      }
                      className="px-6 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#fd6731]/90 text-white font-medium transition-colors disabled:opacity-60"
                      disabled={isSigningDelegations || !walletClient}
                    >
                      {isSigningDelegations ? 'Signing…' : 'Sign & Continue'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-600 text-4xl mb-4">⏳</div>
                <h3 className="text-lg font-medium text-white mb-2">
                  {currentStep > 1 ? 'Processing…' : 'Waiting for agent'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {currentStep > 1
                    ? 'The agent is processing your last submission and will request the next input if needed.'
                    : 'The agent will prompt you when it needs configuration input.'}
                </p>
                {!taskId && (
                  <p className="text-gray-600 text-xs mt-4">
                    No active task. The agent may need to be started.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Steps Sidebar */}
          <div className="space-y-2">
            {SETUP_STEPS.map((step) => (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                  step.id === currentStep ? 'bg-[#1e1e1e]' : ''
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                    step.id === currentStep
                      ? 'bg-[#fd6731] text-white'
                      : step.id < currentStep
                        ? 'bg-teal-500 text-white'
                        : 'bg-[#2a2a2a] text-gray-500'
                  }`}
                >
                  {step.id < currentStep ? <Check className="w-3 h-3" /> : step.id}
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      step.id === currentStep ? 'text-white' : 'text-gray-500'
                    }`}
                  >
                    {step.name}
                  </p>
                  {step.id === currentStep && (
                    <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How Policies Work Link */}
        <div className="mt-6">
          <button className="text-[#fd6731] text-sm font-medium flex items-center gap-1 hover:underline">
            How Policies Work
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared Components
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

  const getChainIcon = (chain: string) => {
    const icons: Record<string, { bg: string; letter: string }> = {
      arbitrum: { bg: 'bg-blue-500', letter: 'A' },
      linea: { bg: 'bg-cyan-500', letter: 'L' },
      abstract: { bg: 'bg-green-500', letter: 'A' },
      polygon: { bg: 'bg-purple-500', letter: 'P' },
      ethereum: { bg: 'bg-blue-600', letter: 'E' },
      base: { bg: 'bg-blue-400', letter: 'B' },
      optimism: { bg: 'bg-red-500', letter: 'O' },
    };
    return (
      icons[chain.toLowerCase()] || { bg: 'bg-gray-500', letter: chain.charAt(0).toUpperCase() }
    );
  };

  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</div>
      <div className="space-y-1.5">
        {items.slice(0, 3).map((item) => {
          const icon = getChainIcon(item);
          return (
            <div key={item} className="flex items-center gap-2">
              <div
                className={`w-4 h-4 rounded-full ${icon.bg} flex items-center justify-center text-[8px] font-bold text-white`}
              >
                {icon.letter}
              </div>
              <span className="text-sm text-white capitalize">{item}</span>
            </div>
          );
        })}
        {items.length > 3 && <div className="text-xs text-gray-500">+{items.length - 3} more</div>}
      </div>
    </div>
  );
}

interface PointsColumnProps {
  metrics: AgentMetrics;
}

function PointsColumn({ metrics }: PointsColumnProps) {
  const hasAnyMetric =
    metrics.iteration !== undefined ||
    metrics.cyclesSinceRebalance !== undefined ||
    metrics.staleCycles !== undefined;

  if (!hasAnyMetric) {
    return (
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Points</div>
        <div className="text-gray-600 text-sm">—</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Points</div>
      <div className="space-y-1.5">
        {metrics.iteration !== undefined && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span className="text-sm text-white">{metrics.iteration}x</span>
          </div>
        )}
        {metrics.cyclesSinceRebalance !== undefined && (
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-white">{metrics.cyclesSinceRebalance}x</span>
          </div>
        )}
        {metrics.staleCycles !== undefined && metrics.staleCycles > 0 && (
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-sm text-white">{metrics.staleCycles}x</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Metrics Tab Component
interface MetricsTabProps {
  profile: AgentProfile;
  metrics: AgentMetrics;
  fullMetrics?: AgentViewMetrics;
  events: ClmmEvent[];
}

function MetricsTab({ profile, metrics, fullMetrics, events }: MetricsTabProps) {
  const formatDate = (timestamp?: string) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Iteration"
          value={metrics.iteration?.toString() ?? '—'}
          icon={<TrendingUp className="w-4 h-4 text-teal-400" />}
        />
        <MetricCard
          label="Cycles Since Rebalance"
          value={metrics.cyclesSinceRebalance?.toString() ?? '—'}
          icon={<Minus className="w-4 h-4 text-yellow-400" />}
        />
        <MetricCard
          label="Stale Cycles"
          value={metrics.staleCycles?.toString() ?? '—'}
          icon={<TrendingDown className="w-4 h-4 text-red-400" />}
        />
        <MetricCard
          label="Previous Price"
          value={fullMetrics?.previousPrice?.toFixed(6) ?? '—'}
          icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
        />
      </div>

      {/* Profile Stats */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">APY</div>
            <div className="text-2xl font-bold text-teal-400">
              {profile.apy !== undefined ? `${profile.apy.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">AUM</div>
            <div className="text-2xl font-bold text-white">
              {profile.aum !== undefined ? `$${profile.aum.toLocaleString()}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Agent Income</div>
            <div className="text-2xl font-bold text-white">
              {profile.agentIncome !== undefined ? `$${profile.agentIncome.toLocaleString()}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Users</div>
            <div className="text-2xl font-bold text-white">
              {profile.totalUsers !== undefined ? profile.totalUsers.toLocaleString() : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Latest Cycle Info */}
      {fullMetrics?.latestCycle && (
        <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Latest Cycle</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cycle</div>
              <div className="text-white font-medium">{fullMetrics.latestCycle.cycle}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Action</div>
              <div className="text-white font-medium">{fullMetrics.latestCycle.action}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Mid Price</div>
              <div className="text-white font-medium">
                {fullMetrics.latestCycle.midPrice?.toFixed(6) ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Timestamp</div>
              <div className="text-white font-medium">
                {formatDate(fullMetrics.latestCycle.timestamp)}
              </div>
            </div>
          </div>
          {fullMetrics.latestCycle.reason && (
            <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reason</div>
              <div className="text-gray-300 text-sm">{fullMetrics.latestCycle.reason}</div>
            </div>
          )}
        </div>
      )}

      {/* Activity Stream */}
      {events.length > 0 && (
        <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Activity Stream</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {events.slice(-10).reverse().map((event, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#252525]">
                <div
                  className={`w-2 h-2 rounded-full mt-2 ${
                    event.type === 'status'
                      ? 'bg-blue-400'
                      : event.type === 'artifact'
                        ? 'bg-purple-400'
                        : 'bg-gray-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">{event.type}</div>
                  <div className="text-sm text-white mt-1">
                    {event.type === 'status' && event.message}
                    {event.type === 'artifact' && `Artifact: ${event.artifact?.type ?? 'unknown'}`}
                    {event.type === 'dispatch-response' && `Response with ${event.parts?.length ?? 0} parts`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

// Settings Tab Component
interface SettingsTabProps {
  settings?: AgentSettings;
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
}

function SettingsTab({ settings, onSettingsChange }: SettingsTabProps) {
  const [localAmount, setLocalAmount] = useState(settings?.amount?.toString() ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    if (!onSettingsChange) return;

    const amount = localAmount.trim() === '' ? undefined : Number(localAmount);
    if (amount !== undefined && (Number.isNaN(amount) || amount < 0)) {
      return;
    }

    setIsSaving(true);
    onSettingsChange({ amount });
    setTimeout(() => setIsSaving(false), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Allocation Settings</h3>
        <p className="text-gray-400 text-sm mb-6">
          Configure the amount of funds allocated to this agent for liquidity operations.
        </p>

        <div className="max-w-md">
          <label className="block text-sm text-gray-400 mb-2">Allocated Amount (USD)</label>
          <div className="flex gap-3">
            <input
              type="number"
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              placeholder="Enter amount..."
              className="flex-1 px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
            />
            <button
              onClick={handleSave}
              disabled={isSaving || !onSettingsChange}
              className="px-6 py-3 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {settings?.amount !== undefined && (
            <p className="text-xs text-gray-500 mt-2">
              Current allocation: ${settings.amount.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Policies</h3>
        <p className="text-gray-500 text-sm">
          Additional policy settings will be available in a future update.
        </p>
      </div>
    </div>
  );
}
