"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StackedIcons } from "../../ui/StackedIcons";

interface Reward {
  type: "points" | "apy";
  multiplier?: number;
  percentage?: number;
  label: string;
}

interface Chain {
  chainName: string;
  chainIconUri?: string;
}

interface StrategyInfoProps {
  name: string;
  subtitle?: string;
  protocol?: string;
  tokenIconUri?: string;
  platformIconUri?: string;
  primaryIconUri?: string;
  secondaryIconUri?: string;
  primaryAlt?: string;
  secondaryAlt?: string;
  rewards?: Reward[];
  chains?: Chain[];
  children: React.ReactNode;
}

export function StrategyInfo({
  name,
  subtitle,
  protocol,
  tokenIconUri,
  platformIconUri,
  primaryIconUri,
  secondaryIconUri,
  primaryAlt,
  secondaryAlt,
  rewards = [],
  chains = [],
  children,
}: StrategyInfoProps) {
  // Extract reward values
  const pointsReward = rewards.find(r => r.type === 'points');
  const apyReward = rewards.find(r => r.type === 'apy');

  return (
    <Card className="bg-[#2a2a2a] border-[#323232] rounded-xl overflow-hidden w-full component-fade-in">
      <CardContent className="p-6 space-y-6">
        {/* Row 1: StackedIcons + Title/Subtitle (left) → Rewards (right) */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: StackedIcons + Title/Subtitle */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <StackedIcons
              primaryIconUri={primaryIconUri}
              secondaryIconUri={secondaryIconUri}
              primaryAlt={primaryAlt || protocol || "Platform"}
              secondaryAlt={secondaryAlt || name || "Token"}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white mb-1">{name}</h3>
              {(subtitle || protocol) && (
                <p className="text-sm text-gray-400">
                  by {subtitle || protocol}
                </p>
              )}
            </div>
          </div>

          {/* Right: Reward stat cards */}
          {rewards.length > 0 && (
            <div className="flex gap-4 flex-shrink-0">
              {/* Allo Points */}
              {pointsReward && (
                <div className="rounded-lg p-4 bg-[#1a1a1a] min-w-[120px]">
                  <div className="text-sm text-gray-400 mb-2">{pointsReward.label}</div>
                  <div className="text-3xl font-bold text-white">
                    {pointsReward.multiplier}x
                  </div>
                </div>
              )}

              {/* APR */}
              {apyReward && (
                <div className="rounded-lg p-4 bg-[#1a1a1a] min-w-[120px]">
                  <div className="text-sm text-gray-400 mb-2">{apyReward.label}</div>
                  <div className="text-3xl font-bold text-white">
                    {apyReward.percentage}%
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Chain badges and action element */}
        <div className="space-y-4">
          {/* Chain badges */}
          {chains && chains.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {chains.map((chain, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="bg-[#1a1a1a] text-white border-gray-700 text-sm px-3 py-1 flex items-center gap-2"
                >
                  {chain.chainIconUri && (
                    <img
                      src={chain.chainIconUri}
                      alt={chain.chainName}
                      className="w-4 h-4 rounded-full"
                    />
                  )}
                  {chain.chainName}
                </Badge>
              ))}
            </div>
          )}

          {/* Action section - provided as children */}
          <div className="w-full">
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
