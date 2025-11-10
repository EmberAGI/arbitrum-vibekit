"use client";

import { ParaProvider } from "@getpara/react-sdk";
import { Environment } from "@getpara/web-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";

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
  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          env: Environment.BETA,
          apiKey: process.env.NEXT_PUBLIC_PARA_API_KEY || "",
        }}
        config={{
          appName: "Para MCP Server",
          disableAutoSessionKeepAlive: false,
        }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
  );
}
