import type React from 'react';

import type { WalletContentsFamilyView, WalletContentsView } from './walletDashboardView';

const TONE_STYLES = {
  wallet: {
    chipClassName: 'border-[#CFE9DA] bg-[#EFFAF4] text-[#0F5A38]',
    dotColor: '#4DD999',
  },
  deployed: {
    chipClassName: 'border-[#C7E1D4] bg-[#EFF8F4] text-[#178B5D]',
    dotColor: '#178B5D',
  },
  owed: {
    chipClassName: 'border-[#F0C8C1] bg-[#FFF0EB] text-[#B23A32]',
    dotColor: '#B23A32',
  },
} as const;

export function WalletContentsWorkbench(props: {
  view: WalletContentsView;
}): React.JSX.Element {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[#E7DBD0] bg-[#FFF9F2] shadow-[0_24px_58px_rgba(28,18,10,0.12)]">
      <div className="border-b border-[#E7DBD0] px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8C7F72]">
              Wallet contents
            </div>
            <p className="mt-2 max-w-3xl text-sm text-[#6D5B4C]">
              A family-level view of what is sitting in the wallet, what is deployed, and what is
              surfaced as debt right now.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryStat label="Exposure" value={formatCompactUsd(props.view.summary.grossExposureUsd)} />
            <SummaryStat label="In wallet" value={formatCompactUsd(props.view.summary.walletUsd)} />
            <SummaryStat label="Deployed" value={formatCompactUsd(props.view.summary.deployedUsd)} />
            <SummaryStat label="Owed" value={formatCompactUsd(props.view.summary.owedUsd)} tone="owed" />
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E9DED4]">
          <div className="flex h-full w-full">
            {props.view.compositionSegments.map((segment) =>
              segment.valueUsd > 0 ? (
                <div
                  key={segment.label}
                  className="h-full shrink-0"
                  style={{
                    width: `${segment.share * 100}%`,
                    backgroundColor: segment.colorHex,
                  }}
                />
              ) : null,
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8C7F72]">
          {props.view.compositionSegments.map((segment) => (
            <div key={segment.label} className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                aria-hidden="true"
                style={{ backgroundColor: segment.colorHex }}
              />
              <span>{segment.label}</span>
              <span>{formatCompactUsd(segment.valueUsd)}</span>
            </div>
          ))}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DBD0] bg-[#FCF5EC] px-2 py-1">
            <span>Unpriced lanes</span>
            <span>{props.view.summary.unpricedLaneCount}</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        {props.view.families.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#E7DBD0] bg-[#FCF5EC] px-4 py-6 text-sm text-[#8C7F72]">
            No priced wallet families yet.
          </div>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-3">
              {props.view.featuredFamilies.map((family) => (
                <FeaturedFamilyCard key={family.id} family={family} />
              ))}
            </div>
            {props.view.tailFamilies.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-[22px] border border-[#E7DBD0] bg-[#FCF5EC]">
                {props.view.tailFamilies.map((family) => (
                  <TailFamilyRow key={family.id} family={family} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function SummaryStat(props: {
  label: string;
  value: string;
  tone?: 'default' | 'owed';
}): React.JSX.Element {
  return (
    <div className="rounded-[18px] border border-[#E4D5C7] bg-[#FCF5EC] px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">{props.label}</div>
      <div
        className={`mt-1 text-[20px] font-semibold tracking-[-0.04em] ${
          props.tone === 'owed' ? 'text-[#B23A32]' : 'text-[#221A13]'
        }`}
      >
        {props.value}
      </div>
    </div>
  );
}

function FeaturedFamilyCard(props: {
  family: WalletContentsFamilyView;
}): React.JSX.Element {
  return (
    <article className="rounded-[24px] border border-[#E7DBD0] bg-[#FFFCF7] p-4 shadow-[0_16px_36px_rgba(28,18,10,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-[-0.04em] text-[#221A13]">
            {props.family.label}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8C7F72]">
            {formatCompactUsd(props.family.grossExposureUsd)} gross
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8C7F72]">
          {formatPercent(props.family.share)}
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E9DED4]">
        <div className="flex h-full w-full">
          {props.family.walletUsd > 0 ? (
            <div
              className="h-full shrink-0 bg-[#4DD999]"
              style={{ width: `${(props.family.walletUsd / props.family.grossExposureUsd) * 100}%` }}
            />
          ) : null}
          {props.family.deployedUsd > 0 ? (
            <div
              className="h-full shrink-0 bg-[#178B5D]"
              style={{ width: `${(props.family.deployedUsd / props.family.grossExposureUsd) * 100}%` }}
            />
          ) : null}
          {props.family.owedUsd > 0 ? (
            <div
              className="h-full shrink-0 bg-[#B23A32]"
              style={{ width: `${(props.family.owedUsd / props.family.grossExposureUsd) * 100}%` }}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <MetricChip label="In wallet" value={props.family.walletUsd} tone="wallet" />
        <MetricChip label="Deployed" value={props.family.deployedUsd} tone="deployed" />
        <MetricChip label="Owed" value={props.family.owedUsd} tone="owed" />
      </div>

      <div className="mt-4 space-y-2">
        {props.family.lines.slice(0, 3).map((line) => {
          const tone = TONE_STYLES[line.tone];

          return (
            <div
              key={line.id}
              className="flex items-center justify-between gap-3 rounded-[14px] border border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2"
            >
              <div className="inline-flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  aria-hidden="true"
                  style={{ backgroundColor: tone.dotColor }}
                />
                <span className="truncate text-sm text-[#3C2A21]">{line.label}</span>
              </div>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[#8C7F72]">
                {formatCompactUsd(line.valueUsd)}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function TailFamilyRow(props: {
  family: WalletContentsFamilyView;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 border-b border-[#E7DBD0] px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[#221A13]">{props.family.label}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          <MetricChip label="In wallet" value={props.family.walletUsd} tone="wallet" compact />
          <MetricChip label="Deployed" value={props.family.deployedUsd} tone="deployed" compact />
          <MetricChip label="Owed" value={props.family.owedUsd} tone="owed" compact />
        </div>
      </div>
      <div className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C7F72]">
        {formatCompactUsd(props.family.grossExposureUsd)} gross
      </div>
    </div>
  );
}

function MetricChip(props: {
  label: string;
  value: number;
  tone: 'wallet' | 'deployed' | 'owed';
  compact?: boolean;
}): React.JSX.Element | null {
  if (props.value <= 0) {
    return null;
  }

  const tone = TONE_STYLES[props.tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono uppercase tracking-[0.12em] ${tone.chipClassName} ${
        props.compact ? 'text-[9px]' : 'text-[10px]'
      }`}
    >
      <span>{props.label}</span>
      <span>{formatCompactUsd(props.value)}</span>
    </span>
  );
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${formatNumber(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `$${formatNumber(value / 1_000)}k`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
