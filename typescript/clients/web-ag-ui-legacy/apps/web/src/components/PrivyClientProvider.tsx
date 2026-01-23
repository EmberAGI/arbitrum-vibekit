'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import type React from 'react';

function isPlaceholderAppId(appId: string): boolean {
  return appId === 'your_privy_app_id_here';
}

export function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId || isPlaceholderAppId(appId)) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#121212] text-white p-6">
        <div className="max-w-md w-full rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-sm font-semibold">Privy is not configured</div>
          <div className="mt-2 text-sm text-red-100/90">
            Set <span className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</span> to a valid Privy App ID
            and restart the dev server.
          </div>
          <div className="mt-3 text-xs text-red-100/70 font-mono">
            apps/web/.env.example → apps/web/.env.local
          </div>
        </div>
      </div>
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
