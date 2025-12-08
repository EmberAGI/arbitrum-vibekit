'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StackedIcons } from '@/components/ui/StackedIcons';

interface Reward {
  type: 'points' | 'apy';
  multiplier?: number;
  percentage?: number;
  reward: string;
}

interface Chain {
  chainName: string;
  chainIconUri?: string;
}

interface Performance {
  cumlativePoints: string;
  totalValueUsd: string;
}

interface StrategyDashboardProps {
  name: string;
  curator?: string;
  description?: string;
  infoChip?: string;
  token?: string;
  chains?: Chain[];
  protocol?: string;
  tokenIconUri?: string;
  platformIconUri?: string;
  rewards?: Reward[];
  performance?: Performance;
}

export function StrategyDashboard({
  name,
  curator,
  description,
  infoChip,
  token,
  chains,
  protocol,
  tokenIconUri,
  platformIconUri,
  rewards = [],
  performance,
}: StrategyDashboardProps) {
  // Extract reward values
  const pointsReward = rewards.find((r) => r.type === 'points');
  const apyReward = rewards.find((r) => r.type === 'apy');

  return (
    <div>
      {/* Title outside card */}
      <h2 className="text-3xl font-bold text-white mb-4">{name}</h2>

      <Card className="bg-[#2a2a2a] border-[#323232] rounded-xl">
        <CardContent className="p-6 space-y-6">
          {/* Top row: Badges */}
          <div className="flex items-center justify-between">
            {/* Left: Curator and Token/Protocol badges */}
            <div className="flex gap-2">
              {curator && (
                <Badge
                  variant="secondary"
                  className="bg-[#1a1a1a] text-white border-gray-700 text-sm px-4 py-2"
                >
                  {curator}
                </Badge>
              )}
              {(token || protocol) && (
                <Badge
                  variant="secondary"
                  className="bg-[#1a1a1a] text-white border-gray-700 text-sm px-4 py-2"
                >
                  {token || protocol}
                </Badge>
              )}
              {infoChip && (
                <Badge
                  variant="secondary"
                  className="bg-[#1a1a1a] text-white border-gray-700 text-sm px-4 py-2"
                >
                  {infoChip}
                </Badge>
              )}
            </div>

            {/* Right: Chain badges */}
            {chains && chains.length > 0 && (
              <div className="flex gap-3">
                {chains.map((chain, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="bg-[#1a1a1a] text-white border-gray-700 text-sm px-4 py-2 flex items-center gap-2"
                  >
                    {chain.chainIconUri && (
                      <img
                        src={chain.chainIconUri}
                        alt={chain.chainName}
                        className="w-5 h-5 rounded-full"
                      />
                    )}
                    {chain.chainName}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Main row: Icon + Description + Stats */}
          <div className="flex items-center gap-6">
            {/* Left: Icon + Description */}
            <div className="flex items-center gap-6 flex-1">
              <StackedIcons
                primaryIconUri={platformIconUri}
                secondaryIconUri={tokenIconUri}
                primaryAlt={protocol || 'Platform'}
                secondaryAlt={token || 'Token'}
              />

              {description && (
                <div className="flex-1">
                  <p className="text-gray-400 leading-relaxed">{description}</p>
                </div>
              )}
            </div>

            {/* Right: Stats Cards */}
            <div className="flex gap-4 flex-shrink-0">
              {/* Allo Points */}
              {pointsReward && (
                <div className="rounded-lg p-4 bg-[#1a1a1a] min-w-[100px]">
                  <div className="text-sm text-gray-400 mb-2">Allo points</div>
                  <div className="text-3xl font-bold text-white">{pointsReward.multiplier}x</div>
                </div>
              )}

              {/* APR */}
              {apyReward && (
                <div className="rounded-lg p-4 bg-[#1a1a1a] min-w-[100px]">
                  <div className="text-sm text-gray-400 mb-2">APR</div>
                  <div className="text-3xl font-bold text-white">{apyReward.percentage}%</div>
                </div>
              )}

              {/* Performance */}
              {performance && (
                <div className="rounded-lg p-4 bg-[#1a1a1a] min-w-[240px]">
                  <div className="text-sm text-gray-400 mb-2">Performance Since Enabled</div>
                  <div className="text-xl font-bold text-white">
                    <span>+{performance.cumlativePoints} Allo</span>{' '}
                    <span className="text-green-400">+${performance.totalValueUsd}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
