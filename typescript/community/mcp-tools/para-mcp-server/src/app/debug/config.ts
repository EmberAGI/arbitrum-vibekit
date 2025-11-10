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

// Chains configuration - exported for use in components
export const CHAINS = [
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  baseSepolia,
] as const;

// Configure wallet connectors
const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        baseAccount,
        metaMaskWallet,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: "Para MCP Server",
    projectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
      "4b49e5e63b9f6253943b470873b47208",
  },
);

// Wagmi configuration
export const wagmiConfig = createConfig({
  connectors,
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
