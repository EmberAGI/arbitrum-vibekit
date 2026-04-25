'use client';

import type { Account, Chain, Transport, WalletClient } from 'viem';

import { PortfolioDashboardTopBar } from '@/components/dashboard/PortfolioDashboardTopBar';
import { RectangularTreemap } from '@/components/dashboard/RectangularTreemap';
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
import {
  buildWalletDashboardView,
  type WalletContentsFamilyView,
  type WalletContentsView,
} from './walletDashboardView';

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
      <PortfolioDashboardTopBar view={dashboardView.topbar} />
      <WalletContentsWorkbench view={dashboardView.contents} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-6">
            <AssetsWidget view={dashboardView} />
            <AccountingWidget view={dashboardView} />
          </div>
          {props.portfolioProjection ? (
            <ProjectionHoldingsPanel view={dashboardView.contents} />
          ) : (
            <WalletPortfolioPanel
              balances={props.portfolio.balances}
              positions={props.portfolio.positions}
            />
          )}
        </div>

        <WalletWithdrawPanel
          sourceAddress={props.walletAddress}
          connectedDestinationAddress={props.connectedDestinationAddress}
          walletClient={props.walletClient}
          balances={props.portfolio.balances}
          onWithdrawConfirmed={props.onWithdrawConfirmed}
        />
      </div>
    </div>
  );
}

function ProjectionHoldingsPanel(props: { view: WalletContentsView }): React.JSX.Element {
  return (
    <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#221A13]">Projection holdings</h2>
          <p className="mt-1 text-sm text-[#6D5B4C]">
            Shared Ember family view; raw token wrappers and unrelated OCA lanes are not
            double-counted here.
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-2">
          <ProjectionSummaryChip label="Wallet" valueUsd={props.view.summary.walletUsd} />
          <ProjectionSummaryChip label="Deployed" valueUsd={props.view.summary.deployedUsd} />
          <ProjectionSummaryChip label="Owed" valueUsd={props.view.summary.owedUsd} tone="owed" />
        </div>
      </div>

      {props.view.families.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[#E7DBD0] bg-[#FCF5EC] px-4 py-6 text-sm text-[#8C7F72]">
          No projected holdings yet.
        </p>
      ) : (
        <div className="space-y-3">
          {props.view.families.map((family) => (
            <ProjectionFamilyRow key={family.id} family={family} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectionSummaryChip(props: {
  label: string;
  valueUsd: number;
  tone?: 'default' | 'owed';
}): React.JSX.Element {
  return (
    <div className="rounded-[16px] border border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2 text-right">
      <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#8C7F72]">
        {props.label}
      </div>
      <div
        className={`mt-1 text-[14px] font-semibold tracking-[-0.04em] ${
          props.tone === 'owed' ? 'text-[#B23A32]' : 'text-[#221A13]'
        }`}
      >
        {formatCompactUsd(props.valueUsd)}
      </div>
    </div>
  );
}

function ProjectionFamilyRow(props: { family: WalletContentsFamilyView }): React.JSX.Element {
  return (
    <article className="rounded-[20px] border border-[#E7DBD0] bg-[#FCF5EC] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-[-0.04em] text-[#221A13]">
            {props.family.label}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8C7F72]">
            {formatCompactUsd(props.family.grossExposureUsd)} gross ·{' '}
            {formatPercent(props.family.share)}
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-[#D9CABB] bg-[#FFF9F2] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
          {formatProjectionFamilyState(props.family)}
        </div>
      </div>
      {props.family.lines.length > 0 ? (
        <div className="mt-3 space-y-2">
          {props.family.lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-[#6D5B4C]">{line.label}</span>
              <span
                className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] ${
                  line.tone === 'owed' ? 'text-[#B23A32]' : 'text-[#8C7F72]'
                }`}
              >
                {formatCompactUsd(line.valueUsd)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function formatProjectionFamilyState(family: WalletContentsFamilyView): string {
  if (family.owedUsd > 0) {
    return 'Debt';
  }

  if (family.deployedUsd > 0 && family.walletUsd > 0) {
    return 'Split';
  }

  if (family.deployedUsd > 0) {
    return 'Deployed';
  }

  return 'Wallet';
}

function AssetsWidget(props: {
  view: ReturnType<typeof buildWalletDashboardView>;
}): React.JSX.Element {
  return (
    <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] px-5 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
          <span>Assets</span>
          <span>{props.view.topbar.metrics[0]?.value ?? '$0'}</span>
        </div>
        <div className="truncate text-[12px] font-medium text-[#8C7F72]">
          Wallet + visible deployed exposure
        </div>
      </div>
      <div className="relative mt-3">
        {props.view.treemapItems.length > 0 ? (
          <RectangularTreemap className="h-[188px]" items={props.view.treemapItems} />
        ) : (
          <div className="flex h-[188px] items-center justify-center rounded-[20px] border border-dashed border-[#E7DBD0] bg-[#FCF5EC] text-sm text-[#8C7F72]">
            No priced wallet exposures yet.
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#A6927E]">
        <span>Hover the treemap</span>
        <span aria-hidden="true">·</span>
        <span>cash and deployed exposure</span>
      </div>
    </section>
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
            gridTemplateRows: props.view.accounting.segments
              .map((segment) => segment.meter)
              .join(' '),
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export type { WalletManagementViewProps, WalletPortfolioView };
