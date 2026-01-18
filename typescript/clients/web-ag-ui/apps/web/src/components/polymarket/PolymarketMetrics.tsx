'use client';

import { TrendingUp, TrendingDown, Activity, Target, DollarSign, Clock } from 'lucide-react';

export interface PolymarketAgentMetrics {
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
}

export interface PolymarketStrategyConfig {
  minSpreadThreshold: number;
  minPositionSizeUsd?: number; // Minimum order size (default: $1)
  maxPositionSizeUsd: number;
  portfolioRiskPct: number;
  pollIntervalMs: number;
  maxTotalExposureUsd: number;
}

interface PolymarketMetricsProps {
  metrics: PolymarketAgentMetrics;
  config: PolymarketStrategyConfig;
  portfolioValueUsd?: number;
  intraMarketCount?: number;
  crossMarketCount?: number;
}

export function PolymarketMetrics({
  metrics,
  config,
  portfolioValueUsd = 0,
  intraMarketCount = 0,
  crossMarketCount = 0,
}: PolymarketMetricsProps) {
  const formatCurrency = (value: number) => {
    const abs = Math.abs(value);
    const prefix = value < 0 ? '-' : value > 0 ? '+' : '';
    return `${prefix}$${abs.toFixed(2)}`;
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const successRate =
    metrics.tradesExecuted > 0
      ? ((metrics.tradesExecuted - metrics.tradesFailed) / metrics.tradesExecuted) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1e1e1e] to-[#252525] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-teal-400" />
          Portfolio Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Portfolio Value</div>
            <div className="text-2xl font-bold text-white">
              ${portfolioValueUsd.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total P&L</div>
            <div
              className={`text-2xl font-bold ${
                metrics.totalPnl >= 0 ? 'text-teal-400' : 'text-red-400'
              }`}
            >
              {formatCurrency(metrics.totalPnl)}
            </div>
          </div>
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Realized P&L</div>
            <div
              className={`text-xl font-semibold ${
                metrics.realizedPnl >= 0 ? 'text-teal-400' : 'text-red-400'
              }`}
            >
              {formatCurrency(metrics.realizedPnl)}
            </div>
          </div>
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Unrealized P&L</div>
            <div
              className={`text-xl font-semibold ${
                metrics.unrealizedPnl >= 0 ? 'text-yellow-400' : 'text-red-400'
              }`}
            >
              {formatCurrency(metrics.unrealizedPnl)}
            </div>
          </div>
        </div>
      </div>

      {/* Trading Activity */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Trading Activity
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Poll Cycles"
            value={metrics.iteration.toString()}
            icon={<TrendingUp className="w-4 h-4 text-teal-400" />}
          />
          <MetricCard
            label="Active Positions"
            value={metrics.activePositions.toString()}
            icon={<Target className="w-4 h-4 text-purple-400" />}
          />
          <MetricCard
            label="Trades Executed"
            value={metrics.tradesExecuted.toString()}
            icon={<TrendingUp className="w-4 h-4 text-green-400" />}
            subValue={metrics.tradesFailed > 0 ? `${metrics.tradesFailed} failed` : undefined}
            subValueColor="text-red-400"
          />
          <MetricCard
            label="Success Rate"
            value={`${successRate.toFixed(1)}%`}
            icon={
              successRate >= 90 ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : successRate >= 70 ? (
                <Activity className="w-4 h-4 text-yellow-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )
            }
          />
        </div>
      </div>

      {/* Opportunity Stats */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-orange-400" />
          Arbitrage Performance
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Total Opportunities
            </div>
            <div className="text-2xl font-bold text-white">{metrics.opportunitiesFound}</div>
          </div>
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Intra-Market
            </div>
            <div className="text-2xl font-bold text-blue-400">{intraMarketCount}</div>
          </div>
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Cross-Market
            </div>
            <div className="text-2xl font-bold text-purple-400">{crossMarketCount}</div>
          </div>
          <div className="rounded-xl bg-[#121212] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Executed
            </div>
            <div className="text-2xl font-bold text-teal-400">{metrics.opportunitiesExecuted}</div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics.opportunitiesFound > 0
                ? `${((metrics.opportunitiesExecuted / metrics.opportunitiesFound) * 100).toFixed(1)}% rate`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Strategy Configuration */}
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Strategy Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <ConfigItem
            label="Min Spread"
            value={`${(config.minSpreadThreshold * 100).toFixed(1)}%`}
          />
          <ConfigItem label="Max Position" value={`$${config.maxPositionSizeUsd}`} />
          <ConfigItem label="Risk/Trade" value={`${config.portfolioRiskPct}%`} />
          <ConfigItem label="Poll Interval" value={`${config.pollIntervalMs / 1000}s`} />
          <ConfigItem label="Max Exposure" value={`$${config.maxTotalExposureUsd}`} />
        </div>
      </div>

      {/* Last Poll Time */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <Clock className="w-4 h-4" />
        <span>Last poll: {formatTime(metrics.lastPoll)}</span>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  subValue?: string;
  subValueColor?: string;
}

function MetricCard({ label, value, icon, subValue, subValueColor }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-semibold text-white">{value}</div>
      {subValue && (
        <div className={`text-xs mt-1 ${subValueColor ?? 'text-gray-500'}`}>{subValue}</div>
      )}
    </div>
  );
}

interface ConfigItemProps {
  label: string;
  value: string;
}

function ConfigItem({ label, value }: ConfigItemProps) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}
