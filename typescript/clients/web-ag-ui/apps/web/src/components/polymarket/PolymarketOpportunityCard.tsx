'use client';

import { TrendingUp, Clock, DollarSign } from 'lucide-react';

export interface ArbitrageOpportunity {
  marketId: string;
  marketTitle: string;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  spread: number;
  profitPotential: number;
  timestamp: string;
}

interface PolymarketOpportunityCardProps {
  opportunity: ArbitrageOpportunity;
  onExecute?: () => void;
  isExecuting?: boolean;
}

export function PolymarketOpportunityCard({
  opportunity,
  onExecute,
  isExecuting = false,
}: PolymarketOpportunityCardProps) {
  const spreadPercent = (opportunity.spread * 100).toFixed(2);
  const isHotOpportunity = opportunity.spread >= 0.02;

  return (
    <div
      className={`rounded-xl p-4 transition-all ${
        isHotOpportunity
          ? 'bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/30'
          : 'bg-[#1e1e1e] border border-[#2a2a2a]'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-3">
          <h4 className="text-white font-medium text-sm leading-tight line-clamp-2">
            {opportunity.marketTitle}
          </h4>
        </div>
        {isHotOpportunity && (
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium">
            🔥 Hot
          </span>
        )}
      </div>

      {/* Prices Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-[#121212] p-2.5">
          <div className="text-xs text-gray-500 mb-1">YES Price</div>
          <div className="text-lg font-semibold text-green-400">
            ${opportunity.yesPrice.toFixed(3)}
          </div>
        </div>
        <div className="rounded-lg bg-[#121212] p-2.5">
          <div className="text-xs text-gray-500 mb-1">NO Price</div>
          <div className="text-lg font-semibold text-red-400">
            ${opportunity.noPrice.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-4 h-4 text-teal-400" />
          <span className="text-teal-400 font-medium">{spreadPercent}% spread</span>
        </div>
        <div className="flex items-center gap-1 text-gray-400">
          <DollarSign className="w-3.5 h-3.5" />
          <span className="text-xs">
            +${(opportunity.profitPotential * 100).toFixed(2)}/100
          </span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-1 mt-3 text-xs text-gray-500">
        <Clock className="w-3 h-3" />
        <span>
          {new Date(opportunity.timestamp).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Execute Button (optional) */}
      {onExecute && (
        <button
          onClick={onExecute}
          disabled={isExecuting}
          className={`w-full mt-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            isExecuting
              ? 'bg-gray-600 text-gray-300 cursor-wait'
              : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white'
          }`}
        >
          {isExecuting ? 'Executing...' : 'Execute Trade'}
        </button>
      )}
    </div>
  );
}
