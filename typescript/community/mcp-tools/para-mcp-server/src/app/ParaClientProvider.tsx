"use client";

import { ParaProvider } from "@getpara/react-sdk";
import { Environment } from "@getpara/web-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import { baseSepolia } from "wagmi/chains";

// Create QueryClient outside component to ensure single instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function ParaClientProvider({ children }: PropsWithChildren) {
  // Determine environment - match the logic in debug/config.ts
  const env =
    process.env.NEXT_PUBLIC_PARA_ENVIRONMENT === "PRODUCTION"
      ? Environment.PRODUCTION
      : Environment.BETA;

  const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY || "";

  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          env,
          apiKey,
        }}
        config={{
          appName: "Para MCP Server",
          disableAutoSessionKeepAlive: false,
        }}
        externalWalletConfig={{
          wallets: ["RAINBOW"],
          evmConnector: {
            config: {
              chains: [baseSepolia],
            },
          },
          walletConnect: {
            projectId:
              process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
              "4b49e5e63b9f6253943b470873b47208",
          },
        }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
  );
}
