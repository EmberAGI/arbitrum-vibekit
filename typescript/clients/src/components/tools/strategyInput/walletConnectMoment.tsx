"use client";

import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { StrategyInfo } from "./StrategyInfo";

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

interface WalletConnectMomentProps {
  name: string;
  subtitle?: string;
  protocol?: string;
  tokenIconUri?: string;
  platformIconUri?: string;
  rewards?: Reward[];
  chains?: Chain[];
}

export function WalletConnectMoment({
  name,
  subtitle,
  protocol,
  tokenIconUri,
  platformIconUri,
  rewards = [],
  chains = [],
}: WalletConnectMomentProps) {
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
      <ConnectButton.Custom>
        {({ account, chain, openConnectModal, mounted }) => {
          const ready = mounted;
          const connected = ready && account && chain;

          return (
            <div
              {...(!ready && {
                "aria-hidden": true,
                style: {
                  opacity: 0,
                  pointerEvents: "none",
                  userSelect: "none",
                },
              })}
            >
              {(() => {
                if (!connected) {
                  return (
                    <button
                      onClick={openConnectModal}
                      className="w-full bg-[#FD6731] hover:bg-[#FD6731]/90 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Connect Wallet
                    </button>
                  );
                }

                return (
                  <div className="w-full text-center text-green-400 font-medium py-3">
                    ✓ Wallet Connected
                  </div>
                );
              })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
    </StrategyInfo>
  );
}
