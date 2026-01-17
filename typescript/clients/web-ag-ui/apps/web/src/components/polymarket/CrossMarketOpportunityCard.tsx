'use client';

import { ArrowRight, TrendingUp } from 'lucide-react';

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

interface CrossMarketOpportunityCardProps {
  opportunity: CrossMarketOpportunity;
}

export function CrossMarketOpportunityCard({ opportunity }: CrossMarketOpportunityCardProps) {
  const { relationship, violation, trades, expectedProfitPerShare } = opportunity;

  const getRelationshipBadgeColor = (type: string) => {
    switch (type) {
      case 'IMPLIES':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'REQUIRES':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'MUTUAL_EXCLUSION':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'EQUIVALENCE':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getConfidenceBadgeColor = (confidence?: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-600/20 text-green-400';
      case 'medium':
        return 'bg-yellow-600/20 text-yellow-400';
      case 'low':
        return 'bg-red-600/20 text-red-400';
      default:
        return 'bg-gray-600/20 text-gray-400';
    }
  };

  return (
    <div className="rounded-xl border-l-4 border-l-yellow-500 bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-all">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold">Cross-Market Arbitrage</h3>
            <span className={`px-2 py-1 rounded text-xs font-semibold border ${getRelationshipBadgeColor(relationship.type)}`}>
              {relationship.type}
            </span>
            {relationship.confidence && (
              <span className={`px-2 py-1 rounded text-xs font-semibold ${getConfidenceBadgeColor(relationship.confidence)}`}>
                {relationship.confidence}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-green-400 font-semibold">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">${expectedProfitPerShare.toFixed(3)}/share</span>
          </div>
        </div>

        {/* Market Relationship */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">BUY NO (Bet Against)</div>
              <div className="font-medium text-sm text-white truncate">{relationship.parentMarket.title}</div>
              <div className="text-lg font-semibold text-red-400">
                YES: ${relationship.parentMarket.yesPrice.toFixed(3)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                NO: ${(1.0 - relationship.parentMarket.yesPrice).toFixed(3)}
              </div>
            </div>
            <ArrowRight className="w-6 h-6 text-gray-400 flex-shrink-0" />
            <div className="flex-1 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">BUY YES (Bet For)</div>
              <div className="font-medium text-sm text-white truncate">{relationship.childMarket.title}</div>
              <div className="text-lg font-semibold text-green-400">
                YES: ${relationship.childMarket.yesPrice.toFixed(3)}
              </div>
            </div>
          </div>
        </div>

        {/* Violation Details */}
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
          <div className="text-xs font-semibold text-yellow-400 mb-1">⚠️ VIOLATION DETECTED</div>
          <div className="text-sm text-gray-300">{violation.description}</div>
          <div className="text-xs text-gray-400 mt-1">
            Severity: {(violation.severity * 100).toFixed(1)}%
          </div>
        </div>

        {/* Reasoning */}
        {relationship.reasoning && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-4">
            <div className="text-xs font-semibold text-blue-400 mb-1">💡 LOGIC</div>
            <div className="text-sm text-gray-300">{relationship.reasoning}</div>
          </div>
        )}

        {/* Trade Plan */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-400 uppercase">Execution Plan</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">
                1. Buy {trades.sellMarket.outcome === 'yes' ? 'NO' : 'YES'} (bet against)
              </span>
              <span className="font-mono text-gray-300">
                ${(1.0 - trades.sellMarket.price).toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">2. Buy {trades.buyMarket.outcome.toUpperCase()} (bet for)</span>
              <span className="font-mono text-gray-300">${trades.buyMarket.price.toFixed(4)}</span>
            </div>
            <div className="flex justify-between font-semibold text-green-400 pt-2 border-t border-[#2a2a2a]">
              <span>Expected Profit</span>
              <span>${expectedProfitPerShare.toFixed(4)}/share</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
