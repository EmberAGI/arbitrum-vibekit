'use client';

import { AlertCircle } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useLogin } from '@privy-io/react-auth';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';

export function PrivyGateBanner() {
  const { authenticated } = usePrivy();
  const { login } = useLogin();
  const { privyWallet } = usePrivyWalletClient();
  const needsSignIn = !authenticated || !privyWallet?.address;

  if (!needsSignIn) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <button
        type="button"
        onClick={() => login()}
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-[#ff9a6b] bg-[#ff7a2f] px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-black/30 transition hover:bg-[#ff8b4a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd1b8]"
      >
        <AlertCircle className="h-5 w-5" />
        <span>Sign in with Privy to create a thread and interact with agents.</span>
      </button>
    </div>
  );
}
