'use client';

import type { Account, Chain, Transport, WalletClient } from 'viem';

import type {
  PortfolioProjectionInput,
  PortfolioProjectionPacket,
} from '@/projections/portfolio/types';

import {
  WalletPortfolioPanel,
  type LiquidityPositionView,
  type PendlePositionView,
  type PerpetualPositionView,
  type WalletBalanceView,
} from './WalletPortfolioPanel';
import { WalletContentsWorkbench } from './WalletContentsWorkbench';
import { WalletWithdrawPanel } from './WalletWithdrawPanel';
import { buildWalletDashboardView } from './walletDashboardView';

type WalletPortfolioView = {
  balances: WalletBalanceView[];
  positions: {
    perpetuals: PerpetualPositionView[];
    pendle: PendlePositionView[];
    liquidity: LiquidityPositionView[];
  };
};

type WalletManagementViewProps = {
  walletAddress: string;
  connectedDestinationAddress: string | null;
  walletClient: WalletClient<Transport, Chain, Account> | null;
  portfolio: WalletPortfolioView;
  portfolioProjection?: PortfolioProjectionPacket | null;
  portfolioProjectionInput?: PortfolioProjectionInput | null;
  onWithdrawConfirmed?: (hash: string) => Promise<void> | void;
};

export function WalletManagementView(props: WalletManagementViewProps): React.JSX.Element {
  const dashboardView = props.portfolioProjection
    ? buildWalletDashboardView({
        portfolioProjection: props.portfolioProjection,
        portfolioProjectionInput: props.portfolioProjectionInput ?? undefined,
      })
    : buildWalletDashboardView({ portfolio: props.portfolio });

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-0 pt-0 pb-6">
      <div className="space-y-6 px-4 pb-6 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:items-start">
          <WalletContentsWorkbench view={dashboardView.contents} positions={props.portfolio.positions} />

          <div className="space-y-6">
            <WalletPortfolioPanel
              treemapItems={dashboardView.treemapItems}
              totalExposureLabel={dashboardView.topbar.metrics[0]?.value ?? '$0'}
            />
            <AccountingWidget view={dashboardView} />

            <WalletWithdrawPanel
              sourceAddress={props.walletAddress}
              connectedDestinationAddress={props.connectedDestinationAddress}
              walletClient={props.walletClient}
              balances={props.portfolio.balances}
              onWithdrawConfirmed={props.onWithdrawConfirmed}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountingWidget(props: {
  view: ReturnType<typeof buildWalletDashboardView>;
}): React.JSX.Element {
  return (
    <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] px-5 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
        Accounting
      </div>
      <div className="mt-3 grid grid-cols-[12px_1fr] items-stretch gap-4">
        <div className="relative h-28 overflow-visible">
          <div className="h-full overflow-hidden rounded-full bg-[#E2D5C9]">
            <div className="flex h-full flex-col">
              {props.view.accounting.segments.map((segment) => (
                <div
                  key={segment.label}
                  className={`w-full ${segment.fillClassName}`}
                  style={{ height: segment.meter }}
                />
              ))}
            </div>
          </div>
          <div
            className="pointer-events-none absolute left-1/2 h-[2px] w-6 -translate-x-1/2 bg-[#A6927E]"
            style={{
              bottom: props.view.accounting.segments[2]?.meter ?? '0%',
            }}
          />
        </div>
        <div
          className="grid h-28 min-w-0 text-right"
          style={{
            gridTemplateRows: props.view.accounting.segments.map((segment) => segment.meter).join(' '),
          }}
        >
          {props.view.accounting.segments.map((segment) => (
            <div key={segment.label} className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 text-left">
                <div className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
                  {segment.label}
                </div>
                {segment.detail ? (
                  <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[#A6927E]">
                    {segment.detail}
                  </div>
                ) : null}
              </div>
              <div
                className={`font-mono text-[14px] font-semibold leading-none tracking-[-0.03em] ${segment.valueClassName}`}
              >
                {formatCompactUsd(segment.valueUsd)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {props.view.accounting.stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-baseline justify-between gap-4 rounded-[16px] border border-[#E7DBD0] bg-[#FCF5EC] px-4 py-3 text-[12px]"
          >
            <span className="text-[#8C7F72]">{stat.label}</span>
            <span className={`font-semibold ${stat.valueClassName ?? 'text-[#221A13]'}`}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${formatScaledNumber(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `$${formatScaledNumber(value / 1_000)}k`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatScaledNumber(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}

export type { WalletManagementViewProps, WalletPortfolioView };
