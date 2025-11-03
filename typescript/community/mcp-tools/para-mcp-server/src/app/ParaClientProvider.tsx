"use client";

import { type PropsWithChildren, useMemo, useState } from "react";
import { ParaProvider } from "@getpara/react-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function ParaClientProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const paraClientConfig = useMemo(() => {
    const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY;
    if (!apiKey) throw new Error("NEXT_PUBLIC_PARA_API_KEY is not configured");
    return { apiKey };
  }, []);

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
