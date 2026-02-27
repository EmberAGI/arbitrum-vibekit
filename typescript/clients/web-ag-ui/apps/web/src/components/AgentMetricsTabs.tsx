import type { ReactNode } from 'react';
import { Minus, RefreshCw, TrendingUp } from 'lucide-react';
import { formatUnits } from 'viem';

import type {
  AgentMetrics,
  AgentProfile,
  AgentViewMetrics,
  ClmmEvent,
  Transaction,
} from '../types/agent';
import { formatPoolPair } from '../utils/poolFormat';
import { LoadingValue } from './ui/LoadingValue';
import { resolveMetricsRendererId } from './agentMetricsRegistry';

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
export interface MetricsTabProps {
  agentId: string;
  profile: AgentProfile;
  metrics: AgentMetrics;
  fullMetrics?: AgentViewMetrics;
  events: ClmmEvent[];
  transactions: Transaction[];
  hasLoadedView: boolean;
}

export function MetricsTab({ agentId, profile, metrics, fullMetrics, events, transactions, hasLoadedView }: MetricsTabProps) {
  const rendererId = resolveMetricsRendererId(agentId);
  if (rendererId === 'agent-gmx-allora') {
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

  if (rendererId === 'agent-pendle') {
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

export function GmxAlloraMetricsTab({
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

export function PendleMetricsTab({
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

    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | null;
  isLoaded: boolean;
  icon: ReactNode;
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
