import { http, createConfig } from "wagmi";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  baseSepolia,
} from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  baseAccount,
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { paraConnector } from "@getpara/wagmi-v2-integration";
import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";

// Chains configuration - exported for use in components
export const CHAINS = [
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  baseSepolia,
] as const;

// Initialize Para client for wagmi connector
const para = new Para(
  process.env.NEXT_PUBLIC_PARA_ENVIRONMENT === "PRODUCTION"
    ? Environment.PRODUCTION
    : Environment.BETA,
  process.env.NEXT_PUBLIC_PARA_API_KEY || "",
);

// Create QueryClient for Para connector
const queryClient = new QueryClient();

// Create Para connector for wagmi
const paraWagmiConnector = paraConnector({
  para,
  queryClient,
  chains: [arbitrum, base, mainnet, optimism, polygon, baseSepolia],
  appName: "Para MCP Server",
  options: {},
});

// Configure wallet connectors for RainbowKit
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [rainbowWallet],
    },
    {
      groupName: "Other Wallets",
      wallets: [baseAccount, metaMaskWallet, walletConnectWallet],
    },
  ],
  {
    appName: "Para MCP Server",
    projectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
      "4b49e5e63b9f6253943b470873b47208",
  },
);

// Wagmi configuration with Para connector + RainbowKit connectors
export const wagmiConfig = createConfig({
  connectors: [paraWagmiConnector, ...connectors],
  chains: [arbitrum, base, mainnet, optimism, polygon, baseSepolia],
  transports: {
    [arbitrum.id]: http(),
    [base.id]: http(),
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [baseSepolia.id]: http(),
  },
});
