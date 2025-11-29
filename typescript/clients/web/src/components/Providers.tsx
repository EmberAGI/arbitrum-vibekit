'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { arbitrum, mainnet, polygon, optimism, base } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';
import { PrivyProvider } from '@privy-io/react-auth';

const config = getDefaultConfig({
  appName: 'EmberAI A2A Client',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: [mainnet, arbitrum, polygon, optimism, base],
  ssr: true, // If your dApp uses server side rendering (SSR)
});

const queryClient = new QueryClient();

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'your-privy-app-id';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#FD6731', // EmberAi orange color
            accentColorForeground: '#fff',
          })}
          initialChain={arbitrum}
        >
          <PrivyProvider
            appId={PRIVY_APP_ID}
            config={{
              embeddedWallets: {
                ethereum: {
                  createOnLogin: 'all-users',
                },
              },
            }}
          >
            {children}
          </PrivyProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
