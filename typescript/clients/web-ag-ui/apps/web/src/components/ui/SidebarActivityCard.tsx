'use client';

import { useCallback, useId, useMemo, useState } from 'react';

import { iconMonogram, proxyIconUri } from '../../utils/iconResolution';

type AgentAvatarTone = {
  baseClassName: string;
  orbClassName: string;
  slabClassName: string;
  dotClassName: string;
};

export type SidebarActivityCardTokenSlice = {
  asset: string;
  share: number;
  iconUri?: string | null;
  fallbackIconSymbol?: string;
};

export type SidebarActivityCardControlSlice = {
  id: string;
  label: string;
  share: number;
  colorHex: string;
};

export type SidebarActivityCardView = {
  id: string;
  label: string;
  statusLabel?: string;
  statusTone: 'active' | 'blocked' | 'completed';
  valueUsd?: number;
  positiveAssetsUsd?: number;
  liabilitiesUsd?: number;
  allocationShare?: number;
  allocationShareLabel?: string;
  metricBadge?: string;
  thirtyDayPnlPct?: number;
  tokenBreakdown: SidebarActivityCardTokenSlice[];
  controlBreakdown?: SidebarActivityCardControlSlice[];
};

type CursorPos = {
  x: number;
  y: number;
};

const TOKEN_COLORS = ['#3566E8', '#7A5AF8', '#0EA5E9', '#D84E8F', '#4F46E5'] as const;

function getAgentAvatarTone(agentId: string): AgentAvatarTone {
  if (agentId === 'agent-portfolio-manager') {
    return {
      baseClassName: 'bg-[linear-gradient(135deg,#FF9C5A_0%,#D97B3D_100%)]',
      orbClassName: 'bg-[#FFE1C6]/50',
      slabClassName: 'bg-[#5B3116]/26',
      dotClassName: 'bg-white/32',
    };
  }

  if (agentId === 'agent-clmm' || agentId === 'agent-gmx-allora') {
    return {
      baseClassName: 'bg-[linear-gradient(135deg,#0F3524_0%,#178B5D_100%)]',
      orbClassName: 'bg-[#D9FFEC]/44',
      slabClassName: 'bg-[#0A2A1D]/30',
      dotClassName: 'bg-[#F3FFF8]/55',
    };
  }

  if (agentId === 'agent-ember-lending') {
    return {
      baseClassName: 'bg-[linear-gradient(135deg,#F0E4D6_0%,#D8C4AF_100%)]',
      orbClassName: 'bg-[#FFF4E7]/34',
      slabClassName: 'bg-[#FFF8F0]/35',
      dotClassName: 'bg-[#5E4C3E]/35',
    };
  }

  if (agentId === 'agent-pendle') {
    return {
      baseClassName: 'bg-[linear-gradient(135deg,#BFE9D4_0%,#5DBD88_100%)]',
      orbClassName: 'bg-[#C4EEDC]/34',
      slabClassName: 'bg-[#178B5D]/24',
      dotClassName: 'bg-[#FFF9F2]/45',
    };
  }

  return {
    baseClassName: 'bg-[linear-gradient(135deg,#7C6759_0%,#B89B85_100%)]',
    orbClassName: 'bg-[#F2E8DE]/38',
    slabClassName: 'bg-[#6D5B4C]/28',
    dotClassName: 'bg-white/40',
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function SidebarAgentAvatar(props: {
  agentId: string;
  className?: string;
}) {
  const tone = getAgentAvatarTone(props.agentId);

  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden border border-[#E7D9CB] ${tone.baseClassName} ${props.className ?? 'h-10 w-10 rounded-[14px]'}`}
      aria-hidden="true"
    >
      <span
        className={`absolute inset-x-[18%] top-[16%] h-[42%] rounded-full blur-[2px] ${tone.orbClassName}`}
      />
      <span
        className={`absolute -left-[4%] bottom-[10%] h-[54%] w-[70%] rotate-[18deg] rounded-[8px] ${tone.slabClassName}`}
      />
      <span
        className={`absolute right-[14%] top-[18%] h-[34%] w-[34%] rounded-full ${tone.dotClassName}`}
      />
    </span>
  );
}

function ControlAllocationBar(props: { slices: SidebarActivityCardControlSlice[] | undefined }) {
  if (!props.slices || props.slices.length === 0) {
    return null;
  }

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#E8DDD3]">
      <div className="flex h-full w-full">
        {props.slices.map((slice) => (
          <div
            key={slice.id}
            className="shrink-0"
            style={{
              width: `${slice.share * 100}%`,
              backgroundColor: slice.colorHex,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ControlAllocationLegend(props: { slices: SidebarActivityCardControlSlice[] | undefined }) {
  if (!props.slices || props.slices.length === 0) {
    return null;
  }

  return (
    <div className="mt-[6px] flex flex-wrap gap-x-2.5 gap-y-1 font-mono text-[8px] uppercase tracking-[0.12em] leading-none text-[#8C7F72]">
      {props.slices.map((slice) => (
        <div key={`${slice.id}:legend`} className="inline-flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            aria-hidden="true"
            style={{ backgroundColor: slice.colorHex }}
          />
          <span>{slice.label}</span>
        </div>
      ))}
    </div>
  );
}

function TokenCompositionBar(props: { slices: SidebarActivityCardTokenSlice[] }) {
  if (props.slices.length === 0) {
    return null;
  }

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#E8DDD3]">
      <div className="flex h-full w-full">
        {props.slices.map((slice, index) => (
          <div
            key={`${slice.asset}:${index}`}
            className="shrink-0"
            style={{
              width: `${slice.share * 100}%`,
              backgroundColor: TOKEN_COLORS[index % TOKEN_COLORS.length] ?? TOKEN_COLORS[0],
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CursorTokenTooltip(props: {
  items: {
    label: string;
    iconUri?: string | null;
    fallbackSymbol?: string;
    colorHex: string;
  }[];
  className?: string;
  children: React.ReactNode;
}) {
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<CursorPos>({ x: 0, y: 0 });

  const onMove = useCallback((event: React.MouseEvent) => {
    const padding = 12;
    const maxWidth = 320;
    const maxHeight = 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nextX = clamp(event.clientX + padding, padding, Math.max(padding, vw - maxWidth - padding));
    const nextY = clamp(event.clientY + padding, padding, Math.max(padding, vh - maxHeight - padding));

    setPos({ x: nextX, y: nextY });
  }, []);

  const visibleItems = useMemo(
    () => props.items.filter((item) => item.label.trim().length > 0),
    [props.items],
  );

  return (
    <div
      className={props.className ? `relative ${props.className}` : 'relative'}
      onMouseEnter={(event) => {
        setIsOpen(true);
        onMove(event);
      }}
      onMouseMove={onMove}
      onMouseLeave={() => setIsOpen(false)}
      aria-describedby={isOpen ? tooltipId : undefined}
    >
      {props.children}
      {isOpen && visibleItems.length > 0 ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-[100] w-[min(320px,calc(100vw-24px))] rounded-xl border border-[#E7DBD0] bg-[#FFFDF9]/95 shadow-[0_18px_60px_rgba(28,18,10,0.2)] backdrop-blur-md"
          style={{ left: pos.x, top: pos.y }}
        >
          <div className="max-h-60 overflow-auto p-2.5">
            <div className="flex flex-wrap gap-1.5">
              {visibleItems.map((item) => (
                <span
                  key={`${item.label}-${item.iconUri ?? item.fallbackSymbol ?? ''}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#F7F1EA] px-2 py-1 text-[12px] text-[#221A13] ring-1 ring-[#E7DBD0]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    aria-hidden="true"
                    style={{ backgroundColor: item.colorHex }}
                  />
                  {item.iconUri ? (
                    <img
                      src={proxyIconUri(item.iconUri)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-4 w-4 rounded-full bg-[#FCF8F3] ring-1 ring-[#E7DBD0] object-contain"
                    />
                  ) : (
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#FCF8F3] text-[7px] font-semibold text-[#8C7F72] ring-1 ring-[#E7DBD0]"
                      aria-hidden="true"
                    >
                      {iconMonogram(item.fallbackSymbol ?? item.label)}
                    </span>
                  )}
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TokenCluster(props: {
  slices: SidebarActivityCardTokenSlice[];
  active?: boolean;
}) {
  if (props.slices.length === 0) {
    return (
      <div className="mt-[6px] font-mono text-[8px] uppercase tracking-[0.12em] text-[#8C7F72]">
        No live token mix
      </div>
    );
  }

  const maxIcons = 3;
  const hasOverflow = props.slices.length > maxIcons;
  const displayTokens = props.slices.slice(0, maxIcons);
  const overflowBadgeBackgroundColor = props.active ? '#F7E8DA' : '#F1E7DC';
  const hiddenPreviewColors = hasOverflow
    ? [
        TOKEN_COLORS[maxIcons % TOKEN_COLORS.length] ?? TOKEN_COLORS[0],
        TOKEN_COLORS[(maxIcons + 1) % TOKEN_COLORS.length] ?? TOKEN_COLORS[0],
      ]
    : [];
  const preview = (
    <div className="flex cursor-default flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[8px] uppercase tracking-[0.12em] leading-none text-[#8C7F72]">
      {displayTokens.map((slice, index) => (
        <span key={`${slice.asset}:${index}`} className="inline-flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            aria-hidden="true"
            style={{ backgroundColor: TOKEN_COLORS[index % TOKEN_COLORS.length] ?? TOKEN_COLORS[0] }}
          />
          <span className="text-[#6D5B4C]">{slice.asset}</span>
        </span>
      ))}
      {hasOverflow ? (
        <span className="inline-flex items-center">
          <span className="relative inline-flex h-2 w-4 shrink-0" aria-hidden="true">
            <span
              className="absolute left-0 top-0 h-2 w-2 rounded-full"
              style={{ backgroundColor: hiddenPreviewColors[0] }}
            />
            <span
              className="absolute left-[4px] top-0 h-2 w-2 rounded-full"
              style={{ backgroundColor: hiddenPreviewColors[1] }}
            />
            <span
              className="absolute left-[8px] top-0 inline-flex h-2 w-2 items-center justify-center rounded-full text-[5px] tracking-[-0.08em] text-[#8C7F72]"
              style={{ backgroundColor: overflowBadgeBackgroundColor }}
            >
              …
            </span>
          </span>
        </span>
      ) : null}
    </div>
  );

  if (!hasOverflow) {
    return <div className="mt-[6px]">{preview}</div>;
  }

  return (
    <CursorTokenTooltip
      items={props.slices.map((slice, index) => ({
        label: slice.asset,
        iconUri: slice.iconUri ?? null,
        fallbackSymbol: slice.fallbackIconSymbol ?? slice.asset,
        colorHex: TOKEN_COLORS[index % TOKEN_COLORS.length] ?? TOKEN_COLORS[0],
      }))}
      className="mt-[6px]"
    >
      {preview}
    </CursorTokenTooltip>
  );
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${formatNumber(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `$${formatNumber(value / 1_000)}k`;
  }

  return `$${formatNumber(value)}`;
}

function formatNumber(value: number): string {
  return value
    .toFixed(value >= 10 ? 0 : 1)
    .replace(/\.0$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatNumber(Math.abs(value) * 100)}%`;
}

function statusToneClassName(statusTone: SidebarActivityCardView['statusTone']): string {
  if (statusTone === 'blocked') {
    return 'text-[#B23A32]';
  }

  if (statusTone === 'completed') {
    return 'text-[#3566E8]';
  }

  return 'text-[#178B5D]';
}

function ExposureNumbersInline(props: {
  positiveAssetsUsd: number;
  liabilitiesUsd: number;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[13px] font-semibold tracking-[-0.03em] leading-none">
      <span className="text-[#0F5A38]">{formatCompactUsd(props.positiveAssetsUsd)}</span>
      <span className="inline-flex items-baseline gap-[0.375rem]">
        <span className="text-[#8C7F72]">(</span>
        <span className="text-[#B23A32]">{formatCompactUsd(props.liabilitiesUsd)}</span>
        <span className="text-[#8C7F72]">)</span>
      </span>
    </span>
  );
}

export function SidebarActivityCard(props: {
  card: SidebarActivityCardView;
  onClick?: () => void;
  active?: boolean;
}): React.JSX.Element {
  const summaryLabel =
    props.card.valueUsd === undefined ? props.card.statusLabel : undefined;
  const unallocatedShare =
    props.card.id === 'agent-portfolio-manager'
      ? props.card.controlBreakdown?.find((slice) => slice.id === 'unallocated')?.share
      : undefined;
  const rightBadge =
    typeof props.card.thirtyDayPnlPct === 'number'
      ? `${formatSignedPercent(props.card.thirtyDayPnlPct)} 30d`
      : props.card.metricBadge;
  const rightBadgeClassName =
    typeof props.card.thirtyDayPnlPct === 'number'
      ? props.card.thirtyDayPnlPct >= 0
        ? 'text-[#178B5D]'
        : 'text-[#B23A32]'
      : statusToneClassName(props.card.statusTone);

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`w-full rounded-[18px] border px-3 pt-4 pb-3 text-left transition ${
        props.active
          ? 'border-[#E8C9AA] bg-[#FFF5EA] shadow-[0_12px_28px_rgba(68,46,21,0.08)]'
          : 'border-[#E7DBD0] bg-[#FCF8F3] hover:border-[#E8C9AA] hover:bg-[#FFF7F2]'
      }`}
    >
      <div className="flex items-start gap-3">
        <SidebarAgentAvatar agentId={props.card.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 pt-[3px]">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold leading-none tracking-[-0.03em] text-[#221A13]">
                {props.card.label}
              </div>
              {typeof props.card.positiveAssetsUsd === 'number' &&
              typeof props.card.liabilitiesUsd === 'number' ? (
                <div className="mt-0.5">
                  <ExposureNumbersInline
                    positiveAssetsUsd={props.card.positiveAssetsUsd}
                    liabilitiesUsd={props.card.liabilitiesUsd}
                  />
                </div>
              ) : summaryLabel ? (
                <div className="mt-0.5 text-[13px] font-semibold tracking-[-0.03em] text-[#221A13]">
                  {summaryLabel}
                </div>
              ) : null}
            </div>
            {rightBadge ? (
              <div className={`shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.14em] ${rightBadgeClassName}`}>
                {rightBadge}
              </div>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8C7F72]">
            {props.card.valueUsd !== undefined ? <span>{formatCompactUsd(props.card.valueUsd)} gross</span> : null}
            {props.card.allocationShare !== undefined ? (
              <>
                <span>·</span>
                <span>
                  {formatPercent(props.card.allocationShare)} of{' '}
                  {props.card.allocationShareLabel ?? 'tracked exposure'}
                </span>
              </>
            ) : null}
            {unallocatedShare !== undefined ? (
              <>
                <span>·</span>
                <span>{formatPercent(unallocatedShare)} unmanaged</span>
              </>
            ) : null}
          </div>
          {props.card.controlBreakdown && props.card.controlBreakdown.length > 0 ? (
            <div className="mt-2">
              <ControlAllocationBar slices={props.card.controlBreakdown} />
              <ControlAllocationLegend slices={props.card.controlBreakdown} />
            </div>
          ) : null}
          <div className="mt-2">
            <TokenCompositionBar slices={props.card.tokenBreakdown} />
            <TokenCluster slices={props.card.tokenBreakdown} active={props.active} />
          </div>
        </div>
      </div>
    </button>
  );
}
