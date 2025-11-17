'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import { WalletConnectMoment } from './strategyInput/walletConnectMoment';
import { StrategyConfigMoment } from './strategyInput/strategyConfigMoment';

interface Reward {
  type: 'points' | 'apy';
  multiplier?: number;
  percentage?: number;
  label: string;
}

interface Chain {
  chainName: string;
  chainIconUri?: string;
}

interface StrategyInputDisplayProps {
  name: string;
  subtitle?: string;
  token?: string;
  chains?: Chain[];
  protocol?: string;
  tokenIconUri?: string;
  platformIconUri?: string;
  rewards?: Reward[];
  onUserAction?: (data: any) => Promise<void>;
}

export type StrategyInputMoment = 'walletConnect' | 'walletUpgrade' | 'strategyConfig';

export function StrategyInputDisplay({
  name,
  subtitle,
  protocol,
  tokenIconUri,
  platformIconUri,
  rewards = [],
  chains,
  onUserAction,
}: StrategyInputDisplayProps) {
  const { isConnected } = useAccount();

  // Convert rewards to match the expected interface
  const convertedRewards = rewards.map((reward) => ({
    type: reward.type,
    multiplier: reward.multiplier,
    percentage: reward.percentage,
    label: reward.label || '',
  }));

  // Determine which moment to show
  switch (true) {
    case !isConnected:
      return (
        <WalletConnectMoment
          name={name}
          subtitle={subtitle}
          protocol={protocol}
          tokenIconUri={tokenIconUri}
          platformIconUri={platformIconUri}
          rewards={convertedRewards}
          chains={chains}
        />
      );

    case isConnected:
      return (
        <StrategyConfigMoment
          name={name}
          subtitle={subtitle}
          protocol={protocol}
          tokenIconUri={tokenIconUri}
          platformIconUri={platformIconUri}
          rewards={convertedRewards}
          chains={chains}
          onUserAction={onUserAction}
        />
      );

    default:
      // Fallback to wallet connect moment
      return (
        <WalletConnectMoment
          name={name}
          subtitle={subtitle}
          protocol={protocol}
          tokenIconUri={tokenIconUri}
          platformIconUri={platformIconUri}
          rewards={convertedRewards}
          chains={chains}
        />
      );
  }
}
