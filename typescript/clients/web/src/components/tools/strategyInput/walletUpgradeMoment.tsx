"use client";

import React from "react";
import { StrategyInfo } from "./StrategyInfo";
import { useUpgradeToSmartAccount } from "../../../hooks/useUpgradeToSmartAccount";

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

interface WalletUpgradeMomentProps {
  name: string;
  subtitle?: string;
  protocol?: string;
  tokenIconUri?: string;
  platformIconUri?: string;
  rewards?: Reward[];
  chains?: Chain[];
}

export function WalletUpgradeMoment({
  name,
  subtitle,
  protocol,
  tokenIconUri,
  platformIconUri,
  rewards = [],
  chains = [],
}: WalletUpgradeMomentProps) {
  const { isDeployed, isLoading } = useUpgradeToSmartAccount();

  return (
    <StrategyInfo
      name={name}
      subtitle={subtitle}
      protocol={protocol}
      tokenIconUri={tokenIconUri}
      platformIconUri={platformIconUri}
      primaryIconUri={platformIconUri}
      secondaryIconUri={tokenIconUri}
      primaryAlt={protocol || "Platform"}
      secondaryAlt={name || "Token"}
      rewards={rewards}
      chains={chains}
    >
      <div className="flex-1 space-y-4">
        {isLoading ? (
          <div className="w-full text-center text-gray-400 font-medium py-3">
            Checking wallet status...
          </div>
        ) : isDeployed ? (
          <div className="w-full text-center text-green-400 font-medium py-3">
            ✓ Wallet is ready for delegations
          </div>
        ) : (
          <div className="w-full bg-orange-950/30 border border-orange-800/50 rounded-lg p-4 text-center">
            <div className="text-orange-400 font-medium mb-2">
              Wallet Upgrade Required
            </div>
            <div className="text-sm text-gray-400 leading-relaxed">
              Your wallet needs to be upgraded to a smart contract wallet to use
              delegations. Please upgrade your wallet through MetaMask or
              another compatible provider to continue.
            </div>
          </div>
        )}

        {/* Upgrade Explanation */}
        <div className="text-xs text-gray-500 text-center">
          Smart contract wallets enable secure delegation signing for advanced
          DeFi strategies
        </div>
      </div>
    </StrategyInfo>
  );
}
