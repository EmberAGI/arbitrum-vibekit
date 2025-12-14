'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { arbitrum, mainnet, polygon, optimism, base } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';

const config = getDefaultConfig({
  appName: 'Ember AI',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: [arbitrum, mainnet, polygon, optimism, base],
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient once per component instance to avoid recreation on re-renders
  const [queryClient] = useState(() => new QueryClient());

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

