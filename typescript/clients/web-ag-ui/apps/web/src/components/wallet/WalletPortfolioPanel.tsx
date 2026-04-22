import type React from 'react';
import { formatUnits } from 'viem';

import { parseUsdNotional } from './walletDashboardView';

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
  balances: WalletBalanceView[];
  positions: {
    perpetuals: PerpetualPositionView[];
    pendle: PendlePositionView[];
    liquidity: LiquidityPositionView[];
  };
};

function formatBalanceAmount(balance: WalletBalanceView): string {
  if (typeof balance.decimals !== 'number') {
    return balance.amount;
  }

  try {
    return formatUnits(BigInt(balance.amount), balance.decimals);
  } catch {
    return balance.amount;
  }
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function WalletPortfolioPanel(props: WalletPortfolioPanelProps): React.JSX.Element {
  const walletTotalUsd = props.balances.reduce((total, balance) => {
    if (typeof balance.valueUsd !== 'number' || !Number.isFinite(balance.valueUsd)) {
      return total;
    }
    return total + balance.valueUsd;
  }, 0);

  const hasWalletTotalUsd = props.balances.some(
    (balance) => typeof balance.valueUsd === 'number' && Number.isFinite(balance.valueUsd),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#221A13]">Token Balances</h2>
          <div className="text-right">
            <div className="text-xs text-[#8C7F72]">Wallet Total</div>
            <div className="text-sm font-medium text-[#221A13]">
              {hasWalletTotalUsd ? formatUsd(walletTotalUsd) : '--'}
            </div>
          </div>
        </div>
        {props.balances.length === 0 ? (
          <p className="text-sm text-[#8C7F72]">No token balances found.</p>
        ) : (
          <ul className="space-y-2">
            {props.balances.map((balance) => (
              <li
                key={`${balance.tokenUid.chainId}:${balance.tokenUid.address}`}
                className="flex items-center justify-between rounded-[16px] border border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2.5 text-sm text-[#221A13]"
              >
                <span>{balance.symbol ?? balance.tokenUid.address}</span>
                <div className="text-right">
                  <div>{formatBalanceAmount(balance)}</div>
                  <div className="text-xs text-[#8C7F72]">
                    {typeof balance.valueUsd === 'number' && Number.isFinite(balance.valueUsd)
                      ? formatUsd(balance.valueUsd)
                      : '--'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
        <h2 className="mb-3 text-lg font-semibold text-[#221A13]">Perpetual Positions</h2>
        {props.positions.perpetuals.length === 0 ? (
          <p className="text-sm text-[#8C7F72]">No perpetual positions.</p>
        ) : (
          <ul className="space-y-2">
            {props.positions.perpetuals.map((position) => (
              <li
                key={position.key}
                className="rounded-[16px] border border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2.5 text-sm text-[#221A13]"
              >
                {position.positionSide.toUpperCase()} · {position.marketAddress.slice(0, 10)}… · $
                {parseUsdNotional(position.sizeInUsd)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
        <h2 className="mb-3 text-lg font-semibold text-[#221A13]">Pendle Positions</h2>
        {props.positions.pendle.length === 0 ? (
          <p className="text-sm text-[#8C7F72]">No Pendle positions.</p>
        ) : (
          <ul className="space-y-2">
            {props.positions.pendle.map((position) => (
              <li
                key={`${position.marketIdentifier.chainId}:${position.marketIdentifier.address}`}
                className="rounded-[16px] border border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2.5 text-sm text-[#221A13]"
              >
                {position.marketIdentifier.address.slice(0, 10)}… · PT {position.pt.exactAmount} · YT{' '}
                {position.yt.exactAmount}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
        <h2 className="mb-3 text-lg font-semibold text-[#221A13]">CLMM / Camelot Positions</h2>
        {props.positions.liquidity.length === 0 ? (
          <p className="text-sm text-[#8C7F72]">No CLMM/Camelot positions.</p>
        ) : (
          <ul className="space-y-2">
            {props.positions.liquidity.map((position) => (
              <li
                key={position.positionId ?? position.poolName ?? 'unknown'}
                className="rounded-[16px] border border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2.5 text-sm text-[#221A13]"
              >
                {(position.poolName && position.poolName.length > 0) ? position.poolName : 'Unnamed Pool'}
                {position.positionValueUsd ? ` · $${parseUsdNotional(position.positionValueUsd)}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
