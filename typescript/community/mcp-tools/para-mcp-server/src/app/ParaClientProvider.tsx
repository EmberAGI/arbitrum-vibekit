"use client";

import { ParaProvider } from "@getpara/react-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useMemo, useState } from "react";

export function ParaClientProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const paraClientConfig = useMemo(() => {
    const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY;
    if (!apiKey) throw new Error("NEXT_PUBLIC_PARA_API_KEY is not configured");
    return { apiKey };
  }, []);

  // TODO: Re-enable Coinbase Smart Wallet connector once proper CDP integration is implemented
  // The connector needs to be properly integrated with CDP SDK and return serializable objects
  // For now, Para Modal will show default wallet options

  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={paraClientConfig}
        config={{ appName: "Para MCP Server" }}
        externalWalletConfig={{ wallets: [] }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
  );
}
