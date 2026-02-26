import type React from 'react';
import { formatUnits } from 'viem';

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
      <section className="rounded-lg border border-[#2a2a2a] bg-[#121212] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Token Balances</h2>
          <div className="text-right">
            <div className="text-xs text-gray-400">Wallet Total</div>
            <div className="text-sm font-medium text-gray-100">
              {hasWalletTotalUsd ? formatUsd(walletTotalUsd) : '--'}
            </div>
          </div>
        </div>
        {props.balances.length === 0 ? (
          <p className="text-sm text-gray-400">No token balances found.</p>
        ) : (
          <ul className="space-y-2">
            {props.balances.map((balance) => (
              <li
                key={`${balance.tokenUid.chainId}:${balance.tokenUid.address}`}
                className="flex items-center justify-between text-sm text-gray-200"
              >
                <span>{balance.symbol ?? balance.tokenUid.address}</span>
                <div className="text-right">
                  <div>{formatBalanceAmount(balance)}</div>
                  <div className="text-xs text-gray-400">
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

      <section className="rounded-lg border border-[#2a2a2a] bg-[#121212] p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Perpetual Positions</h2>
        {props.positions.perpetuals.length === 0 ? (
          <p className="text-sm text-gray-400">No perpetual positions.</p>
        ) : (
          <ul className="space-y-2">
            {props.positions.perpetuals.map((position) => (
              <li key={position.key} className="text-sm text-gray-200">
                {position.positionSide.toUpperCase()} · {position.marketAddress.slice(0, 10)}… · $
                {position.sizeInUsd}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-[#2a2a2a] bg-[#121212] p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Pendle Positions</h2>
        {props.positions.pendle.length === 0 ? (
          <p className="text-sm text-gray-400">No Pendle positions.</p>
        ) : (
          <ul className="space-y-2">
            {props.positions.pendle.map((position) => (
              <li
                key={`${position.marketIdentifier.chainId}:${position.marketIdentifier.address}`}
                className="text-sm text-gray-200"
              >
                {position.marketIdentifier.address.slice(0, 10)}… · PT {position.pt.exactAmount} · YT{' '}
                {position.yt.exactAmount}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-[#2a2a2a] bg-[#121212] p-4">
        <h2 className="text-lg font-semibold text-white mb-3">CLMM / Camelot Positions</h2>
        {props.positions.liquidity.length === 0 ? (
          <p className="text-sm text-gray-400">No CLMM/Camelot positions.</p>
        ) : (
          <ul className="space-y-2">
            {props.positions.liquidity.map((position) => (
              <li key={position.positionId ?? position.poolName ?? 'unknown'} className="text-sm text-gray-200">
                {(position.poolName && position.poolName.length > 0) ? position.poolName : 'Unnamed Pool'}
                {position.positionValueUsd ? ` · $${position.positionValueUsd}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
