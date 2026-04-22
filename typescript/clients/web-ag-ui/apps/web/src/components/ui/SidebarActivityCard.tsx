import type React from 'react';

type AgentAvatarTone = {
  baseClassName: string;
  orbClassName: string;
  slabClassName: string;
  dotClassName: string;
};

export type SidebarActivityCardTokenSlice = {
  asset: string;
  share: number;
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
  statusLabel: string;
  statusTone: 'active' | 'blocked' | 'completed';
  valueUsd?: number;
  allocationShare?: number;
  allocationShareLabel?: string;
  metricBadge?: string;
  tokenBreakdown: SidebarActivityCardTokenSlice[];
  controlBreakdown?: SidebarActivityCardControlSlice[];
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

function AgentAvatar(props: { agentId: string }) {
  const tone = getAgentAvatarTone(props.agentId);

  return (
    <span
      className={`relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-[14px] border border-[#E7D9CB] ${tone.baseClassName}`}
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

function TokenCluster(props: { slices: SidebarActivityCardTokenSlice[] }) {
  if (props.slices.length === 0) {
    return (
      <div className="mt-[6px] font-mono text-[8px] uppercase tracking-[0.12em] text-[#8C7F72]">
        No live token mix
      </div>
    );
  }

  return (
    <div className="mt-[6px] flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[8px] uppercase tracking-[0.12em] leading-none text-[#8C7F72]">
      {props.slices.map((slice, index) => (
        <span key={slice.asset} className="inline-flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            aria-hidden="true"
            style={{ backgroundColor: TOKEN_COLORS[index % TOKEN_COLORS.length] ?? TOKEN_COLORS[0] }}
          />
          <span className="text-[#6D5B4C]">{slice.asset}</span>
        </span>
      ))}
    </div>
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

function statusToneClassName(statusTone: SidebarActivityCardView['statusTone']): string {
  if (statusTone === 'blocked') {
    return 'text-[#B23A32]';
  }

  if (statusTone === 'completed') {
    return 'text-[#3566E8]';
  }

  return 'text-[#178B5D]';
}

export function SidebarActivityCard(props: {
  card: SidebarActivityCardView;
  onClick?: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full rounded-[18px] border border-[#E7DBD0] bg-[#FCF8F3] px-3 pt-4 pb-3 text-left transition hover:border-[#E8C9AA] hover:bg-[#FFF7F2]"
    >
      <div className="flex items-start gap-3">
        <AgentAvatar agentId={props.card.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 pt-[3px]">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold leading-none tracking-[-0.03em] text-[#221A13]">
                {props.card.label}
              </div>
              <div className="mt-0.5 text-[13px] font-semibold tracking-[-0.03em] text-[#221A13]">
                {props.card.valueUsd !== undefined ? `${formatCompactUsd(props.card.valueUsd)} gross` : props.card.statusLabel}
              </div>
            </div>
            <div className={`shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.14em] ${statusToneClassName(props.card.statusTone)}`}>
              {props.card.metricBadge ?? props.card.statusLabel}
            </div>
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
          </div>
          {props.card.controlBreakdown && props.card.controlBreakdown.length > 0 ? (
            <div className="mt-2">
              <ControlAllocationBar slices={props.card.controlBreakdown} />
              <ControlAllocationLegend slices={props.card.controlBreakdown} />
            </div>
          ) : null}
          <div className="mt-2">
            <TokenCompositionBar slices={props.card.tokenBreakdown} />
            <TokenCluster slices={props.card.tokenBreakdown} />
          </div>
        </div>
      </div>
    </button>
  );
}
