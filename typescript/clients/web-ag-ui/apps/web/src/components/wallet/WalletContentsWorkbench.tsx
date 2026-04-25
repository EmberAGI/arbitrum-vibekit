import type React from 'react';

import { COINGECKO_TOKEN_ICON_BY_SYMBOL } from '@/constants/coingeckoTokenIcons';
import { iconMonogram, proxyIconUri, resolveTokenIconUri } from '@/utils/iconResolution';

import type {
  LiquidityPositionView,
  PendlePositionView,
  PerpetualPositionView,
} from './WalletPortfolioPanel';
import type {
  WalletContentsFamilyView,
  WalletContentsObservedAssetView,
  WalletContentsView,
} from './walletDashboardView';
import { parseUsdNotional } from './walletDashboardView';

export type WalletContentsDefiPositionsView = {
  perpetuals: PerpetualPositionView[];
  pendle: PendlePositionView[];
  liquidity: LiquidityPositionView[];
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function resolveDisplayQuantityDivisor(observedAsset: WalletContentsObservedAssetView): number {
  const displayQuantity =
    observedAsset.displayQuantity === undefined ? null : Number(observedAsset.displayQuantity);
  if (
    displayQuantity === null ||
    !Number.isFinite(displayQuantity) ||
    displayQuantity <= 0 ||
    observedAsset.quantity <= 0
  ) {
    return 1;
  }

  return observedAsset.quantity / displayQuantity;
}

function formatQuantity(value: number, divisor = 1): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(value / divisor);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatProtocolSystem(value: string | undefined): string {
  if (!value || value.length === 0) {
    return 'Protocol';
  }

  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatScopeKind(value: string | undefined): string {
  if (!value || value.length === 0) {
    return 'Position';
  }

  return value
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function describeObservedAsset(observedAsset: WalletContentsObservedAssetView): string {
  const primaryExposure = observedAsset.economicExposures?.[0]?.asset;

  if (observedAsset.sourceKind === 'wallet') {
    if (observedAsset.asset === observedAsset.familyAsset) {
      return `Direct unmanaged ${observedAsset.familyAsset}`;
    }
    if (primaryExposure === observedAsset.familyAsset) {
      return `Unmanaged wrapper tracking ${observedAsset.familyAsset}`;
    }
    return 'Observed unmanaged balance';
  }

  const protocol = formatProtocolSystem(observedAsset.protocolSystem);

  if (observedAsset.sourceKind === 'debt') {
    return `Owed on ${protocol}`;
  }

  if (primaryExposure === observedAsset.familyAsset) {
    return `Deployed on ${protocol} · tracks ${observedAsset.familyAsset}`;
  }

  return `Deployed on ${protocol}`;
}

function WalletTokenAvatar(props: {
  symbol: string;
  fallbackSymbol?: string;
  small?: boolean;
}): React.JSX.Element {
  const iconUri =
    resolveTokenIconUri({
      symbol: props.symbol,
      tokenIconBySymbol: COINGECKO_TOKEN_ICON_BY_SYMBOL,
    }) ??
    (props.fallbackSymbol
      ? resolveTokenIconUri({
          symbol: props.fallbackSymbol,
          tokenIconBySymbol: COINGECKO_TOKEN_ICON_BY_SYMBOL,
        })
      : null);

  if (iconUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyIconUri(iconUri)}
        alt=""
        loading="lazy"
        decoding="async"
        className={`rounded-full bg-[#FFF7EE] object-contain ring-1 ring-[#DCCAB8] ${
          props.small ? 'h-8 w-8' : 'h-10 w-10'
        }`}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-[#E7DBD0] bg-[#F5EBE0] font-mono font-semibold uppercase tracking-[0.16em] text-[#6D5B4C] ${
        props.small ? 'h-8 w-8 text-[9px]' : 'h-10 w-10 text-[10px]'
      }`}
      aria-hidden="true"
    >
      {iconMonogram(props.fallbackSymbol ?? props.symbol)}
    </span>
  );
}

function FamilyCompositionBar(props: {
  walletUsd: number;
  deployedUsd: number;
  reservedUsd: number;
  owedUsd: number;
  compact?: boolean;
  flush?: boolean;
  showLegend?: boolean;
}): React.JSX.Element {
  const total = props.walletUsd + props.deployedUsd + props.reservedUsd + props.owedUsd;
  const segments = [
    {
      key: 'wallet',
      label: 'Unmanaged',
      value: props.walletUsd,
      className: 'bg-[#A7F3D0]',
    },
    {
      key: 'deployed',
      label: 'Deployed',
      value: props.deployedUsd,
      className: 'bg-[linear-gradient(90deg,#178B5D,#46C98D)]',
    },
    {
      key: 'reserved',
      label: 'Reserved',
      value: props.reservedUsd,
      className: 'bg-[linear-gradient(90deg,#6C97FF,#9CB9FF)]',
    },
    {
      key: 'owed',
      label: 'Owed',
      value: props.owedUsd,
      className: 'bg-[linear-gradient(90deg,#B23A32,#E76F61)]',
    },
  ].filter((segment) => segment.value > 0);
  const legendTextClassName = props.compact ? 'text-[10px]' : 'text-[11px]';
  const wrapperClassName = props.flush ? '' : props.compact ? 'mt-3' : 'mt-4';

  return (
    <div className={wrapperClassName}>
      <div className={`flex gap-px overflow-hidden rounded-full bg-[#E9DED4] ${props.compact ? 'h-1.5' : 'h-2.5'}`}>
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={segment.className}
            style={{ width: `${total > 0 ? (segment.value / total) * 100 : 0}%` }}
            title={`${segment.label} ${formatUsd(segment.value)}`}
          />
        ))}
      </div>
      {props.showLegend === false ? null : (
        <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[#8C7F72] ${legendTextClassName}`}>
          {segments.map((segment) => (
            <span key={`${segment.key}-legend`} className="inline-flex items-center gap-1.5">
              <span
                className={`inline-block rounded-full ${props.compact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${
                  segment.className
                }`}
              />
              <span>
                {segment.label} {formatUsd(segment.value)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WalletAgentAllocationBar(props: {
  observedAsset: WalletContentsObservedAssetView;
}): React.JSX.Element | null {
  const displayQuantityDivisor = resolveDisplayQuantityDivisor(props.observedAsset);
  const blueClassNames = ['bg-[#8EB5FF]', 'bg-[#6C97FF]', 'bg-[#4E78F4]', 'bg-[#335BD1]'];
  const agentEntries = Array.from(
    props.observedAsset.commitments.reduce((groups, commitment) => {
      const currentGroup = groups.get(commitment.agentId);
      if (currentGroup) {
        currentGroup.quantity += commitment.quantity;
        return groups;
      }

      groups.set(commitment.agentId, {
        agentId: commitment.agentId,
        agentLabel: commitment.agentLabel,
        quantity: commitment.quantity,
      });
      return groups;
    }, new Map<string, { agentId: string; agentLabel: string; quantity: number }>()),
  ).map(([, entry], index) => ({
    ...entry,
    className: blueClassNames[index % blueClassNames.length] ?? blueClassNames[0],
  }));

  const segments = [
    ...(props.observedAsset.availableQuantity && props.observedAsset.availableQuantity > 0
      ? [
          {
            key: 'unallocated',
            label: 'Unmanaged',
            value: props.observedAsset.availableQuantity,
            className: 'bg-[#A7F3D0]',
            title: `Unmanaged ${formatQuantity(props.observedAsset.availableQuantity, displayQuantityDivisor)} ${
              props.observedAsset.asset
            }`,
          },
        ]
      : []),
    ...agentEntries.map((entry) => ({
      key: entry.agentId,
      label: entry.agentLabel,
      value: entry.quantity,
      className: entry.className,
      title: `${entry.agentLabel} ${formatQuantity(entry.quantity, displayQuantityDivisor)} ${
        props.observedAsset.asset
      }`,
    })),
  ];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (segments.length <= 1 || total <= 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-[#E9DED4]">
        {segments.map((segment, index) => (
          <span
            key={`${segment.key}-${index}`}
            className={segment.className}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={segment.title}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#8C7F72]">
        {segments.map((segment, index) => (
          <span key={`${segment.key}-legend-${index}`} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${segment.className}`} />
            <span>
              {segment.label} {formatQuantity(segment.value, displayQuantityDivisor)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PositionScopeAllocationBar(props: {
  observedAsset: WalletContentsObservedAssetView;
}): React.JSX.Element {
  const displayQuantityDivisor = resolveDisplayQuantityDivisor(props.observedAsset);
  const label = `${formatProtocolSystem(props.observedAsset.protocolSystem)} / ${formatScopeKind(
    props.observedAsset.scopeKind,
  )}`;

  return (
    <div className="mt-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[#E9DED4]">
        <span
          className="w-full bg-[#6C97FF]"
          title={`${label} ${formatQuantity(props.observedAsset.quantity, displayQuantityDivisor)} ${
            props.observedAsset.asset
          }`}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#8C7F72]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6C97FF]" />
          <span>
            {label} {formatQuantity(props.observedAsset.quantity, displayQuantityDivisor)}
          </span>
        </span>
      </div>
    </div>
  );
}

function ObservedAssetBreakdown(props: {
  observedAsset: WalletContentsObservedAssetView;
  index: number;
}): React.JSX.Element {
  const zebraClassName = props.index % 2 === 0 ? 'bg-[#FFF9F2]' : 'bg-[#FCF5EC]';
  const displayQuantityDivisor = resolveDisplayQuantityDivisor(props.observedAsset);

  return (
    <div className={`${zebraClassName} px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] uppercase tracking-[0.14em] text-[#221A13]">
            {props.observedAsset.asset}
          </div>
          <div className="mt-1 text-xs text-[#6D5B4C]">{describeObservedAsset(props.observedAsset)}</div>
        </div>
        <div className="text-right">
          <div className={props.observedAsset.sourceKind === 'debt' ? 'text-sm text-[#B23A32]' : 'text-sm text-[#221A13]'}>
            {props.observedAsset.sourceKind === 'debt' ? '-' : ''}
            {formatUsd(props.observedAsset.valueUsd)}
          </div>
          <div className="mt-1 text-[11px] text-[#8C7F72]">
            {formatQuantity(props.observedAsset.quantity, displayQuantityDivisor)} {props.observedAsset.asset}
          </div>
        </div>
      </div>
      {props.observedAsset.sourceKind === 'wallet' ? (
        <WalletAgentAllocationBar observedAsset={props.observedAsset} />
      ) : (
        <PositionScopeAllocationBar observedAsset={props.observedAsset} />
      )}
    </div>
  );
}

function FamilyBreakdown(props: {
  familyView: WalletContentsFamilyView;
}): React.JSX.Element {
  return (
    <div className="border-t border-[#E7DBD0]">
      {props.familyView.observedAssets.map((observedAsset, index) => (
        <ObservedAssetBreakdown
          key={`${props.familyView.id}:${observedAsset.asset}:${observedAsset.sourceKind}:${index}`}
          observedAsset={observedAsset}
          index={index}
        />
      ))}
    </div>
  );
}

function FeaturedCard(props: {
  familyView: WalletContentsFamilyView;
}): React.JSX.Element {
  return (
    <details className="group relative overflow-hidden rounded-[22px] border border-[#E7DBD0] bg-[#FFFCF7] pb-7 shadow-[0_16px_36px_rgba(28,18,10,0.08)]">
      <summary className="list-none cursor-pointer px-3 pb-2 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <WalletTokenAvatar symbol={props.familyView.label} fallbackSymbol={props.familyView.label} />
            <div className="text-base text-[#221A13]">{props.familyView.label}</div>
          </div>
          <div className="rounded-full border border-[#E7DBD0] bg-[#FCF5EC] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
            {formatPercent(props.familyView.share)}
          </div>
        </div>
        <div className="mt-2 text-[32px] font-semibold tracking-[-0.06em] text-[#221A13]">
          {formatUsd(props.familyView.positiveUsd)}
        </div>
        <FamilyCompositionBar
          walletUsd={props.familyView.walletAvailableUsd}
          deployedUsd={props.familyView.deployedUsd}
          reservedUsd={props.familyView.walletCommittedUsd}
          owedUsd={props.familyView.owedUsd}
          compact
        />
        <div className="absolute inset-x-0 bottom-0 flex h-7 justify-center border-t border-[#E7DBD0] bg-[#FFFCF7] pt-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 rotate-180 text-[#6D5B4C] transition-transform duration-150 group-open:rotate-0"
          >
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>
      </summary>
      <FamilyBreakdown familyView={props.familyView} />
    </details>
  );
}

function TailRow(props: {
  familyView: WalletContentsFamilyView;
  index: number;
}): React.JSX.Element {
  return (
    <details className={props.index % 2 === 0 ? 'bg-[#FFF9F2]' : 'bg-[#FCF5EC]'}>
      <summary className="grid list-none cursor-pointer grid-cols-[minmax(0,0.9fr)_minmax(120px,0.8fr)_auto] items-center gap-3 px-3 py-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          <WalletTokenAvatar symbol={props.familyView.label} fallbackSymbol={props.familyView.label} small />
          <span className="truncate text-xs uppercase tracking-[0.14em] text-[#221A13]">
            {props.familyView.label}
          </span>
        </div>
        <div className="min-w-[120px]">
          <FamilyCompositionBar
            walletUsd={props.familyView.walletAvailableUsd}
            deployedUsd={props.familyView.deployedUsd}
            reservedUsd={props.familyView.walletCommittedUsd}
            owedUsd={props.familyView.owedUsd}
            compact
            flush
            showLegend={false}
          />
        </div>
        <div className="whitespace-nowrap text-right text-[#8C7F72]">
          {formatUsd(props.familyView.positiveUsd)} · {formatPercent(props.familyView.share)}
        </div>
      </summary>
      <div className="pb-1">
        <FamilyBreakdown familyView={props.familyView} />
      </div>
    </details>
  );
}

function EmptyWalletContents(): React.JSX.Element {
  return (
    <div className="rounded-[20px] border border-dashed border-[#E7DBD0] bg-[#FCF5EC] px-4 py-6 text-sm text-[#8C7F72]">
      No priced wallet families yet.
    </div>
  );
}

function DeFiPositionsSection(props: {
  positions: WalletContentsDefiPositionsView;
}): React.JSX.Element {
  return (
    <div className="mt-5 border-t border-[#E7DBD0] pt-4">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-[#8C7F72]">DeFi</h3>

      <div className="mt-3 divide-y divide-[#E7DBD0] border-y border-[#E7DBD0]">
        <div className="py-3">
          <h4 className="text-[13px] font-semibold text-[#3C2A21]">Perpetual Positions</h4>
          {props.positions.perpetuals.length === 0 ? (
            <p className="mt-1 text-sm text-[#8C7F72]">No perpetual positions.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {props.positions.perpetuals.map((position) => (
                <li
                  key={position.key}
                  className="flex items-center justify-between gap-3 bg-[#FCF5EC] px-3 py-2.5 text-sm text-[#221A13]"
                >
                  <span>
                    {position.positionSide.toUpperCase()} · {position.marketAddress.slice(0, 10)}…
                  </span>
                  <span className="font-mono text-[11px] text-[#8C7F72]">
                    ${parseUsdNotional(position.sizeInUsd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="py-3">
          <h4 className="text-[13px] font-semibold text-[#3C2A21]">Pendle Positions</h4>
          {props.positions.pendle.length === 0 ? (
            <p className="mt-1 text-sm text-[#8C7F72]">No Pendle positions.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {props.positions.pendle.map((position) => (
                <li
                  key={`${position.marketIdentifier.chainId}:${position.marketIdentifier.address}`}
                  className="bg-[#FCF5EC] px-3 py-2.5 text-sm text-[#221A13]"
                >
                  {position.marketIdentifier.address.slice(0, 10)}… · PT {position.pt.exactAmount} · YT{' '}
                  {position.yt.exactAmount}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="py-3">
          <h4 className="text-[13px] font-semibold text-[#3C2A21]">CLMM / Camelot Positions</h4>
          {props.positions.liquidity.length === 0 ? (
            <p className="mt-1 text-sm text-[#8C7F72]">No CLMM/Camelot positions.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {props.positions.liquidity.map((position) => (
                <li
                  key={position.positionId ?? position.poolName ?? 'unknown'}
                  className="bg-[#FCF5EC] px-3 py-2.5 text-sm text-[#221A13]"
                >
                  {(position.poolName && position.poolName.length > 0) ? position.poolName : 'Unnamed Pool'}
                  {position.positionValueUsd ? ` · $${parseUsdNotional(position.positionValueUsd)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function WalletContentsWorkbench(props: {
  view: WalletContentsView;
  positions: WalletContentsDefiPositionsView;
}): React.JSX.Element {
  const familyViews = props.view.families;
  const featuredAssets = familyViews.filter((familyView) => familyView.share > 0.04);
  const tailAssets = familyViews.filter((familyView) => familyView.share <= 0.04);
  const reservedUsd = familyViews.reduce((sum, familyView) => sum + familyView.walletCommittedUsd, 0);
  const unmanagedUsd = props.view.summary.walletUsd;
  const deployedUsd = familyViews.reduce((sum, familyView) => sum + familyView.deployedUsd, 0);
  const owedUsd = familyViews.reduce((sum, familyView) => sum + familyView.owedUsd, 0);

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#E7DBD0] bg-[#FFF9F2] shadow-[0_24px_58px_rgba(28,18,10,0.12)]">
      <div className="border-b border-[#E7DBD0] px-4 py-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#8C7F72]">Composition</div>
        <FamilyCompositionBar
          walletUsd={unmanagedUsd}
          deployedUsd={deployedUsd}
          reservedUsd={reservedUsd}
          owedUsd={owedUsd}
        />
      </div>
      <div className="p-4">
        {familyViews.length === 0 ? (
          <EmptyWalletContents />
        ) : (
          <>
            <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featuredAssets.map((familyView) => (
                <FeaturedCard key={familyView.id} familyView={familyView} />
              ))}
            </div>
            <div className="mt-4 border-t border-[#E7DBD0]">
              {tailAssets.map((familyView, index) => (
                <TailRow key={familyView.id} familyView={familyView} index={index} />
              ))}
            </div>
          </>
        )}
        <DeFiPositionsSection positions={props.positions} />
      </div>
    </section>
  );
}
