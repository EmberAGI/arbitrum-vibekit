"use client";

import React from "react";
import { useAccount } from "wagmi";
import { WalletConnectMoment } from "./strategyInput/walletConnectMoment";
import { WalletUpgradeMoment } from "./strategyInput/walletUpgradeMoment";
import { StrategyConfigMoment } from "./strategyInput/strategyConfigMoment";
import { useUpgradeToSmartAccount } from "../../hooks/useUpgradeToSmartAccount";

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

export type StrategyInputMoment =
  | "walletConnect"
  | "walletUpgrade"
  | "strategyConfig";

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
  const { address, isConnected } = useAccount();
  const { isDeployed, isLoading } = useUpgradeToSmartAccount();

  // Convert rewards to match the expected interface
  const convertedRewards = rewards.map((reward) => ({
    type: reward.type,
    multiplier: reward.multiplier,
    percentage: reward.percentage,
    label: reward.label || "",
  }));

  // Show loading state while checking deployment status
  if (isConnected && isLoading) {
    return (
      <WalletConnectMoment
        name={name}
        subtitle="Checking wallet status..."
        protocol={protocol}
        tokenIconUri={tokenIconUri}
        platformIconUri={platformIconUri}
        rewards={convertedRewards}
        chains={chains}
      />
    );
  }

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

    case isConnected && isDeployed === false:
      return (
        <WalletUpgradeMoment
          name={name}
          subtitle={subtitle}
          protocol={protocol}
          tokenIconUri={tokenIconUri}
          platformIconUri={platformIconUri}
          rewards={convertedRewards}
          chains={chains}
        />
      );

    case isConnected && isDeployed === true:
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
