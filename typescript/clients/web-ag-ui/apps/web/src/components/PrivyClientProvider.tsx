'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import type React from 'react';

export function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    throw new Error(
      'Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID to a valid Privy App ID and restart the dev server.',
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
