"use client";

import { paraConnector } from "@getpara/wagmi-v2-integration";
import Para, { Environment } from "@getpara/web-sdk";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { baseAccount } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { arbitrumSepolia, baseSepolia } from "wagmi/chains";

const API_KEY = process.env.NEXT_PUBLIC_PARA_API_KEY || "";

// Initialize Para client
const para = new Para(Environment.BETA, API_KEY);

// Create QueryClient
export const queryClient = new QueryClient();

// Create Para connector
const paraWagmiConnector = paraConnector({
  para,
  chains: [baseSepolia, arbitrumSepolia],
  appName: "Para MCP Server",
  queryClient, // Required for alpha version
  options: {},
  oAuthMethods: [], // Empty array disables all OAuth methods (Google, X, etc.)
  disablePhoneLogin: true, // Disable phone login, only allow email
});

// Create RainbowKit wallet connectors (Base Account SDK only)
const rainbowKitConnectors = connectorsForWallets(
  [
    {
      groupName: "Smart Wallet",
      wallets: [baseAccount],
    },
  ],
  {
    appName: "Para MCP Server",
    projectId:
      process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "dummy-project-id",
  },
);

export const wagmiConfig = createConfig({
  chains: [baseSepolia, arbitrumSepolia],
  connectors: [
    paraWagmiConnector as any, // Para social login
    ...rainbowKitConnectors, // RainbowKit popular wallets (includes Base Account SDK)
  ],
  transports: {
    // Use custom RPC URLs if provided, otherwise fallback to public (may have rate limits)
    [baseSepolia.id]: http(
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
        "https://sepolia.base.org",
    ),
    [arbitrumSepolia.id]: http(
      process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ||
        "https://sepolia-rollup.arbitrum.io/rpc",
    ),
  },
});
