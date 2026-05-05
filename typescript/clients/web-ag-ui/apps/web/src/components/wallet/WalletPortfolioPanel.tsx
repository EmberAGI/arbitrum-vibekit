import type React from 'react';

import { RectangularTreemap } from '@/components/dashboard/RectangularTreemap';
import type { DashboardTreemapItem } from '@/components/dashboard/dashboardTypes';

export type WalletBalanceView = {
  tokenUid: {
    chainId: string;
    address: string;
  };
  amount: string;
  symbol?: string;
  decimals?: number;
  valueUsd?: number;
};

export type PerpetualPositionView = {
  key: string;
  marketAddress: string;
  positionSide: 'long' | 'short';
  sizeInUsd: string;
};

export type PendlePositionView = {
  marketIdentifier: {
    chainId: string;
    address: string;
  };
  pt: {
    exactAmount: string;
  };
  yt: {
    exactAmount: string;
  };
};

export type LiquidityPositionView = {
  positionId?: string;
  poolName?: string;
  positionValueUsd?: string;
};

export type WalletPortfolioPanelProps = {
  treemapItems: DashboardTreemapItem[];
  totalExposureLabel: string;
};

export function WalletPortfolioPanel(props: WalletPortfolioPanelProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] px-5 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
            <span>Assets</span>
            <span>{props.totalExposureLabel}</span>
          </div>
          <div className="truncate text-[12px] font-medium text-[#8C7F72]">
            Wallet + visible deployed exposure
          </div>
        </div>
        <div className="relative mt-3">
          {props.treemapItems.length > 0 ? (
            <RectangularTreemap className="h-[188px]" items={props.treemapItems} />
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
    </div>
  );
}
