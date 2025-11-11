import type { ReactNode } from "react";

export default function ParaDebugLayout({ children }: { children: ReactNode }) {
  // Para's internal wagmi provider (from externalWalletConfig) is accessible here
  // No need to bypass - Para handles both embedded and external wallets
  return <>{children}</>;
}
