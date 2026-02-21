'use client';

import { AlertCircle } from 'lucide-react';
import { useLogin } from '@privy-io/react-auth';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { resolveAgentThreadWalletAddress } from '@/utils/agentThread';
import { usePathname } from 'next/navigation';

export function PrivyGateBanner() {
  const { login } = useLogin();
  const { privyWallet } = usePrivyWalletClient();
  const pathname = usePathname();
  const threadWalletAddress = resolveAgentThreadWalletAddress(privyWallet?.address);
  const needsSignIn = !threadWalletAddress;
  const isHireAgents = pathname?.startsWith('/hire-agents') ?? false;

  if (!needsSignIn) {
    return null;
  }

  const className = isHireAgents
    ? [
        // Subtle, design-forward treatment for the polished hire flow (Figma doesn't include this gate).
        'pointer-events-auto flex items-center gap-3 rounded-full border border-[#8b5cf6]/35',
        'bg-[#14141a]/70 px-5 py-2.5 text-[13px] font-medium text-white',
        'shadow-lg shadow-black/35 backdrop-blur-md transition-colors',
        'hover:bg-[#171722]/80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/35',
      ].join(' ')
    : [
        // Keep the existing brand-orange callout for other routes.
        'pointer-events-auto flex items-center gap-3 rounded-full border border-[#ff9a6b]',
        'bg-[#ff7a2f] px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-black/30',
        'transition hover:bg-[#ff8b4a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd1b8]',
      ].join(' ');

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <button
        type="button"
        onClick={() => login()}
        className={className}
      >
        <AlertCircle className={isHireAgents ? 'h-4 w-4 text-[#a78bfa]' : 'h-5 w-5'} />
        <span>Sign in with Privy to create a thread and interact with agents.</span>
      </button>
    </div>
  );
}
