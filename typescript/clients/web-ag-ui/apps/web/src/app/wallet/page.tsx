'use client';

import { useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  WalletManagementView,
  type WalletPortfolioView,
} from '@/components/wallet/WalletManagementView';
import { selectConnectedDestinationWallet } from '@/components/wallet/withdraw';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { buildPortfolioProjection } from '@/projections/portfolio/buildPortfolioProjection';
import { portfolioProjectionInputSchema } from '@/projections/portfolio/schema';
import type {
  PortfolioProjectionInput,
  PortfolioProjectionPacket,
} from '@/projections/portfolio/types';
import { invokeAgentCommandRoute } from '@/utils/agentCommandRoute';
import { getAgentThreadId } from '@/utils/agentThread';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function readPortfolioProjectionInput(
  domainProjection: Record<string, unknown> | null | undefined,
): PortfolioProjectionInput | null {
  if (!isRecord(domainProjection)) {
    return null;
  }

  const parsed = portfolioProjectionInputSchema.safeParse(domainProjection['portfolioProjectionInput']);
  return parsed.success ? parsed.data : null;
}

async function fetchWalletPortfolio(walletAddress: string): Promise<WalletPortfolioView> {
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
  return {
    balances: portfolioPayload.balances ?? [],
    positions: {
      perpetuals: portfolioPayload.positions?.perpetuals ?? [],
      pendle: portfolioPayload.positions?.pendle ?? [],
      liquidity: portfolioPayload.positions?.liquidity ?? [],
    },
  };
}

async function fetchPortfolioProjectionInput(
  walletAddress: string,
): Promise<PortfolioProjectionInput> {
  const threadId = getAgentThreadId('agent-portfolio-manager', walletAddress);
  if (!threadId) {
    throw new Error('Connect the managed wallet to load the Shared Ember portfolio projection.');
  }

  const response = await invokeAgentCommandRoute({
    agentId: 'agent-portfolio-manager',
    threadId,
    command: {
      name: 'refresh_portfolio_state',
    },
  });
  const projectionInput = readPortfolioProjectionInput(response.domainProjection ?? null);

  if (!projectionInput) {
    throw new Error('Shared Ember portfolio projection was missing from the portfolio manager refresh.');
  }

  return projectionInput;
}

export default function WalletPage(): React.JSX.Element {
  const { wallets } = useWallets();
  const { walletClient, privyWallet, isLoading: isWalletLoading, error: walletError } = usePrivyWalletClient();
  const walletAddress = privyWallet?.address ?? null;
  const [portfolio, setPortfolio] = useState<WalletPortfolioView>(EMPTY_PORTFOLIO);
  const [portfolioProjectionInput, setPortfolioProjectionInput] = useState<PortfolioProjectionInput | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);

  const loadWalletData = useCallback(async (walletAddress: string) => {
    setIsDataLoading(true);
    setPortfolioError(null);
    setProjectionError(null);

    const [portfolioResult, projectionResult] = await Promise.allSettled([
      fetchWalletPortfolio(walletAddress),
      fetchPortfolioProjectionInput(walletAddress),
    ]);

    if (portfolioResult.status === 'fulfilled') {
      setPortfolio(portfolioResult.value);
    } else {
      setPortfolio(EMPTY_PORTFOLIO);
      setPortfolioError(readErrorMessage(portfolioResult.reason, 'Failed to load wallet portfolio.'));
    }

    if (projectionResult.status === 'fulfilled') {
      setPortfolioProjectionInput(projectionResult.value);
    } else {
      setPortfolioProjectionInput(null);
      setProjectionError(
        readErrorMessage(
          projectionResult.reason,
          'Failed to load Shared Ember wallet projection.',
        ),
      );
    }

    setIsDataLoading(false);
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    let canceled = false;

    const run = async () => {
      await loadWalletData(walletAddress);
      if (canceled) {
        return;
      }
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [loadWalletData, walletAddress]);

  const connectedDestinationAddress = walletAddress
    ? selectConnectedDestinationWallet({
        sourceAddress: walletAddress,
        wallets,
      })
    : null;

  const portfolioProjection = useMemo<PortfolioProjectionPacket | null>(() => {
    if (!portfolioProjectionInput) {
      return null;
    }

    return buildPortfolioProjection(portfolioProjectionInput);
  }, [portfolioProjectionInput]);

  const handleWithdrawConfirmed = async (_hash: string) => {
    if (!walletAddress) return;
    await loadWalletData(walletAddress);
  };

  if (!walletAddress) {
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <section className="rounded-[28px] border border-[#E4D5C7] bg-[linear-gradient(180deg,#FFF8F0_0%,#F7EBDD_100%)] p-6 shadow-[0_18px_40px_rgba(68,46,21,0.08)]">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8C7F72]">
            Wallet dashboard
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#221A13]">
            Manage Wallet
          </h1>
          <p className="mt-3 text-sm text-[#6D5B4C]">
            Sign in with Privy to access the accounting, allocation, and withdraw surfaces.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-transparent">
      {(isWalletLoading || isDataLoading) && (
        <div className="mx-auto mt-6 w-full max-w-5xl rounded-[18px] border border-[#E4D5C7] bg-[#FFF8F0] px-4 py-3 text-sm text-[#6D5B4C]">
          Loading wallet portfolio...
        </div>
      )}

      {walletError && (
        <div className="mx-auto mt-6 w-full max-w-5xl rounded-[18px] border border-[#F0C8C1] bg-[#FFF0EB] px-4 py-3 text-sm text-[#B23A32]">
          {walletError.message}
        </div>
      )}
      {portfolioError && (
        <div className="mx-auto w-full max-w-5xl rounded-[18px] border border-[#F0C8C1] bg-[#FFF0EB] px-4 py-3 text-sm text-[#B23A32]">
          {portfolioError}
        </div>
      )}
      {projectionError && (
        <div className="mx-auto w-full max-w-5xl rounded-[18px] border border-[#F3DEB2] bg-[#FFF7E8] px-4 py-3 text-sm text-[#8A5A13]">
          {projectionError}
        </div>
      )}

      <WalletManagementView
        walletAddress={walletAddress}
        connectedDestinationAddress={connectedDestinationAddress}
        walletClient={walletClient}
        portfolio={portfolio}
        portfolioProjection={portfolioProjection}
        portfolioProjectionInput={portfolioProjectionInput}
        onWithdrawConfirmed={handleWithdrawConfirmed}
      />
    </div>
  );
}
