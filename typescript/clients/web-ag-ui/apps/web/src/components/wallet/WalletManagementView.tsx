'use client';

import type { Account, Chain, Transport, WalletClient } from 'viem';

import {
  WalletPortfolioPanel,
  type LiquidityPositionView,
  type PendlePositionView,
  type PerpetualPositionView,
  type WalletBalanceView,
} from './WalletPortfolioPanel';
import { WalletWithdrawPanel } from './WalletWithdrawPanel';

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
  onWithdrawConfirmed?: (hash: string) => Promise<void> | void;
};

function formatAddress(value: string): string {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function WalletManagementView(props: WalletManagementViewProps): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-6">
      <section className="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
        <h1 className="text-2xl font-semibold text-white">Manage Wallet</h1>
        <p className="mt-2 text-sm text-gray-400">MetaMask smart account: {formatAddress(props.walletAddress)}</p>
      </section>

      <WalletPortfolioPanel balances={props.portfolio.balances} positions={props.portfolio.positions} />

      <WalletWithdrawPanel
        sourceAddress={props.walletAddress}
        connectedDestinationAddress={props.connectedDestinationAddress}
        walletClient={props.walletClient}
        balances={props.portfolio.balances}
        onWithdrawConfirmed={props.onWithdrawConfirmed}
      />
    </div>
  );
}

export type { WalletManagementViewProps, WalletPortfolioView };
