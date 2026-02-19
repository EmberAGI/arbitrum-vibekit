'use client';

/* eslint-disable @next/next/no-img-element */

import {
  ChevronRight,
  Star,
  Globe,
  Github,
  TrendingUp,
  Minus,
  Check,
  RefreshCw,
} from 'lucide-react';
import { formatUnits } from 'viem';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AgentProfile,
  AgentMetrics,
  AgentInterrupt,
  AgentSettings,
  AgentViewMetrics,
  FundingTokenOption,
  OnboardingState,
  Pool,
  PendleMarket,
  OperatorConfigInput,
  PendleSetupInput,
  FundWalletAcknowledgement,
  GmxSetupInput,
  FundingTokenInput,
  DelegationSigningResponse,
  UnsignedDelegation,
  Transaction,
  TelemetryItem,
  ClmmEvent,
} from '../types/agent';
import { getAgentConfig } from '../config/agents';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import { PROTOCOL_TOKEN_FALLBACK } from '../constants/protocolTokenFallback';
import { useOnchainActionsIconMaps } from '../hooks/useOnchainActionsIconMaps';
import {
  normalizeNameKey,
  normalizeSymbolKey,
  proxyIconUri,
  resolveAgentAvatarUri,
  resolveTokenIconUri,
  iconMonogram,
} from '../utils/iconResolution';
import { formatPoolPair } from '../utils/poolFormat';
import { Skeleton } from './ui/Skeleton';
import { LoadingValue } from './ui/LoadingValue';
import { CreatorIdentity } from './ui/CreatorIdentity';
import { CursorListTooltip } from './ui/CursorListTooltip';
import { CTA_SIZE_MD, CTA_SIZE_MD_FULL } from './ui/cta';
import { signDelegationWithFallback } from '../utils/delegationSigning';

export type { AgentProfile, AgentMetrics, Transaction, TelemetryItem, ClmmEvent };

const MIN_BASE_CONTRIBUTION_USD = 10;
const AGENT_WEBSITE_URL = 'https://emberai.xyz';
const AGENT_GITHUB_URL = 'https://github.com/EmberAGI/arbitrum-vibekit';
const AGENT_X_URL = 'https://x.com/emberagi';

interface AgentDetailPageProps {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  creatorName?: string;
  creatorVerified?: boolean;
  ownerAddress?: string;
  rank?: number;
  rating?: number;
  profile: AgentProfile;
  metrics: AgentMetrics;
  fullMetrics?: AgentViewMetrics;
  initialTab?: TabType;
  isHired: boolean;
  isHiring: boolean;
  hasLoadedView: boolean;
  isFiring?: boolean;
  isSyncing?: boolean;
  currentCommand?: string;
  uiError?: string | null;
  onClearUiError?: () => void;
  onHire: () => void;
  onFire: () => void;
  onSync: () => void;
  onBack: () => void;
  // Interrupt handling
  activeInterrupt?: AgentInterrupt | null;
  allowedPools: Array<Pool | PendleMarket>;
  onInterruptSubmit?: (
    input:
      | OperatorConfigInput
      | PendleSetupInput
      | FundWalletAcknowledgement
      | GmxSetupInput
      | FundingTokenInput
      | DelegationSigningResponse,
  ) => void;
  // Task state
  taskId?: string;
  taskStatus?: string;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive?: boolean;
  onboarding?: OnboardingState;
  setupComplete?: boolean;
  // Activity data
  transactions?: Transaction[];
  telemetry?: TelemetryItem[];
  events?: ClmmEvent[];
  // Settings
  settings?: AgentSettings;
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
}

type TabType = 'blockers' | 'metrics' | 'transactions' | 'settings' | 'chat';

function hashStringToSeed(value: string): number {
  // Cheap stable hash for deterministic mock series.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeMockSeries(params: {
  seedKey: string;
  points: number;
  start: number;
  drift: number;
  noise: number;
  min?: number;
  max?: number;
}): number[] {
  const { seedKey, points, start, drift, noise, min, max } = params;
  const rand = mulberry32(hashStringToSeed(seedKey));
  const out: number[] = [];
  let current = start;

  for (let i = 0; i < points; i++) {
    const n = (rand() - 0.5) * 2; // [-1, 1]
    current += drift + n * noise;
    if (min !== undefined) current = Math.max(min, current);
    if (max !== undefined) current = Math.min(max, current);
    out.push(current);
  }

  return out;
}

function Sparkline(props: {
  values: number[];
  height?: number;
  strokeClassName?: string;
  fillClassName?: string;
}) {
  const { values, height = 160, strokeClassName = 'stroke-purple-400', fillClassName = 'fill-purple-500/10' } =
    props;
  if (values.length < 2) return null;

  const width = 300;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const area = `0,${height} ${points} ${width},${height}`;

  return (
    <div className="mt-5 h-[160px] rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline points={area} className={fillClassName} />
        <polyline
          points={points}
          className={`${strokeClassName} stroke-[2]`}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function FloatingErrorToast(props: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed top-5 right-5 z-[60] w-[360px] max-w-[calc(100vw-2.5rem)]">
      <div className="rounded-2xl border border-red-500/30 bg-[#141414]/95 backdrop-blur px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-red-200">{props.title}</div>
            <div className="mt-1 text-xs text-red-100/80 leading-relaxed break-words">
              {props.message}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="shrink-0 rounded-lg p-2 text-red-100/70 hover:text-red-100 hover:bg-white/5 transition-colors"
            aria-label="Dismiss"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentDetailPage({
  agentId,
  agentName,
  agentDescription,
  creatorName,
  creatorVerified,
  ownerAddress,
  rank,
  rating,
  profile,
  metrics,
  fullMetrics,
  initialTab,
  isHired,
  isHiring,
  hasLoadedView,
  isFiring,
  isSyncing,
  currentCommand,
  uiError,
  onClearUiError,
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
  setupComplete,
  transactions = [],
  telemetry = [],
  events = [],
  settings,
  onSettingsChange,
}: AgentDetailPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>(
    initialTab ?? (isHired ? 'blockers' : 'metrics'),
  );
  const [hasUserSelectedTab, setHasUserSelectedTab] = useState(false);
  const [dismissedBlockingError, setDismissedBlockingError] = useState<string | null>(null);
  const agentConfig = useMemo(() => getAgentConfig(agentId), [agentId]);
  const isTaskTerminal =
    taskStatus === 'completed' ||
    taskStatus === 'failed' ||
    taskStatus === 'canceled' ||
    taskStatus === 'rejected';
  const isPendleOnboardingInFlight =
    agentId === 'agent-pendle' &&
    currentCommand === 'hire' &&
    setupComplete !== true &&
    !isTaskTerminal;
  const isOnboardingActive =
    Boolean(activeInterrupt) ||
    taskStatus === 'input-required' ||
    isPendleOnboardingInFlight;
  const forceBlockersTab = isOnboardingActive;
  const selectTab = useCallback((tab: TabType) => {
    setHasUserSelectedTab(true);
    setActiveTab(tab);
  }, []);

  const resolvedTab: TabType = forceBlockersTab
    ? 'blockers'
    : !hasUserSelectedTab && isHired
      ? 'metrics'
      : activeTab;

  const blockingErrorMessage = (haltReason || executionError || null) as string | null;
  const showBlockingErrorPopup =
    Boolean(blockingErrorMessage) && dismissedBlockingError !== blockingErrorMessage;

  const popups = (
    <>
      {uiError ? (
        <FloatingErrorToast
          title="Action failed"
          message={uiError}
          onClose={() => onClearUiError?.()}
        />
      ) : null}
      {!uiError && showBlockingErrorPopup && blockingErrorMessage ? (
        <FloatingErrorToast
          title="Agent error"
          message={blockingErrorMessage}
          onClose={() => setDismissedBlockingError(blockingErrorMessage)}
        />
      ) : null}
    </>
  );

  const displayChains = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    for (const chain of profile.chains ?? []) {
      const trimmed = chain.trim();
      if (trimmed.length === 0) continue;

      // Figma expects the canonical label "Arbitrum" even if upstream sources report
      // "Arbitrum One" or other variants. Keep this narrowly-scoped to avoid unintended
      // renames for other chains.
      const normalized = normalizeNameKey(trimmed);
      const label = normalized.startsWith('arbitrum') ? 'Arbitrum' : trimmed;
      const dedupeKey = normalizeNameKey(label);

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(label);
    }

    return out;
  }, [profile.chains]);

  const displayProtocols = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const push = (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };

    for (const protocol of profile.protocols ?? []) push(protocol);
    for (const protocol of agentConfig.protocols ?? []) push(protocol);
    return out;
  }, [agentConfig.protocols, profile.protocols]);

  const displayTokens = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const push = (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      const key = trimmed.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };

    for (const token of profile.tokens ?? []) push(token);
    for (const token of agentConfig.tokens ?? []) push(token);
    return out;
  }, [agentConfig.tokens, profile.tokens]);

  const desiredTokenSymbols = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const addSymbol = (symbol: string | undefined) => {
      if (!symbol) return;
      const trimmed = symbol.trim();
      if (trimmed.length === 0) return;
      if (seen.has(trimmed)) return;
      seen.add(trimmed);
      out.push(trimmed);
    };

    for (const symbol of displayTokens) addSymbol(symbol);
    for (const protocol of displayProtocols) addSymbol(PROTOCOL_TOKEN_FALLBACK[protocol]);

    return out;
  }, [displayProtocols, displayTokens]);

  const { chainIconByName, tokenIconBySymbol } = useOnchainActionsIconMaps({
    chainNames: profile.chains ?? [],
    tokenSymbols: desiredTokenSymbols,
  });

  const agentAvatarUri = useMemo(
    () =>
      resolveAgentAvatarUri({
        protocols: profile.protocols ?? [],
        tokenIconBySymbol,
      }) ??
      (profile.chains && profile.chains.length > 0
        ? chainIconByName[normalizeNameKey(profile.chains[0])] ?? null
        : null),
    [chainIconByName, profile.chains, profile.protocols, tokenIconBySymbol],
  );

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

  const formatSignedCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return null;
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatCurrency(value)}`;
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

  // Render the upgraded layout immediately during hydration so we never flash the legacy
  // pre-hire view for already-hired agents.
  if (isHired || !hasLoadedView) {
    const tabs = (
      <div className="flex items-center gap-1 mb-6 border-b border-[#2a2a2a]">
        <TabButton
          active={resolvedTab === 'blockers'}
          onClick={() => selectTab('blockers')}
          highlight
        >
          Agent Blockers
        </TabButton>
        <TabButton
          active={resolvedTab === 'metrics'}
          onClick={() => selectTab('metrics')}
          disabled={isOnboardingActive}
        >
          Metrics
        </TabButton>
        <TabButton
          active={resolvedTab === 'transactions'}
          onClick={() => selectTab('transactions')}
          disabled={isOnboardingActive}
        >
          Transaction history
        </TabButton>
        <TabButton
          active={resolvedTab === 'settings'}
          onClick={() => selectTab('settings')}
          disabled={isOnboardingActive}
        >
          Settings and policies
        </TabButton>
        <TabButton active={resolvedTab === 'chat'} onClick={() => {}} disabled>
          Chat
        </TabButton>
      </div>
    );

    const tabContent = (
      <>
        {resolvedTab === 'blockers' && (
          <AgentBlockersTab
            agentId={agentId}
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
            agentId={agentId}
            profile={profile}
            metrics={metrics}
            fullMetrics={fullMetrics}
            events={events}
            transactions={transactions}
            hasLoadedView={hasLoadedView}
          />
        )}

        {resolvedTab === 'transactions' && (
          <TransactionHistoryTab
            transactions={transactions}
            chainIconUri={displayChains.length > 0 ? chainIconByName[normalizeNameKey(displayChains[0])] ?? null : null}
            protocolLabel={
              profile.protocols && profile.protocols.length > 0 ? profile.protocols[0] : null
            }
            protocolIconUri={
              profile.protocols && profile.protocols.length > 0
                ? (() => {
                    const protocol = profile.protocols[0];
                    const fallback = PROTOCOL_TOKEN_FALLBACK[protocol];
                    return fallback ? tokenIconBySymbol[normalizeSymbolKey(fallback)] ?? null : null;
                  })()
                : null
            }
          />
        )}

        {resolvedTab === 'settings' && (
          <SettingsTab settings={settings} onSettingsChange={onSettingsChange} />
        )}
      </>
    );

    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1200px] mx-auto">
          {popups}
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

          <>
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-stretch">
                {/* Left summary card (Figma onboarding) */}
                <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 h-full">
                  <div className="h-[220px] w-[220px] rounded-full flex items-center justify-center mb-6 overflow-hidden bg-[#111] ring-1 ring-[#2a2a2a] mx-auto">
                    {agentAvatarUri ? (
                      <img
                        src={proxyIconUri(agentAvatarUri)}
                        alt=""
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl font-semibold text-white/75" aria-hidden="true">
                        {iconMonogram(agentName)}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-center">
                    {isHired ? (
                      <div
                        className={`group relative w-full inline-flex h-10 items-stretch overflow-hidden rounded-[999px] bg-[#2a2a2a] ring-1 ring-white/10 transition-[background-color,box-shadow,border-color] duration-300 ease-out hover:ring-white/20 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] group-hover:bg-gradient-to-r group-hover:from-[#ff2a00] group-hover:to-[#fd6731] group-hover:ring-[#fd6731]/30 group-hover:shadow-[0_16px_55px_rgba(255,42,0,0.28),0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.10)] ${
                          isFiring ? 'opacity-90' : ''
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(1200px_circle_at_50%_0%,rgba(255,255,255,0.10),transparent_40%)]" />

                        <div className="relative z-10 flex flex-1 min-w-0 items-center gap-2 px-3 text-[13px] font-medium text-gray-100 transition-[opacity,flex-basis,padding] duration-200 ease-out group-hover:opacity-0 group-hover:flex-[0_0_0%] group-hover:px-0 overflow-hidden">
                          <span
                            className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)] transition-transform duration-200 group-hover:scale-110"
                            aria-hidden="true"
                          />
                          <span>Agent is hired</span>
                        </div>

                        <button
                          type="button"
                          onClick={onFire}
                          disabled={isFiring}
                          className={`relative z-10 flex flex-[0_0_92px] items-center justify-center px-3 h-full text-[13px] font-medium text-white border-l border-white/10 transition-[flex-basis,background-color,border-color,color,box-shadow] duration-300 ease-out group-hover:flex-1 group-hover:bg-transparent group-hover:border-white/0 ${
                            isFiring
                              ? 'bg-gray-600 cursor-wait'
                              : 'bg-gradient-to-b from-[#ff4d1a] to-[#fd6731] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                          }`}
                        >
                          {isFiring ? 'Firing...' : 'Fire'}
                        </button>
                      </div>
                    ) : (
                      <Skeleton className="h-10 w-full rounded-[999px]" />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6">
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                        Agent Income
                      </div>
                      <LoadingValue
                        isLoaded={hasLoadedView}
                        skeletonClassName="h-6 w-24"
                        loadedClassName="text-lg font-semibold text-white"
                        value={formatCurrency(profile.agentIncome)}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                        AUM
                      </div>
                      <LoadingValue
                        isLoaded={hasLoadedView}
                        skeletonClassName="h-6 w-24"
                        loadedClassName="text-lg font-semibold text-white"
                        value={formatCurrency(profile.aum)}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                        Total Users
                      </div>
                      <LoadingValue
                        isLoaded={hasLoadedView}
                        skeletonClassName="h-6 w-20"
                        loadedClassName="text-lg font-semibold text-white"
                        value={formatNumber(profile.totalUsers)}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                        APY
                      </div>
                      <LoadingValue
                        isLoaded={hasLoadedView}
                        skeletonClassName="h-6 w-16"
                        loadedClassName="text-lg font-semibold text-teal-400"
                        value={formatPercent(profile.apy)}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                        Your Assets
                      </div>
                      <LoadingValue
                        isLoaded={hasLoadedView}
                        skeletonClassName="h-6 w-24"
                        loadedClassName="text-lg font-semibold text-white"
                        value={formatCurrency(fullMetrics?.latestSnapshot?.totalUsd)}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                        Your PnL
                      </div>
                      <LoadingValue
                        isLoaded={hasLoadedView}
                        skeletonClassName="h-6 w-24"
                        loadedClassName={`text-lg font-semibold ${
                          (metrics.lifetimePnlUsd ?? 0) >= 0 ? 'text-teal-400' : 'text-red-400'
                        }`}
                        value={formatSignedCurrency(metrics.lifetimePnlUsd)}
                      />
                    </div>
                  </div>
                </div>

                {/* Right header (no surrounding card) */}
                <div className="pt-2 h-full flex flex-col">
                  <div className="flex items-start justify-between gap-6 mb-6">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        {rank !== undefined && <span className="text-gray-400 text-sm">#{rank}</span>}
                        {rating !== undefined && (
                          <div className="flex items-center gap-1">{renderStars(rating)}</div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {creatorName && (
                          <CreatorIdentity
                            name={creatorName}
                            verified={creatorVerified}
                            size="md"
                            nameClassName="text-sm text-white"
                          />
                        )}
                        {ownerAddress && (
                          <div className="text-sm text-gray-400">
                            Owned by <span className="text-white">{formatAddress(ownerAddress)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={AGENT_X_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="X"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </a>
                      <a
                        href={AGENT_WEBSITE_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Website"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <Globe className="w-4 h-4" />
                      </a>
                      <a
                        href={AGENT_GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="GitHub"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <Github className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  <h1 className="text-2xl font-bold text-white mb-2">{agentName}</h1>
                  {agentDescription ? (
                    <p className="text-gray-400 text-sm leading-relaxed">{agentDescription}</p>
                  ) : (
                    <p className="text-gray-500 text-sm italic">No description available</p>
                  )}

                  <div className="grid grid-cols-4 gap-4 mt-auto pt-6 border-t border-white/10">
                    <TagColumn
                      title="Chains"
                      items={displayChains}
                      getIconUri={(chain) => chainIconByName[normalizeNameKey(chain)] ?? null}
                    />
                    <TagColumn
                      title="Protocols"
                      items={displayProtocols}
                      getIconUri={(protocol) => {
                        const fallback = PROTOCOL_TOKEN_FALLBACK[protocol];
                        if (!fallback) return null;
                        return tokenIconBySymbol[normalizeSymbolKey(fallback)] ?? null;
                      }}
                    />
                    <TagColumn
                      title="Tokens"
                      items={displayTokens}
                      getIconUri={(symbol) => resolveTokenIconUri({ symbol, tokenIconBySymbol })}
                    />
                    <PointsColumn metrics={metrics} />
                  </div>
                </div>
              </div>

            {/* Tabs + content span full available width (no empty left column) */}
            <div className="mt-8">{tabs}</div>
            <div>{tabContent}</div>
          </>
        </div>
      </div>
    );
  }

  // Render pre-hire state layout (original)
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1200px] mx-auto">
        {popups}
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <button onClick={onBack} className="hover:text-white transition-colors">
            Agents
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">{agentName}</span>
        </nav>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-stretch">
          {/* Left Column - Agent Card */}
          <div className="h-full">
            <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 h-full">
              <div className="h-[220px] w-[220px] rounded-full flex items-center justify-center mb-6 overflow-hidden bg-[#111] ring-1 ring-[#2a2a2a] mx-auto">
                {agentAvatarUri ? (
                  <img
                    src={proxyIconUri(agentAvatarUri)}
                    alt=""
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-semibold text-white/75" aria-hidden="true">
                    {iconMonogram(agentName)}
                  </span>
                )}
              </div>

              <button
                onClick={onHire}
                disabled={isHiring}
                className={[
                  CTA_SIZE_MD_FULL,
                  isHiring
                    ? 'bg-purple-500/50 text-white cursor-wait'
                    : 'bg-purple-500 hover:bg-purple-600 text-white shadow-[0_10px_30px_rgba(168,85,247,0.25)]',
                  'transition-[background-color,box-shadow] duration-200',
                ].join(' ')}
              >
                {isHiring ? 'Hiring...' : 'Hire'}
              </button>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6">
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                    Agent Income
                  </div>
                  {!hasLoadedView ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <div className="text-lg font-semibold text-white">
                      {formatCurrency(profile.agentIncome) ?? '-'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                    AUM
                  </div>
                  {!hasLoadedView ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <div className="text-lg font-semibold text-white">
                      {formatCurrency(profile.aum) ?? '-'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                    Total Users
                  </div>
                  {!hasLoadedView ? (
                    <Skeleton className="h-6 w-20" />
                  ) : (
                    <div className="text-lg font-semibold text-white">
                      {formatNumber(profile.totalUsers) ?? '-'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                    APY
                  </div>
                  {!hasLoadedView ? (
                    <Skeleton className="h-6 w-16" />
                  ) : (
                    <div className="text-lg font-semibold text-teal-400">
                      {formatPercent(profile.apy) ?? '-'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="h-full">
            <div className="pt-2 h-full flex flex-col">
              <div className="flex items-start justify-between gap-6 mb-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    {rank !== undefined && <span className="text-gray-400 text-sm">#{rank}</span>}
                    {rating !== undefined && (
                      <div className="flex items-center gap-1">{renderStars(rating)}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {creatorName && (
                      <CreatorIdentity
                        name={creatorName}
                        verified={creatorVerified}
                        size="md"
                        nameClassName="text-sm text-white"
                      />
                    )}
                    {ownerAddress && (
                      <div className="text-sm text-gray-400">
                        Owned by <span className="text-white">{formatAddress(ownerAddress)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={AGENT_X_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="X"
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  <a
                    href={AGENT_WEBSITE_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Website"
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                  <a
                    href={AGENT_GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="GitHub"
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <Github className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">{agentName}</h1>
              {agentDescription ? (
                <p className="text-gray-400 text-sm leading-relaxed">{agentDescription}</p>
              ) : (
                <p className="text-gray-500 text-sm italic">No description available</p>
              )}

              <div className="grid grid-cols-4 gap-4 mt-auto pt-6 border-t border-white/10">
                <TagColumn
                  title="Chains"
                  items={displayChains}
                  getIconUri={(chain) => chainIconByName[normalizeNameKey(chain)] ?? null}
                />
                <TagColumn
                  title="Protocols"
                  items={displayProtocols}
                  getIconUri={(protocol) => {
                    const fallback = PROTOCOL_TOKEN_FALLBACK[protocol];
                    if (!fallback) return null;
                    return tokenIconBySymbol[normalizeSymbolKey(fallback)] ?? null;
                  }}
                />
                <TagColumn
                  title="Tokens"
                  items={displayTokens}
                  getIconUri={(symbol) => resolveTokenIconUri({ symbol, tokenIconBySymbol })}
                />
                <PointsColumn metrics={metrics} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 border-b border-white/10 flex items-center gap-6">
          <button
            type="button"
            className="px-1 pb-3 text-sm font-medium text-[#fd6731] border-b-2 border-[#fd6731] -mb-px"
            aria-current="page"
          >
            Metrics
          </button>
          <button type="button" disabled className="px-1 pb-3 text-sm font-medium text-gray-600">
            Chat
          </button>
        </div>

        <div className="mt-6">
          {/* Pre-hire should still show the same chart cards across agents (CLMM/Pendle/GMX)
             so the page doesn't feel "empty" before hire. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">APY Change</div>
                  <div className="text-xs text-gray-500 mt-1">Latest vs previous snapshot</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-teal-400">
                    <LoadingValue
                      isLoaded={hasLoadedView}
                      skeletonClassName="h-7 w-20"
                      loadedClassName="text-teal-400"
                      value={metrics.apy !== undefined ? `${metrics.apy.toFixed(0)}%` : null}
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    {fullMetrics?.previousApy !== undefined && metrics.apy !== undefined
                      ? `${(metrics.apy - fullMetrics.previousApy).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>
              </div>
              <Sparkline
                values={makeMockSeries({
                  seedKey: `${agentId}:apy`,
                  points: 24,
                  start: metrics.apy ?? 18,
                  drift: 0.02,
                  noise: 0.35,
                  min: 0,
                  max: 120,
                })}
              />
            </div>

            <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">Total Users</div>
                  <div className="text-xs text-gray-500 mt-1">All time</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-white">
                    <LoadingValue
                      isLoaded={hasLoadedView}
                      skeletonClassName="h-7 w-24"
                      loadedClassName="text-white"
                      value={profile.totalUsers !== undefined ? profile.totalUsers.toLocaleString() : null}
                    />
                  </div>
                  <div className="text-xs text-gray-500">—</div>
                </div>
              </div>
              <Sparkline
                values={makeMockSeries({
                  seedKey: `${agentId}:users`,
                  points: 24,
                  start: Math.max(50, profile.totalUsers ?? 5000) * 0.6,
                  drift: Math.max(1, (profile.totalUsers ?? 5000) / 400),
                  noise: Math.max(2, (profile.totalUsers ?? 5000) / 250),
                  min: 0,
                })}
                strokeClassName="stroke-purple-300"
                fillClassName="fill-purple-400/10"
              />
            </div>
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
  chainIconUri: string | null;
  protocolIconUri: string | null;
  protocolLabel: string | null;
}

function TransactionHistoryTab({
  transactions,
  chainIconUri,
  protocolIconUri,
  protocolLabel,
}: TransactionHistoryTabProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="text-[12px] uppercase tracking-[0.14em] text-white/60 mb-2">
          Transaction History
        </div>
        <div className="text-white text-lg font-semibold mb-1">No transactions yet</div>
        <div className="text-sm text-gray-400">
          Transactions will appear here once the agent starts operating.
        </div>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-6">
        <div>
          <div className="text-[12px] uppercase tracking-[0.14em] text-white/60">
            Transaction History
          </div>
          <div className="text-sm text-gray-400 mt-1">
            Showing the latest {Math.min(10, transactions.length)} of {transactions.length}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="bg-white/[0.02]">
            <tr className="text-[11px] uppercase tracking-[0.14em] text-white/60 border-b border-white/10">
              <th className="text-left font-medium px-5 py-3">Transaction</th>
              <th className="text-left font-medium px-5 py-3">Date &amp; time</th>
              <th className="text-left font-medium px-5 py-3">Protocol</th>
              <th className="text-right font-medium px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {transactions
              .slice(-10)
              .reverse()
              .map((tx, index) => {
                const shortHash = tx.txHash ? `${tx.txHash.slice(0, 10)}…${tx.txHash.slice(-4)}` : 'pending';
                const status = tx.status ?? 'pending';

                const statusPillClass =
                  status === 'success'
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
                    : status === 'failed'
                      ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/25'
                      : 'bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/25';

                return (
                  <tr
                    key={`${tx.cycle}-${index}`}
                    className="hover:bg-white/[0.04] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center -space-x-2 flex-shrink-0">
                          {chainIconUri ? (
                            <img
                              src={proxyIconUri(chainIconUri)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12] object-contain"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12]" />
                          )}
                          {protocolIconUri ? (
                            <img
                              src={proxyIconUri(protocolIconUri)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12] object-contain"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12]" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-white font-medium truncate">
                            Cycle {tx.cycle} · {tx.action}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 truncate">
                            {shortHash}
                            {tx.reason ? ` · ${tx.reason}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(tx.timestamp)}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-300 whitespace-nowrap">
                      {protocolLabel ?? '—'}
                    </td>

                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[12px] font-medium ${statusPillClass}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Agent Blockers Tab Component
interface AgentBlockersTabProps {
  agentId: string;
  activeInterrupt?: AgentInterrupt | null;
  allowedPools: Array<Pool | PendleMarket>;
  onInterruptSubmit?: (
    input:
      | OperatorConfigInput
      | PendleSetupInput
      | FundWalletAcknowledgement
      | GmxSetupInput
      | FundingTokenInput
      | DelegationSigningResponse,
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

type SetupStep = {
  id: number;
  name: string;
  description: string;
};

type SetupStepKind = 'setup' | 'funding' | 'delegation' | 'fund-wallet';

const isFundingInterruptType = (type: AgentInterrupt['type'] | undefined): boolean =>
  type === 'clmm-funding-token-request' ||
  type === 'pendle-funding-token-request' ||
  type === 'gmx-funding-token-request';

const isDelegationInterruptType = (type: AgentInterrupt['type'] | undefined): boolean =>
  type === 'clmm-delegation-signing-request' ||
  type === 'pendle-delegation-signing-request' ||
  type === 'gmx-delegation-signing-request';

const resolveSetupStepKinds = (params: {
  totalSteps?: number;
  interruptType?: AgentInterrupt['type'];
  delegationsBypassActive?: boolean;
  onboardingStep?: number;
  onboardingKey?: string;
}): SetupStepKind[] => {
  const resolvedTotalSteps =
    typeof params.totalSteps === 'number' && Number.isFinite(params.totalSteps)
      ? Math.max(1, Math.floor(params.totalSteps))
      : params.interruptType === 'gmx-fund-wallet-request'
        ? 4
        : 3;

  const stepKinds: SetupStepKind[] = (() => {
    if (resolvedTotalSteps === 1) {
      return ['setup'];
    }

    if (resolvedTotalSteps === 2) {
      if (params.delegationsBypassActive === true) {
        return ['setup', 'funding'];
      }
      if (isDelegationInterruptType(params.interruptType)) {
        return ['setup', 'delegation'];
      }
      return ['setup', 'funding'];
    }

    if (resolvedTotalSteps === 3) {
      return ['setup', 'funding', 'delegation'];
    }

    return [
      'setup',
      'funding',
      'delegation',
      ...Array.from(
        { length: resolvedTotalSteps - 3 },
        (): SetupStepKind => 'fund-wallet',
      ),
    ];
  })();

  if (
    typeof params.onboardingStep === 'number' &&
    Number.isFinite(params.onboardingStep) &&
    params.onboardingStep > 0 &&
    params.onboardingStep <= resolvedTotalSteps &&
    params.onboardingKey === 'fund-wallet'
  ) {
    stepKinds[params.onboardingStep - 1] = 'fund-wallet';
  }

  return stepKinds;
};

const BASE_SETUP_STEP_COPY: Record<
  'default' | 'pendle' | 'gmx',
  Record<SetupStepKind, Omit<SetupStep, 'id'>>
> = {
  default: {
    setup: {
      name: 'Agent Preferences',
      description: 'Provide strategy inputs so the agent can initialize your configuration.',
    },
    funding: {
      name: 'Funding Token',
      description: 'Choose the starting asset used to fund agent actions.',
    },
    delegation: {
      name: 'Signing Policies',
      description: 'Review and sign delegations required for execution.',
    },
    'fund-wallet': {
      name: 'Fund Wallet',
      description: 'Add required funds, then continue to retry execution.',
    },
  },
  pendle: {
    setup: {
      name: 'Funding Amount',
      description: 'Set deployment amount and wallet context for Pendle.',
    },
    funding: {
      name: 'Funding Token',
      description: 'Select the starting stablecoin (may be auto-selected from existing position).',
    },
    delegation: {
      name: 'Delegation Signing',
      description: 'Approve permissions needed to manage the Pendle position.',
    },
    'fund-wallet': {
      name: 'Fund Wallet',
      description: 'Fund the wallet with an eligible stablecoin before continuing.',
    },
  },
  gmx: {
    setup: {
      name: 'Strategy Config',
      description: 'Select market and allocation for the GMX strategy.',
    },
    funding: {
      name: 'Funding Token',
      description: 'Choose the funding token used for position management.',
    },
    delegation: {
      name: 'Delegation Signing',
      description: 'Approve execution permissions for GMX operations.',
    },
    'fund-wallet': {
      name: 'Fund Wallet',
      description: 'Add GMX collateral + Arbitrum ETH gas before retrying.',
    },
  },
};

function resolveSetupSteps(params: {
  agentId: string;
  totalSteps?: number;
  onboardingStep?: number;
  onboardingKey?: string;
  interruptType?: AgentInterrupt['type'];
  delegationsBypassActive?: boolean;
}): SetupStep[] {
  const copyKey =
    params.agentId === 'agent-pendle'
      ? 'pendle'
      : params.agentId === 'agent-gmx-allora'
        ? 'gmx'
        : 'default';
  const baseSteps = BASE_SETUP_STEP_COPY[copyKey];
  const resolvedTotalSteps =
    typeof params.totalSteps === 'number' && Number.isFinite(params.totalSteps)
      ? Math.max(1, Math.floor(params.totalSteps))
      : params.interruptType === 'gmx-fund-wallet-request'
        ? 4
        : 3;
  const resolvedStepKinds = resolveSetupStepKinds({
    totalSteps: resolvedTotalSteps,
    onboardingStep: params.onboardingStep,
    onboardingKey: params.onboardingKey,
    interruptType: params.interruptType,
    delegationsBypassActive: params.delegationsBypassActive,
  });

  return Array.from({ length: resolvedTotalSteps }, (_, index) => {
    const stepNumber = index + 1;
    const stepKind = resolvedStepKinds[index];
    const baseStep = stepKind ? baseSteps[stepKind] : undefined;
    return {
      id: stepNumber,
      name: baseStep?.name ?? `Step ${stepNumber}`,
      description:
        baseStep?.description ?? 'Follow the next agent prompt to continue onboarding.',
    };
  });
}

function AgentBlockersTab({
  agentId,
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
  const delegationsBypassEnabled =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS : undefined) ===
    'true';
  // Treat empty-string env as unset so the UI does not render a blank address.
  const walletBypassAddress =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS : undefined)?.trim() ||
    '0x0000000000000000000000000000000000000000';
  const isPendleAgent = agentId === 'agent-pendle';
  const isGmxAlloraAgent = agentId === 'agent-gmx-allora';
  const delegationsBypassEnv = 'DELEGATIONS_BYPASS';
  const delegationContextLabel = isPendleAgent
    ? 'Pendle execution'
    : isGmxAlloraAgent
      ? 'GMX perps execution'
      : 'liquidity management';
  const connectedWalletAddress =
    privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

  const [currentStep, setCurrentStep] = useState(1);
  const [poolAddress, setPoolAddress] = useState('');
  const [baseContributionUsd, setBaseContributionUsd] = useState(
    settings?.amount?.toString() ?? '',
  );
  const [targetMarket, setTargetMarket] = useState<'BTC' | 'ETH'>('BTC');
  const [fundingTokenAddress, setFundingTokenAddress] = useState('');
  const [isSigningDelegations, setIsSigningDelegations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTerminalTask =
    taskStatus === 'failed' || taskStatus === 'canceled' || taskStatus === 'rejected';
  const showBlockingError = Boolean(haltReason || executionError) && isTerminalTask;
  const setupSteps = useMemo(
    () =>
      resolveSetupSteps({
        agentId,
        totalSteps: onboarding?.totalSteps,
        onboardingStep: onboarding?.step,
        onboardingKey: onboarding?.key,
        interruptType: activeInterrupt?.type,
        delegationsBypassActive,
      }),
    [
      agentId,
      onboarding?.totalSteps,
      onboarding?.step,
      onboarding?.key,
      activeInterrupt?.type,
      delegationsBypassActive,
    ],
  );
  const maxSetupStep = setupSteps.length;
  const clampStep = useCallback(
    (value: number) => Math.max(1, Math.min(value, maxSetupStep)),
    [maxSetupStep],
  );

  const isHexAddress = (value: string) => /^0x[0-9a-fA-F]+$/.test(value);
  const uniqueAllowedPools: Pool[] = [];
  const seenPoolAddresses = new Set<string>();
  const isPool = (value: unknown): value is Pool =>
    typeof value === 'object' &&
    value !== null &&
    'address' in value &&
    typeof (value as { address?: unknown }).address === 'string';
  for (const poolCandidate of allowedPools) {
    if (!isPool(poolCandidate)) continue;
    const pool = poolCandidate;
    if (seenPoolAddresses.has(pool.address)) continue;
    seenPoolAddresses.add(pool.address);
    uniqueAllowedPools.push(pool);
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!poolAddress) {
      setError('Please select a pool.');
      return;
    }

    const operatorWalletAddress =
      privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      setError(
        delegationsBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
      return;
    }

    if (!isHexAddress(operatorWalletAddress)) {
      setError(
        delegationsBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
      return;
    }

    const trimmedContribution = baseContributionUsd.trim();
    const parsedContribution =
      trimmedContribution === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedContribution);
    if (!Number.isFinite(parsedContribution)) {
      setError('Base contribution must be a valid number.');
      return;
    }
    if (parsedContribution < MIN_BASE_CONTRIBUTION_USD) {
      setError(`Base contribution must be at least $${MIN_BASE_CONTRIBUTION_USD}.`);
      return;
    }

    if (trimmedContribution === '') {
      setBaseContributionUsd(`${MIN_BASE_CONTRIBUTION_USD}`);
    }

    const baseContributionNumber = parsedContribution;
    onSettingsChange?.({ amount: baseContributionNumber });

    onInterruptSubmit?.({
      poolAddress: poolAddress as `0x${string}`,
      walletAddress: operatorWalletAddress as `0x${string}`,
      baseContributionUsd: baseContributionNumber,
    });
    setCurrentStep(clampStep(2));
  };

  const handlePendleSetupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const operatorWalletAddress =
      privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      setError(
        delegationsBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
      return;
    }

    if (!isHexAddress(operatorWalletAddress)) {
      setError(
        delegationsBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
      return;
    }

    const trimmedContribution = baseContributionUsd.trim();
    const parsedContribution =
      trimmedContribution === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedContribution);
    if (!Number.isFinite(parsedContribution)) {
      setError('Funding amount must be a valid number.');
      return;
    }
    if (parsedContribution < MIN_BASE_CONTRIBUTION_USD) {
      setError(`Funding amount must be at least $${MIN_BASE_CONTRIBUTION_USD}.`);
      return;
    }

    if (trimmedContribution === '') {
      setBaseContributionUsd(`${MIN_BASE_CONTRIBUTION_USD}`);
    }

    const baseContributionNumber = parsedContribution;
    onSettingsChange?.({ amount: baseContributionNumber });

    onInterruptSubmit?.({
      walletAddress: operatorWalletAddress as `0x${string}`,
      baseContributionUsd: baseContributionNumber,
    });
    setCurrentStep(clampStep(2));
  };

  const handleGmxSetupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const operatorWalletAddress =
      privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      setError(
        delegationsBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
      return;
    }

    if (!isHexAddress(operatorWalletAddress)) {
      setError(
        delegationsBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
      return;
    }

    if (targetMarket !== 'BTC' && targetMarket !== 'ETH') {
      setError('Select a valid GMX market (BTC or ETH).');
      return;
    }

    const trimmedContribution = baseContributionUsd.trim();
    const parsedContribution =
      trimmedContribution === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedContribution);
    if (!Number.isFinite(parsedContribution)) {
      setError('USDC allocation must be a valid number.');
      return;
    }
    if (parsedContribution < MIN_BASE_CONTRIBUTION_USD) {
      setError(`USDC allocation must be at least $${MIN_BASE_CONTRIBUTION_USD}.`);
      return;
    }

    if (trimmedContribution === '') {
      setBaseContributionUsd(`${MIN_BASE_CONTRIBUTION_USD}`);
    }

    const baseContributionNumber = parsedContribution;
    onSettingsChange?.({ amount: baseContributionNumber });

    onInterruptSubmit?.({
      walletAddress: operatorWalletAddress as `0x${string}`,
      baseContributionUsd: baseContributionNumber,
      targetMarket,
    });
    setCurrentStep(clampStep(2));
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
  const showPendleSetupForm = activeInterrupt?.type === 'pendle-setup-request';
  const showPendleFundWalletForm = activeInterrupt?.type === 'pendle-fund-wallet-request';
  const showGmxFundWalletForm = activeInterrupt?.type === 'gmx-fund-wallet-request';
  const showGmxSetupForm = activeInterrupt?.type === 'gmx-setup-request';
  const showFundingTokenForm =
    activeInterrupt?.type === 'clmm-funding-token-request' ||
    activeInterrupt?.type === 'pendle-funding-token-request' ||
    activeInterrupt?.type === 'gmx-funding-token-request';
  const showDelegationSigningForm =
    activeInterrupt?.type === 'clmm-delegation-signing-request' ||
    activeInterrupt?.type === 'pendle-delegation-signing-request' ||
    activeInterrupt?.type === 'gmx-delegation-signing-request';

  const interruptStep = useMemo(() => {
    if (showOperatorConfigForm || showPendleSetupForm || showGmxSetupForm) {
      return 1;
    }
    if (showPendleFundWalletForm || showFundingTokenForm) {
      return 2;
    }
    if (showGmxFundWalletForm) {
      return maxSetupStep;
    }
    if (showDelegationSigningForm) {
      return 3;
    }
    return null;
  }, [
    showOperatorConfigForm,
    showPendleSetupForm,
    showPendleFundWalletForm,
    showGmxFundWalletForm,
    showGmxSetupForm,
    showFundingTokenForm,
    showDelegationSigningForm,
    maxSetupStep,
  ]);

  // Agent-provided onboarding metadata is authoritative when present.
  useEffect(() => {
    const nextStep = onboarding?.step;
    if (typeof nextStep === 'number' && Number.isFinite(nextStep) && nextStep > 0) {
      setCurrentStep(clampStep(nextStep));
      return;
    }
    if (interruptStep !== null) {
      setCurrentStep(clampStep(interruptStep));
    }
  }, [clampStep, interruptStep, onboarding?.step]);

  const fundingOptions: FundingTokenOption[] = showFundingTokenForm
    ? [...(activeInterrupt as { options: FundingTokenOption[] }).options].sort((a, b) => {
        const aValue = typeof a.valueUsd === 'number' && Number.isFinite(a.valueUsd) ? a.valueUsd : null;
        const bValue = typeof b.valueUsd === 'number' && Number.isFinite(b.valueUsd) ? b.valueUsd : null;
        if (aValue !== null && bValue !== null && aValue !== bValue) {
          return bValue - aValue;
        }
        if (aValue !== null && bValue === null) return -1;
        if (aValue === null && bValue !== null) return 1;
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

    setCurrentStep(clampStep(3));
    onInterruptSubmit?.({
      fundingTokenAddress: fundingTokenAddress as `0x${string}`,
    });
  };

  const handleRejectDelegations = () => {
    setError(null);
    setCurrentStep(maxSetupStep);
    onInterruptSubmit?.({ outcome: 'rejected' });
  };

  const handleSignDelegations = async (delegationsToSign: UnsignedDelegation[]) => {
    setError(null);
    if (showDelegationSigningForm !== true) return;

    const interrupt = activeInterrupt as unknown as {
      chainId: number;
      delegationManager: `0x${string}`;
      delegatorAddress: `0x${string}`;
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

    const requiredDelegatorAddress = interrupt.delegatorAddress.toLowerCase();
    const signerAddress = walletClient.account?.address?.toLowerCase();
    if (!signerAddress || signerAddress !== requiredDelegatorAddress) {
      setError(
        `Switch to Privy wallet ${interrupt.delegatorAddress} to sign delegations. Current signer: ${
          walletClient.account?.address ?? 'unknown'
        }.`,
      );
      return;
    }

    setIsSigningDelegations(true);
    try {
      const signedDelegations = [];
      for (const delegation of delegationsToSign) {
        if (delegation.delegator.toLowerCase() !== requiredDelegatorAddress) {
          throw new Error(
            `Delegation delegator ${delegation.delegator} does not match required signer ${interrupt.delegatorAddress}.`,
          );
        }
        const signature = await signDelegationWithFallback({
          walletClient,
          delegation,
          delegationManager: interrupt.delegationManager,
          chainId: interrupt.chainId,
          account: interrupt.delegatorAddress,
        });
        signedDelegations.push({ ...delegation, signature });
      }

      const response: DelegationSigningResponse = { outcome: 'signed', signedDelegations };
      setCurrentStep(maxSetupStep);
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
      {showBlockingError && (
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
            {` ${delegationsBypassEnv}=true `}is set. The agent will use its own wallet for
            {` ${delegationContextLabel} `}(not your wallet).
          </p>
        </div>
      )}

      {delegationsBypassEnabled && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
          <div className="text-yellow-300 text-sm font-medium mb-1">Wallet bypass enabled</div>
          <p className="text-yellow-200 text-xs">
            `DELEGATIONS_BYPASS=true` is set. When no wallet is connected, the UI will use
            {` ${walletBypassAddress} `}for onboarding. Run the agent with
            {` ${delegationsBypassEnv}=true `}to skip delegation signing.
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
            {showPendleSetupForm ? (
              <form onSubmit={handlePendleSetupSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">Pendle Setup</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Funding Amount (USD)</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">Auto-selected yield</div>
                    <p className="text-gray-400 text-xs">
                      The agent will automatically select the highest-yield YT market and rotate when yields change.
                    </p>
                    <p className="text-gray-500 text-xs mt-3">
                      Wallet: {connectedWalletAddress ? `${connectedWalletAddress.slice(0, 10)}…` : 'Not connected'}
                    </p>
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
            ) : showPendleFundWalletForm ? (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Fund Wallet</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4 mb-6">
                  <div className="text-yellow-300 text-sm font-medium mb-2">What to do</div>
                  <ul className="space-y-1 text-yellow-200 text-xs">
                    <li>
                      Add a small balance of an eligible stablecoin on Arbitrum to your wallet, then click Continue.
                    </li>
                    <li>
                      Eligible: {(activeInterrupt as unknown as { whitelistSymbols?: string[] }).whitelistSymbols?.join(', ') || 'USDai, USDC'}
                    </li>
                    <li>
                      Wallet: {(activeInterrupt as unknown as { walletAddress?: string }).walletAddress || connectedWalletAddress || 'Unknown'}
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onInterruptSubmit?.({ acknowledged: true })}
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : showGmxFundWalletForm ? (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Fund Wallet</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4 mb-6">
                  <div className="text-yellow-300 text-sm font-medium mb-2">What to do</div>
                  <ul className="space-y-1 text-yellow-200 text-xs">
                    <li>
                      Add enough{' '}
                      {(activeInterrupt as unknown as { requiredCollateralSymbol?: string })
                        .requiredCollateralSymbol || 'USDC'}{' '}
                      on Arbitrum for GMX collateral.
                    </li>
                    <li>Add a small amount of Arbitrum ETH for execution gas fees.</li>
                    <li>
                      Wallet:{' '}
                      {(activeInterrupt as unknown as { walletAddress?: string }).walletAddress ||
                        connectedWalletAddress ||
                        'Unknown'}
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onInterruptSubmit?.({ acknowledged: true })}
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : showGmxSetupForm ? (
              <form onSubmit={handleGmxSetupSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">GMX Allora Setup</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Target Market</label>
                    <select
                      value={targetMarket}
                      onChange={(e) => setTargetMarket(e.target.value as 'BTC' | 'ETH')}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white focus:border-[#fd6731] focus:outline-none transition-colors"
                    >
                      <option value="BTC">BTC / USDC</option>
                      <option value="ETH">ETH / USDC</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">USDC Allocation</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">Allora Signal Source</div>
                    <p className="text-gray-400 text-xs">
                      The agent consumes 8-hour Allora prediction feeds and enforces max 2x leverage.
                    </p>
                    <p className="text-gray-500 text-xs mt-3">
                      Wallet: {connectedWalletAddress ? `${connectedWalletAddress.slice(0, 10)}…` : 'Not connected'}
                    </p>
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
            ) : showOperatorConfigForm ? (
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
                      {uniqueAllowedPools.map((pool) => (
                        <option key={pool.address} value={pool.address}>
                          {formatPoolPair(pool)} — {pool.address.slice(0, 10)}
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
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
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
                {delegationsBypassEnabled && !walletClient && !error && !walletError && (
                  <p className="text-yellow-300 text-sm mb-4">
                    Wallet bypass is enabled. To skip delegation signing, run the agent with
                    {` ${delegationsBypassEnv}=true`}.
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
            {setupSteps.map((step) => (
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
  isLoaded: boolean;
}

function StatBox({ label, value, valueColor = 'text-white', isLoaded }: StatBoxProps) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      {!isLoaded ? (
        <Skeleton className="h-6 w-20" />
      ) : value !== null ? (
          <div className={`text-xl font-semibold ${valueColor}`}>{value}</div>
        ) : (
          <div className="text-gray-600 text-sm">-</div>
        )}
    </div>
  );
}

interface TagColumnProps {
  title: string;
  items: string[];
  getIconUri: (item: string) => string | null;
}

function TagColumn({ title, items, getIconUri }: TagColumnProps) {
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
        {items.slice(0, 3).map((item) => {
          const iconUri = getIconUri(item);
          return (
            <div key={item} className="flex items-center gap-2">
              {iconUri ? (
                <img
                  src={proxyIconUri(iconUri)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 rounded-full bg-[#111] ring-1 ring-[#2a2a2a] object-contain"
                />
              ) : (
                <div
                  className="h-4 w-4 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center text-[7px] font-semibold text-white/70 select-none"
                  aria-hidden="true"
                >
                  {iconMonogram(item)}
                </div>
              )}
              <span className="text-sm text-white">{item}</span>
            </div>
          );
        })}
        {items.length > 3 ? (
          <CursorListTooltip
            title={`${title} (more)`}
            items={items.slice(3).map((label) => ({
              label,
              iconUri: getIconUri(label),
            }))}
          >
            <div className="inline-flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-default">
              <span className="h-5 w-6 rounded-md bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center text-[12px] text-gray-200 font-semibold">
                …
              </span>
              <span>{items.length - 3} more</span>
            </div>
          </CursorListTooltip>
        ) : null}
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
    metrics.rebalanceCycles !== undefined;

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
        {metrics.rebalanceCycles !== undefined && (
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-white">{metrics.rebalanceCycles}x</span>
          </div>
        )}
      </div>
    </div>
  );
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' ? (value as UnknownRecord) : undefined;
}

function getStringField(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const candidate = record ? record[key] : undefined;
  return typeof candidate === 'string' ? candidate : undefined;
}

function getBooleanField(value: unknown, key: string): boolean | undefined {
  const record = asRecord(value);
  const candidate = record ? record[key] : undefined;
  return typeof candidate === 'boolean' ? candidate : undefined;
}

function getArrayField(value: unknown, key: string): unknown[] | undefined {
  const record = asRecord(value);
  const candidate = record ? record[key] : undefined;
  return Array.isArray(candidate) ? candidate : undefined;
}

function getArtifactId(artifact: unknown): string | undefined {
  const artifactRecord = asRecord(artifact);
  if (!artifactRecord) return undefined;

  const idCandidate = artifactRecord['artifactId'];
  if (typeof idCandidate === 'string' && idCandidate.trim().length > 0) return idCandidate;

  const nameCandidate = artifactRecord['name'];
  if (typeof nameCandidate === 'string' && nameCandidate.trim().length > 0) return nameCandidate;

  const typeCandidate = artifactRecord['type'];
  if (typeof typeCandidate === 'string' && typeCandidate.trim().length > 0) return typeCandidate;

  const fallbackCandidate = artifactRecord['id'];
  if (typeof fallbackCandidate === 'string' && fallbackCandidate.trim().length > 0) return fallbackCandidate;

  return undefined;
}

function getArtifactDataPart(artifact: unknown): UnknownRecord | undefined {
  const parts = getArrayField(artifact, 'parts');
  if (!parts) return undefined;

  for (const part of parts) {
    const record = asRecord(part);
    if (!record) continue;
    if (record['kind'] !== 'data') continue;
    const dataRecord = asRecord(record['data']);
    if (dataRecord) return dataRecord;
  }

  return undefined;
}

// Metrics Tab Component
interface MetricsTabProps {
  agentId: string;
  profile: AgentProfile;
  metrics: AgentMetrics;
  fullMetrics?: AgentViewMetrics;
  events: ClmmEvent[];
  transactions: Transaction[];
  hasLoadedView: boolean;
}

function MetricsTab({ agentId, profile, metrics, fullMetrics, events, transactions, hasLoadedView }: MetricsTabProps) {
  if (agentId === 'agent-gmx-allora') {
    return (
      <GmxAlloraMetricsTab
        profile={profile}
        metrics={metrics}
        fullMetrics={fullMetrics}
        events={events}
        transactions={transactions}
      />
    );
  }

  if (agentId === 'agent-pendle') {
    return (
      <PendleMetricsTab
        profile={profile}
        metrics={metrics}
        fullMetrics={fullMetrics}
        events={events}
        transactions={transactions}
        hasLoadedView={hasLoadedView}
      />
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

  const formatDuration = (startTimestamp?: string, endTimestamp?: string) => {
    if (!startTimestamp || !endTimestamp) return '—';
    const start = new Date(startTimestamp).getTime();
    if (Number.isNaN(start)) return '—';
    const end = new Date(endTimestamp).getTime();
    if (Number.isNaN(end)) return '—';
    const deltaMs = end - start;
    if (deltaMs <= 0) return '—';
    const minutes = Math.floor(deltaMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  const formatTokenAmount = (token: NonNullable<AgentViewMetrics['latestSnapshot']>['positionTokens'][number]) => {
    if (token.amount !== undefined) {
      return token.amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
    }
    if (token.amountBaseUnits) {
      return formatUnits(BigInt(token.amountBaseUnits), token.decimals);
    }
    return null;
  };

  const latestSnapshot = fullMetrics?.latestSnapshot;
  const poolSnapshot = fullMetrics?.lastSnapshot;
  const poolName = formatPoolPair(poolSnapshot);
  const positionTokens = latestSnapshot?.positionTokens ?? [];

  return (
    <div className="space-y-6">
      {/* Profile Stats */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Your Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">APY</div>
            <div className="text-2xl font-bold text-teal-400">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-8 w-24"
                loadedClassName="text-teal-400"
                value={metrics.apy !== undefined ? `${metrics.apy.toFixed(1)}%` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">AUM</div>
            <div className="text-2xl font-bold text-white">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-8 w-28"
                loadedClassName="text-white"
                value={metrics.aumUsd !== undefined ? `$${metrics.aumUsd.toLocaleString()}` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Earned Income</div>
            <div className="text-2xl font-bold text-white">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-8 w-28"
                loadedClassName="text-white"
                value={
                  profile.agentIncome !== undefined ? `$${profile.agentIncome.toLocaleString()}` : null
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Your Position */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Your Position</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pool</div>
            <div className="text-white font-medium">{poolName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Position Size</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-24"
                loadedClassName="text-white font-medium"
                value={latestSnapshot?.totalUsd !== undefined ? `$${latestSnapshot.totalUsd.toLocaleString()}` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Opened</div>
            <div className="text-white font-medium">
              {formatDuration(latestSnapshot?.positionOpenedAt, latestSnapshot?.timestamp)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Fees (USD)</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-24"
                loadedClassName="text-white font-medium"
                value={latestSnapshot?.feesUsd !== undefined ? `$${latestSnapshot.feesUsd.toLocaleString()}` : null}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Token Amounts</div>
          {positionTokens.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {positionTokens.map((token) => (
                <div key={token.address} className="flex items-center justify-between">
                  <span className="text-gray-300">{token.symbol}</span>
                  <span className="text-white font-medium">{formatTokenAmount(token) ?? '-'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">—</div>
          )}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Iteration"
          isLoaded={hasLoadedView}
          value={metrics.iteration?.toString() ?? null}
          icon={<TrendingUp className="w-4 h-4 text-teal-400" />}
        />
        <MetricCard
          label="Cycles Since Rebalance"
          isLoaded={hasLoadedView}
          value={metrics.cyclesSinceRebalance?.toString() ?? null}
          icon={<Minus className="w-4 h-4 text-yellow-400" />}
        />
        <MetricCard
          label="Rebalance Cycles"
          isLoaded={hasLoadedView}
          value={metrics.rebalanceCycles?.toString() ?? null}
          icon={<RefreshCw className="w-4 h-4 text-blue-400" />}
        />
        <MetricCard
          label="Previous Price"
          isLoaded={hasLoadedView}
          value={fullMetrics?.previousPrice?.toFixed(6) ?? null}
          icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
        />
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
                <LoadingValue
                  isLoaded={hasLoadedView}
                  skeletonClassName="h-5 w-24"
                  loadedClassName="text-white font-medium"
                  value={fullMetrics.latestCycle.midPrice?.toFixed(6) ?? null}
                />
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

function toArbiscanTxUrl(txHash: string) {
  return `https://arbiscan.io/tx/${txHash}`;
}

type GmxAlloraMetricsTabProps = Pick<
  MetricsTabProps,
  'profile' | 'metrics' | 'fullMetrics' | 'events' | 'transactions'
>;

function GmxAlloraMetricsTab({
  profile,
  metrics,
  fullMetrics,
  events,
  transactions,
}: GmxAlloraMetricsTabProps) {
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

  const formatUsd = (value?: number, maxFractionDigits = 2): string => {
    if (value === undefined) return '—';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })}`;
  };

  const latestCycle = fullMetrics?.latestCycle;
  const latestSnapshot = fullMetrics?.latestSnapshot;
  const latestPrediction = latestCycle?.prediction;
  const latestDecisionMetrics = latestCycle?.metrics;
  const latestTransaction = transactions.at(-1);

  let latestExecutionData: UnknownRecord | undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || event.type !== 'artifact') continue;
    if (getArtifactId(event.artifact) !== 'gmx-allora-execution-result') continue;
    latestExecutionData = getArtifactDataPart(event.artifact);
    break;
  }

  const artifactTxHashes =
    getArrayField(latestExecutionData, 'txHashes')
      ?.filter((value): value is string => typeof value === 'string')
      .filter((value) => /^0x[0-9a-fA-F]{64}$/.test(value)) ?? [];

  const executionHashCandidates = [
    ...artifactTxHashes,
    getStringField(latestExecutionData, 'lastTxHash'),
    latestTransaction?.txHash,
    latestCycle?.txHash,
  ];

  const executionTxHashes = Array.from(
    new Set(
      executionHashCandidates.filter(
        (value): value is string =>
          typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value),
      ),
    ),
  );

  const executionOk = getBooleanField(latestExecutionData, 'ok');
  const executionError = getStringField(latestExecutionData, 'error');
  const executionResultStatusRaw = getStringField(latestExecutionData, 'status');
  const executionResultStatus =
    executionResultStatusRaw === 'confirmed' ||
    executionResultStatusRaw === 'failed' ||
    executionResultStatusRaw === 'blocked'
      ? executionResultStatusRaw
      : undefined;
  const executionStatus =
    executionResultStatus === 'blocked'
      ? 'pending'
      : executionResultStatus === 'confirmed'
      ? 'confirmed'
      : executionResultStatus === 'failed'
        ? 'failed'
        : executionOk === true
          ? 'confirmed'
          : executionOk === false
            ? 'failed'
            : latestTransaction?.status === 'success'
              ? 'confirmed'
              : latestTransaction?.status === 'failed'
                ? 'failed'
                : 'pending';

  const marketLabel = latestCycle?.marketSymbol ?? formatPoolPair(fullMetrics?.lastSnapshot);
  const sideLabel = latestCycle?.side ? latestCycle.side.toUpperCase() : '—';

  const displayedLeverage = latestCycle?.leverage ?? latestSnapshot?.leverage;
  const displayedNotionalUsd = latestCycle?.sizeUsd ?? latestSnapshot?.totalUsd;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Strategy Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">APY</div>
            <div className="text-2xl font-bold text-teal-400">
              {metrics.apy !== undefined
                ? `${metrics.apy.toFixed(1)}%`
                : profile.apy !== undefined
                  ? `${profile.apy.toFixed(1)}%`
                  : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">AUM</div>
            <div className="text-2xl font-bold text-white">
              {metrics.aumUsd !== undefined
                ? formatUsd(metrics.aumUsd)
                : profile.aum !== undefined
                  ? formatUsd(profile.aum)
                  : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Agent Income</div>
            <div className="text-2xl font-bold text-white">
              {profile.agentIncome !== undefined ? formatUsd(profile.agentIncome) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">PnL</div>
            <div className="text-2xl font-bold text-white">
              {metrics.lifetimePnlUsd !== undefined ? formatUsd(metrics.lifetimePnlUsd) : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Latest Execution</h3>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              executionStatus === 'confirmed'
                ? 'bg-teal-500/20 text-teal-400'
                : executionStatus === 'failed'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {executionStatus}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Action</div>
            <div className="text-white font-medium">{latestCycle?.action ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Market</div>
            <div className="text-white font-medium">{marketLabel}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Position Side</div>
            <div className="text-white font-medium">{sideLabel}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Executed At</div>
            <div className="text-white font-medium">
              {formatDate(latestTransaction?.timestamp ?? latestCycle?.timestamp)}
            </div>
          </div>
        </div>
        {executionError ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {executionError}
          </div>
        ) : null}
        <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Transaction Hashes</div>
          {executionTxHashes.length > 0 ? (
            <div className="space-y-2">
              {executionTxHashes.map((txHash) => (
                <a
                  key={txHash}
                  href={toArbiscanTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-blue-300 hover:text-blue-200 underline underline-offset-2 truncate"
                >
                  {txHash}
                </a>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">No transaction hash yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Perp Position + Allora Signal</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Position Size</div>
            <div className="text-white font-medium">{formatUsd(latestSnapshot?.totalUsd)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Leverage</div>
            <div className="text-white font-medium">
              {displayedLeverage !== undefined ? `${displayedLeverage.toFixed(1)}x` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notional</div>
            <div className="text-white font-medium">{formatUsd(displayedNotionalUsd)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Signal Confidence</div>
            <div className="text-white font-medium">
              {latestPrediction?.confidence !== undefined
                ? `${(latestPrediction.confidence * 100).toFixed(1)}%`
                : '—'}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#2a2a2a] grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cycle</div>
            <div className="text-white font-medium">{metrics.iteration ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cycles Since Trade</div>
            <div className="text-white font-medium">{metrics.cyclesSinceRebalance ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Stale Signal Cycles</div>
            <div className="text-white font-medium">{metrics.staleCycles ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Decision Threshold</div>
            <div className="text-white font-medium">
              {latestDecisionMetrics?.decisionThreshold !== undefined
                ? `${(latestDecisionMetrics.decisionThreshold * 100).toFixed(1)}%`
                : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendleMetricsTab({
  profile,
  metrics,
  fullMetrics,
  events,
  hasLoadedView,
}: Omit<MetricsTabProps, 'agentId'>) {
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

  const formatUsd = (value?: number) => {
    if (value === undefined) return null;
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  };

  const formatTokenAmount = (params: {
    amountBaseUnits?: string;
    decimals: number;
    fallbackRaw?: string;
  }): string | null => {
    const { amountBaseUnits, decimals, fallbackRaw } = params;
    if (!amountBaseUnits) {
      return fallbackRaw ?? null;
    }
    try {
      const formatted = formatUnits(BigInt(amountBaseUnits), decimals);
      const [whole, fraction] = formatted.split('.');
      if (!fraction) return whole;
      return `${whole}.${fraction.slice(0, 6)}`; // keep UI compact
    } catch {
      return fallbackRaw ?? null;
    }
  };

  const strategy = fullMetrics?.pendle;
  const latestCycle = fullMetrics?.latestCycle;
  const latestSnapshot = fullMetrics?.latestSnapshot;
  const snapshot = latestSnapshot?.pendle;
  const snapshotTokens = latestSnapshot?.positionTokens ?? [];

  const ptSymbol = snapshot?.ptSymbol ?? strategy?.position?.ptSymbol;
  const ytSymbol = snapshot?.ytSymbol ?? strategy?.position?.ytSymbol;
  const ptToken = ptSymbol ? snapshotTokens.find((token) => token.symbol === ptSymbol) : undefined;
  const ytToken = ytSymbol ? snapshotTokens.find((token) => token.symbol === ytSymbol) : undefined;

  const rewardLines = strategy?.position?.claimableRewards ?? [];
  const impliedYieldPct = snapshot?.impliedApyPct ?? strategy?.currentApy ?? metrics.apy;
  const apyDetails = [
    { label: 'Implied', value: snapshot?.impliedApyPct },
    { label: 'Aggregated', value: snapshot?.aggregatedApyPct },
    { label: 'Underlying', value: snapshot?.underlyingApyPct },
    { label: 'Swap Fee', value: snapshot?.swapFeeApyPct },
    { label: 'Pendle', value: snapshot?.pendleApyPct },
    { label: 'YT Float', value: snapshot?.ytFloatingApyPct },
    { label: 'Max Boost', value: snapshot?.maxBoostedApyPct },
  ].filter((entry) => entry.value !== undefined);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Strategy</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Target YT</div>
            <div className="text-white font-medium">{strategy?.ytSymbol ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Underlying</div>
            <div className="text-white font-medium">{strategy?.underlyingSymbol ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current APY</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-20"
                loadedClassName="text-white font-medium"
                value={strategy?.currentApy !== undefined ? `${strategy.currentApy.toFixed(2)}%` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Contribution</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-24"
                loadedClassName="text-white font-medium"
                value={
                  strategy?.baseContributionUsd !== undefined
                    ? `$${strategy.baseContributionUsd.toLocaleString()}`
                    : null
                }
              />
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#2a2a2a] grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Maturity</div>
            <div className="text-white font-medium">{strategy?.maturity ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Best APY</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-20"
                loadedClassName="text-white font-medium"
                value={strategy?.bestApy !== undefined ? `${strategy.bestApy.toFixed(2)}%` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Delta</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-20"
                loadedClassName="text-white font-medium"
                value={strategy?.apyDelta !== undefined ? `${strategy.apyDelta.toFixed(2)}%` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Funding Token</div>
            <div className="text-white font-medium">
              {strategy?.fundingTokenAddress ? strategy.fundingTokenAddress.slice(0, 10) + '…' : '—'}
            </div>
          </div>
        </div>

        {apyDetails.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">APY Details</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {apyDetails.map((entry) => (
                  <div key={entry.label}>
                    <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">{entry.label}</div>
                    <div className="text-white font-medium">
                      <LoadingValue
                        isLoaded={hasLoadedView}
                        skeletonClassName="h-5 w-20"
                        loadedClassName="text-white font-medium"
                        value={entry.value !== undefined ? `${entry.value.toFixed(2)}%` : null}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Position</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">PT</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-28"
                loadedClassName="text-white font-medium"
                value={
                  ptSymbol
                    ? `${ptSymbol} ${
                        formatTokenAmount({
                          amountBaseUnits: ptToken?.amountBaseUnits,
                          decimals: ptToken?.decimals ?? 18,
                          fallbackRaw: strategy?.position?.ptAmount,
                        }) ?? '-'
                      }`.trim()
                    : null
                }
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">YT</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-28"
                loadedClassName="text-white font-medium"
                value={
                  ytSymbol
                    ? `${ytSymbol} ${
                        formatTokenAmount({
                          amountBaseUnits: ytToken?.amountBaseUnits,
                          decimals: ytToken?.decimals ?? 18,
                          fallbackRaw: strategy?.position?.ytAmount,
                        }) ?? '-'
                      }`.trim()
                    : null
                }
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Implied Yield</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-20"
                loadedClassName="text-white font-medium"
                value={impliedYieldPct !== undefined ? `${impliedYieldPct.toFixed(2)}%` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Position Value</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-24"
                loadedClassName="text-white font-medium"
                value={formatUsd(latestSnapshot?.totalUsd)}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net PnL</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-32"
                loadedClassName="text-white font-medium"
                value={
                  snapshot?.netPnlUsd !== undefined ? (
                    <>
                      {formatUsd(snapshot.netPnlUsd)}
                      {snapshot.netPnlPct !== undefined && (
                        <span className="text-gray-400">{` (${snapshot.netPnlPct.toFixed(2)}%)`}</span>
                      )}
                    </>
                  ) : null
                }
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">APY</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-20"
                loadedClassName="text-white font-medium"
                value={metrics.apy !== undefined ? `${metrics.apy.toFixed(2)}%` : null}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">AUM</div>
            <div className="text-white font-medium">
              <LoadingValue
                isLoaded={hasLoadedView}
                skeletonClassName="h-5 w-24"
                loadedClassName="text-white font-medium"
                value={metrics.aumUsd !== undefined ? `$${metrics.aumUsd.toLocaleString()}` : null}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Claimable Rewards</div>
          {rewardLines.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rewardLines.map((reward) => (
                <div key={reward.symbol} className="flex items-center justify-between">
                  <span className="text-gray-300">{reward.symbol}</span>
                  <span className="text-white font-medium">{reward.amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">—</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Iteration"
          isLoaded={hasLoadedView}
          value={metrics.iteration?.toString() ?? null}
          icon={<TrendingUp className="w-4 h-4 text-teal-400" />}
        />
        <MetricCard
          label="Cycles Since Rotation"
          isLoaded={hasLoadedView}
          value={metrics.cyclesSinceRebalance?.toString() ?? null}
          icon={<Minus className="w-4 h-4 text-yellow-400" />}
        />
        <MetricCard
          label="Best APY"
          isLoaded={hasLoadedView}
          value={strategy?.bestApy !== undefined ? `${strategy.bestApy.toFixed(2)}%` : null}
          icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
        />
        <MetricCard
          label="APY Delta"
          isLoaded={hasLoadedView}
          value={strategy?.apyDelta !== undefined ? `${strategy.apyDelta.toFixed(2)}%` : null}
          icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
        />
      </div>

      {latestCycle && (
        <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Latest Cycle</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cycle</div>
              <div className="text-white font-medium">{latestCycle.cycle}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Action</div>
              <div className="text-white font-medium">{latestCycle.action}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">APY</div>
              <div className="text-white font-medium">
                <LoadingValue
                  isLoaded={hasLoadedView}
                  skeletonClassName="h-5 w-20"
                  loadedClassName="text-white font-medium"
                  value={latestCycle.apy !== undefined ? `${latestCycle.apy.toFixed(2)}%` : null}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Timestamp</div>
              <div className="text-white font-medium">{formatDate(latestCycle.timestamp)}</div>
            </div>
          </div>
          {latestCycle.reason && (
            <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reason</div>
              <div className="text-gray-300 text-sm">{latestCycle.reason}</div>
            </div>
          )}
        </div>
      )}

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
  value: string | null;
  isLoaded: boolean;
  icon: React.ReactNode;
}

function MetricCard({ label, value, isLoaded, icon }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-semibold text-white">
        <LoadingValue
          isLoaded={isLoaded}
          skeletonClassName="h-6 w-20"
          loadedClassName="text-white"
          value={value}
        />
      </div>
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

    const trimmedAmount = localAmount.trim();
    const parsedAmount =
      trimmedAmount === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < MIN_BASE_CONTRIBUTION_USD) {
      return;
    }

    setIsSaving(true);
    if (trimmedAmount === '') {
      setLocalAmount(`${MIN_BASE_CONTRIBUTION_USD}`);
    }
    onSettingsChange({ amount: parsedAmount });
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
              placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
              min={MIN_BASE_CONTRIBUTION_USD}
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

export const __agentDetailPageTestOnly = {
  TransactionHistoryTab,
  AgentBlockersTab,
  TagColumn,
  PointsColumn,
  MetricsTab,
  GmxAlloraMetricsTab,
  PendleMetricsTab,
  SettingsTab,
};
