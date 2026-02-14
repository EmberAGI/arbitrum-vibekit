'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import type React from 'react';

export function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // Privy is optional for CI builds and local dev. If it's not configured, we render
    // the app without auth features rather than crashing during prerender.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID to a valid Privy App ID to enable auth features.',
      );
    }
    return <>{children}</>;
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
