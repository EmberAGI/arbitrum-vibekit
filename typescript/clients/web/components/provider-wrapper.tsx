"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  darkTheme,
  getDefaultConfig,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import {
  cookieStorage,
  cookieToInitialState,
  createStorage,
  WagmiProvider,
} from "wagmi";
import { mainnet, polygon, optimism, arbitrum, base } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import React, { useMemo } from "react";

export function ProviderWrapper({ children }: { children: React.ReactNode }) {
  const config = useMemo(
    () =>
      getDefaultConfig({
        appName: "My RainbowKit App",
        projectId: "4b49e5e63b9f6253943b470873b47208",
        chains: [mainnet, polygon, optimism, arbitrum, base],
        ssr: true, // If your dApp uses server side rendering (SSR)
        storage: createStorage({ storage: cookieStorage }),
      }),
    []
  );

  const queryClient = useMemo(() => new QueryClient(), []);
  const cookie = cookieStorage.getItem("wagmi.storage") || "";
  const initialState = useMemo(
    () => cookieToInitialState(config, cookie),
    [config, cookie]
  );

  return (
    <>
      <WagmiProvider
        config={config}
        reconnectOnMount={true}
        initialState={initialState}
      >
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: "#FF7224",
              accentColorForeground: "#fff",
            })}
          >
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}
