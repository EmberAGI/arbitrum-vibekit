'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLogout, usePrivy } from '@privy-io/react-auth';
import Image from 'next/image';

import { PortfolioDashboardTopBar } from '@/components/dashboard/PortfolioDashboardTopBar';
import { HardNavLink } from '@/components/ui/HardNavLink';
import { useAgent } from '@/contexts/AgentContext';
import { useAuthoritativeAgentSnapshotCache } from '@/contexts/AuthoritativeAgentSnapshotCache';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { buildPortfolioProjection } from '@/projections/portfolio/buildPortfolioProjection';
import { portfolioProjectionInputSchema } from '@/projections/portfolio/schema';
import type { PortfolioProjectionInput } from '@/projections/portfolio/types';
import { invokeAgentCommandRoute } from '@/utils/agentCommandRoute';
import { getAgentThreadId } from '@/utils/agentThread';

import { buildWalletDashboardView } from './wallet/walletDashboardView';

const PORTFOLIO_AGENT_ID = 'agent-portfolio-manager';

type FetchedPortfolioProjectionInput = {
  walletAddress: string;
  input: PortfolioProjectionInput;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function GlobalWalletControls(props: {
  walletAddress: string | null;
}): React.JSX.Element | null {
  const { ready, authenticated } = usePrivy();
  const { logout } = useLogout();

  if (!authenticated || !props.walletAddress) {
    return null;
  }

  return (
    <div className="flex h-9 items-center gap-3 rounded-full border border-[#D7C5B4] bg-[#F8EFE5] px-3 text-[#2C1E17]">
      <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
      <div className="group/wallet-address relative inline-flex">
        <button
          type="button"
          aria-label="Show wallet address"
          className="font-mono text-[12px] font-medium transition hover:text-[#241813] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C9AA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8EFE5]"
        >
          {formatAddress(props.walletAddress)}
        </button>
        <div
          role="dialog"
          aria-label="Wallet address"
          className="pointer-events-none absolute right-0 top-[calc(100%+10px)] z-50 w-[min(28rem,calc(100vw-1.5rem))] cursor-default rounded-[20px] border border-[#eadac7] bg-[#fffdf8]/98 p-3 opacity-0 shadow-[0_18px_44px_rgba(115,78,48,0.16)] backdrop-blur-sm translate-y-1 transition duration-150 before:absolute before:-top-2 before:left-0 before:h-2 before:w-full before:content-[''] group-hover/wallet-address:pointer-events-auto group-hover/wallet-address:translate-y-0 group-hover/wallet-address:opacity-100 group-focus-within/wallet-address:pointer-events-auto group-focus-within/wallet-address:translate-y-0 group-focus-within/wallet-address:opacity-100"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
            Wallet address
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={props.walletAddress}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-[#DDC8B3] bg-[#FCF5EC] px-2 py-1 text-xs font-mono text-[#2C1E17]"
              aria-label="Wallet address value"
            />
            <button
              type="button"
              onClick={() => void navigator?.clipboard?.writeText?.(props.walletAddress)}
              className="shrink-0 rounded-md border border-[#DDC8B3] bg-[#F0E2D2] px-2 py-1 text-xs font-medium text-[#2C1E17] transition hover:bg-[#E6D2BF]"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-xs font-medium text-[#7B6758] transition hover:text-[#241813]"
        disabled={!ready}
      >
        Logout
      </button>
      <HardNavLink
        href="/wallet"
        className="text-xs font-medium text-[#7B6758] transition hover:text-[#241813]"
      >
        Manage Wallet
      </HardNavLink>
    </div>
  );
}

function GlobalTopBarBrand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5 border-r border-[#D7C5B4] pr-5">
      <Image
        src="/ember-sidebar-logo.png"
        alt="Ember Logo"
        width={10}
        height={16}
        className="h-4 w-auto object-contain"
      />
      <Image src="/ember-name.svg" alt="Ember" width={76} height={15} className="h-[15px] w-auto" />
    </div>
  );
}

export function GlobalPortfolioTopBar(): React.JSX.Element | null {
  const { privyWallet } = usePrivyWalletClient();
  const walletAddress = privyWallet?.address ?? null;
  const agent = useAgent();
  const authoritativeSnapshotCache = useAuthoritativeAgentSnapshotCache();
  const [fetchedPortfolioProjectionInput, setFetchedPortfolioProjectionInput] =
    useState<FetchedPortfolioProjectionInput | null>(null);
  const requestedPortfolioProjectionKeyRef = useRef<string | null>(null);
  const portfolioManagerThreadId = getAgentThreadId(PORTFOLIO_AGENT_ID, walletAddress);
  const portfolioManagerSnapshotCacheKey = portfolioManagerThreadId
    ? `${PORTFOLIO_AGENT_ID}:${portfolioManagerThreadId}`
    : null;

  const cachedPortfolioProjectionInput = useMemo(() => {
    const currentAgentProjectionInput =
      agent.config.id === PORTFOLIO_AGENT_ID
        ? readPortfolioProjectionInput(agent.domainProjection)
        : null;
    if (currentAgentProjectionInput) {
      return currentAgentProjectionInput;
    }

    if (!portfolioManagerSnapshotCacheKey) {
      return null;
    }

    const snapshot = authoritativeSnapshotCache.getSnapshot(portfolioManagerSnapshotCacheKey);
    return readPortfolioProjectionInput(snapshot?.thread?.domainProjection);
  }, [
    agent.config.id,
    agent.domainProjection,
    authoritativeSnapshotCache,
    portfolioManagerSnapshotCacheKey,
  ]);

  useEffect(() => {
    if (cachedPortfolioProjectionInput || !portfolioManagerThreadId || !walletAddress) {
      return;
    }

    const requestKey = `${PORTFOLIO_AGENT_ID}:${portfolioManagerThreadId}`;
    if (requestedPortfolioProjectionKeyRef.current === requestKey) {
      return;
    }
    requestedPortfolioProjectionKeyRef.current = requestKey;

    let canceled = false;

    void (async () => {
      try {
        const response = await invokeAgentCommandRoute({
          agentId: PORTFOLIO_AGENT_ID,
          threadId: portfolioManagerThreadId,
          command: {
            name: 'refresh_portfolio_state',
          },
        });

        if (canceled) {
          return;
        }

        const projectionInput = readPortfolioProjectionInput(response.domainProjection ?? null);
        if (projectionInput) {
          setFetchedPortfolioProjectionInput({
            walletAddress,
            input: projectionInput,
          });
        }
      } catch {
        // Keep the global bar absent until the portfolio projection can be read.
      }
    })();

    return () => {
      canceled = true;
    };
  }, [cachedPortfolioProjectionInput, portfolioManagerThreadId, walletAddress]);

  const portfolioProjectionInput =
    cachedPortfolioProjectionInput ??
    (fetchedPortfolioProjectionInput?.walletAddress === walletAddress
      ? fetchedPortfolioProjectionInput.input
      : null);
  const topbarView = useMemo(() => {
    if (!portfolioProjectionInput) {
      return null;
    }

    const portfolioProjection = buildPortfolioProjection(portfolioProjectionInput);
    return buildWalletDashboardView({
      portfolioProjection,
      portfolioProjectionInput,
    }).topbar;
  }, [portfolioProjectionInput]);

  if (!topbarView) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 bg-[#F7EFE3]">
      <PortfolioDashboardTopBar
        view={topbarView}
        leftAccessory={<GlobalTopBarBrand />}
        rightAccessory={<GlobalWalletControls walletAddress={walletAddress} />}
      />
    </div>
  );
}
