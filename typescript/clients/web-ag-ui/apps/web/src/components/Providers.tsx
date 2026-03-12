'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { PrivyClientProvider } from './PrivyClientProvider';
import { AgentListProvider } from '../contexts/AgentListContext';
import { normalizeWalletAddress, selectPrivyWallet } from '../hooks/usePrivyWalletClient';

function WalletSessionProvider({ children }: { children: ReactNode }) {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const previousSessionKeyRef = useRef<string | null>(null);

  const sessionKey = useMemo(() => {
    const selectedWallet = selectPrivyWallet({ wallets });
    return normalizeWalletAddress(selectedWallet?.address) ?? 'signed-out';
  }, [wallets]);

  useEffect(() => {
    if (previousSessionKeyRef.current === null) {
      previousSessionKeyRef.current = sessionKey;
      return;
    }

    if (previousSessionKeyRef.current === sessionKey) {
      return;
    }

    previousSessionKeyRef.current = sessionKey;
    queryClient.clear();
  }, [queryClient, sessionKey]);

  return <AgentListProvider key={sessionKey}>{children}</AgentListProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <PrivyClientProvider>
        <WalletSessionProvider>{children}</WalletSessionProvider>
      </PrivyClientProvider>
    </QueryClientProvider>
  );
}
