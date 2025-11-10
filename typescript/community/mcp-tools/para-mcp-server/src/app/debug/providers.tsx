"use client";

import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";
import { wagmiConfig } from "./config";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "#FF6B35",
          accentColorForeground: "#fff",
        })}
        initialChain={baseSepolia}
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
