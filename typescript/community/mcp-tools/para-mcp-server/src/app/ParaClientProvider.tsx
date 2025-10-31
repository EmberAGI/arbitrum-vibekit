"use client";

import { PropsWithChildren, useMemo, useState } from "react";
import { ParaProvider } from "@getpara/react-sdk";
import { Environment } from "@getpara/web-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function ParaClientProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const paraClientConfig = useMemo(() => {
    const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY;
    if (!apiKey) throw new Error("NEXT_PUBLIC_PARA_API_KEY is not configured");
    const env =
      process.env.NEXT_PUBLIC_PARA_ENVIRONMENT === "PROD"
        ? Environment.PROD
        : Environment.BETA;
    return { env, apiKey, opts: {} } as const;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider paraClientConfig={paraClientConfig}>{children}</ParaProvider>
    </QueryClientProvider>
  );
}
