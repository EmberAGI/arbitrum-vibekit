'use client';
import '@getpara/react-sdk/styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import {
  darkTheme,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { getParaWallet } from '@getpara/rainbowkit-wallet';
import { Environment } from '@getpara/web-sdk';
import {
  coinbaseWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  braveWallet,
  safeWallet,
} from '@rainbow-me/rainbowkit/wallets';
import {
  cookieStorage,
  cookieToInitialState,
  createStorage,
  createConfig,
  http,
  WagmiProvider,
} from 'wagmi';
import { mainnet, arbitrum } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { RainbowKitSiweNextAuthProvider } from '@rainbow-me/rainbowkit-siwe-next-auth';

export function ProviderWrapper({ children }: { children: React.ReactNode }) {
  const APP_NAME = 'Arbitrum VibeKit';
  const PROJECT_ID = '4b49e5e63b9f6253943b470873b47208';
  const API_KEY = process.env.NEXT_PUBLIC_PARA_API_KEY || '';

  const config = useMemo(() => {
    const CHAINS = [arbitrum, mainnet] as const;

    const paraWallet = getParaWallet({
      para: {
        environment: Environment.BETA,
        apiKey: API_KEY,
      },
      appName: APP_NAME,
      // You can customize OAuth methods & layouts as desired
      // oauthMethods: [OAuthMethod.GOOGLE, OAuthMethod.APPLE],
      // authLayout: [AuthLayout.AUTH_FULL, AuthLayout.EXTERNAL_FULL],
    });

    const connectors = connectorsForWallets([
      {
        groupName: 'Social Login',
        wallets: [paraWallet],
      },
      {
        groupName: 'Popular',
        wallets: [
          rainbowWallet,
          coinbaseWallet,
          metaMaskWallet,
          walletConnectWallet,
          braveWallet,
          safeWallet,
        ],
      },
    ], {
      appName: APP_NAME,
      projectId: PROJECT_ID,
    });

    return createConfig({
      connectors,
      chains: CHAINS,
      transports: {
        [arbitrum.id]: http(),
        [mainnet.id]: http(),
      },
      ssr: true,
      storage: createStorage({ storage: cookieStorage }),
    });
  }, []);

  const queryClient = useMemo(() => new QueryClient(), []);
  const cookie = cookieStorage.getItem('wagmi.storage') || '';
  const initialState = cookieToInitialState(config, cookie);

  return (
    <>
      <WagmiProvider
        config={config}
        reconnectOnMount={true}
        initialState={initialState}
      >
        <QueryClientProvider client={queryClient}>
          <RainbowKitSiweNextAuthProvider>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: '#4E76A9',
                accentColorForeground: '#fff',
              })}
              initialChain={arbitrum}
            >
              {children}
            </RainbowKitProvider>
          </RainbowKitSiweNextAuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}
