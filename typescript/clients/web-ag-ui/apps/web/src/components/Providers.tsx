'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import {
  RainbowKitProvider,
  type WalletList,
  getDefaultConfig,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { coinbaseWallet, injectedWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { arbitrum, mainnet, polygon, optimism, base } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';

const appName = 'Ember AI';
const chains = [arbitrum, mainnet, polygon, optimism, base] as const;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

  const config = useMemo(() => {
    // Avoid RainbowKit's default `metaMaskWallet` (wagmi MetaMask SDK connector) because it pulls in
    // browser-only storage and RN-only deps during Next build/SSR.
    const wallets: WalletList = [
      {
        groupName: 'Popular',
        wallets: [injectedWallet, coinbaseWallet, walletConnectWallet],
      },
    ];

    return getDefaultConfig({
      appName,
      projectId,
      chains,
      wallets,
      ssr: false,
    });
  }, [projectId]);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#fd6731',
            accentColorForeground: '#fff',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
          initialChain={arbitrum}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
