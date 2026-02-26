'use client';

import { useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { WalletManagementView, type WalletPortfolioView } from '@/components/wallet/WalletManagementView';
import { selectConnectedDestinationWallet } from '@/components/wallet/withdraw';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';

type PortfolioApiResponse = WalletPortfolioView & {
  walletAddress: string;
};

const EMPTY_PORTFOLIO: WalletPortfolioView = {
  balances: [],
  positions: {
    perpetuals: [],
    pendle: [],
    liquidity: [],
  },
};

export default function WalletPage(): React.JSX.Element {
  const { wallets } = useWallets();
  const { walletClient, privyWallet, isLoading: isWalletLoading, error: walletError } = usePrivyWalletClient();
  const [portfolio, setPortfolio] = useState<WalletPortfolioView>(EMPTY_PORTFOLIO);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const loadPortfolio = useCallback(async (walletAddress: string) => {
    setIsPortfolioLoading(true);
    setPortfolioError(null);

    const response = await fetch(`/api/onchain-actions/wallet/${walletAddress}/portfolio`, {
      cache: 'no-store',
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      const errorPayload = payload as {
        error?: string;
        details?: string;
      };
      throw new Error(errorPayload.error ?? errorPayload.details ?? 'Failed to load wallet portfolio');
    }

    const portfolioPayload = payload as PortfolioApiResponse;
    setPortfolio({
      balances: portfolioPayload.balances ?? [],
      positions: {
        perpetuals: portfolioPayload.positions?.perpetuals ?? [],
        pendle: portfolioPayload.positions?.pendle ?? [],
        liquidity: portfolioPayload.positions?.liquidity ?? [],
      },
    });
  }, []);

  useEffect(() => {
    if (!privyWallet?.address) {
      setPortfolio(EMPTY_PORTFOLIO);
      setPortfolioError(null);
      setIsPortfolioLoading(false);
      return;
    }

    let canceled = false;

    const run = async () => {
      try {
        await loadPortfolio(privyWallet.address);
      } catch (error) {
        if (canceled) return;
        const message = error instanceof Error ? error.message : 'Failed to load wallet portfolio';
        setPortfolioError(message);
      } finally {
        if (!canceled) {
          setIsPortfolioLoading(false);
        }
      }
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [loadPortfolio, privyWallet?.address]);

  const connectedDestinationAddress = useMemo(() => {
    if (!privyWallet?.address) return null;
    return selectConnectedDestinationWallet({
      sourceAddress: privyWallet.address,
      wallets,
    });
  }, [privyWallet?.address, wallets]);

  const handleWithdrawConfirmed = useCallback(
    async (_hash: string) => {
      if (!privyWallet?.address) return;
      try {
        await loadPortfolio(privyWallet.address);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh wallet portfolio.';
        setPortfolioError(message);
      }
    },
    [loadPortfolio, privyWallet?.address],
  );

  if (!privyWallet?.address) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <section className="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
          <h1 className="text-2xl font-semibold text-white">Manage Wallet</h1>
          <p className="mt-2 text-sm text-gray-400">Sign in with Privy to access wallet management.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(isWalletLoading || isPortfolioLoading) && (
        <div className="mx-auto mt-6 w-full max-w-5xl rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 py-3 text-sm text-gray-300">
          Loading wallet portfolio...
        </div>
      )}

      {walletError && (
        <div className="mx-auto mt-6 w-full max-w-5xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {walletError.message}
        </div>
      )}
      {portfolioError && (
        <div className="mx-auto w-full max-w-5xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {portfolioError}
        </div>
      )}

      <WalletManagementView
        walletAddress={privyWallet.address}
        connectedDestinationAddress={connectedDestinationAddress}
        walletClient={walletClient}
        portfolio={portfolio}
        onWithdrawConfirmed={handleWithdrawConfirmed}
      />
    </div>
  );
}
