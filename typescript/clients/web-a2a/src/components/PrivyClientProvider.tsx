'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import type React from 'react';

function isPlaceholderAppId(appId: string): boolean {
  return appId === 'your_privy_app_id_here';
}

export function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId || isPlaceholderAppId(appId)) {
    throw new Error(
      'Privy is not configured: set NEXT_PUBLIC_PRIVY_APP_ID to a valid Privy App ID (build can succeed without it, but the app cannot run without it).',
    );
  }

  return (
    <PrivyProvider
      appId={appId}
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
  );
}
