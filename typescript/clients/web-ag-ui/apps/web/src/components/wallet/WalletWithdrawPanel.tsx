'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Account,
  type Chain,
  type Hex,
  type Transport,
  type WalletClient,
} from 'viem';

import { DashboardTokenAvatar } from '@/components/dashboard/DashboardTokenAvatar';
import type { WalletBalanceView } from './WalletPortfolioPanel';
import { isUserRejectedTransactionError, validateWithdrawRequest } from './withdraw';
import { defaultEvmChain } from '@/config/evmChains';

type WithdrawResultStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'confirming'; hash: string }
  | { kind: 'confirmed'; hash: string }
  | { kind: 'error'; message: string; hash?: string };

type WalletWithdrawPanelProps = {
  sourceAddress: string;
  connectedDestinationAddress: string | null;
  walletClient: WalletClient<Transport, Chain, Account> | null;
  balances: WalletBalanceView[];
  onWithdrawSubmitted?: (hash: string) => void;
  onWithdrawConfirmed?: (hash: string) => Promise<void> | void;
};

const ZERO_ADDRESS = `0x${'0'.repeat(40)}` as const;

function tokenLabel(balance: WalletBalanceView): string {
  return balance.symbol ?? `${balance.tokenUid.address.slice(0, 8)}…`;
}

function balanceKey(balance: WalletBalanceView): string {
  return `${balance.tokenUid.chainId}:${balance.tokenUid.address.toLowerCase()}`;
}

export function formatWithdrawTokenAmount(input: {
  amount: string;
  decimals?: number;
}): string {
  return formatUnits(BigInt(input.amount), input.decimals ?? 18);
}

export function getPreferredSelectedTokenKey(input: {
  currentKey: string;
  balances: WalletBalanceView[];
}): string {
  if (input.balances.length === 0) return '';

  const hasCurrentSelection =
    input.currentKey.length > 0 &&
    input.balances.some((balance) => balanceKey(balance) === input.currentKey);

  if (hasCurrentSelection) return input.currentKey;
  return balanceKey(input.balances[0]);
}

function isNativeToken(balance: WalletBalanceView): boolean {
  if ((balance.symbol ?? '').toUpperCase() === 'ETH') return true;
  return balance.tokenUid.address.toLowerCase() === ZERO_ADDRESS;
}

function resolveRpcUrl(chain: Chain): string | null {
  const defaultHttp = chain.rpcUrls.default.http[0];
  if (typeof defaultHttp === 'string' && defaultHttp.length > 0) return defaultHttp;

  const publicHttp = chain.rpcUrls.public?.http?.[0];
  if (typeof publicHttp === 'string' && publicHttp.length > 0) return publicHttp;

  return null;
}

function formatHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function WalletWithdrawPanel(props: WalletWithdrawPanelProps): React.JSX.Element {
  const [mode, setMode] = useState<'connected' | 'custom'>(
    props.connectedDestinationAddress ? 'connected' : 'custom',
  );
  const [customDestination, setCustomDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [userSelectedTokenKey, setUserSelectedTokenKey] = useState<string>('');
  const [status, setStatus] = useState<WithdrawResultStatus>({ kind: 'idle' });

  const selectedTokenKey = getPreferredSelectedTokenKey({
    currentKey: userSelectedTokenKey,
    balances: props.balances,
  });

  const selectedToken = useMemo(() => {
    return (
      props.balances.find((balance) => balanceKey(balance) === selectedTokenKey) ??
      props.balances[0] ??
      null
    );
  }, [props.balances, selectedTokenKey]);

  const canSubmit = props.walletClient !== null && selectedToken !== null && amount.trim().length > 0;
  const isWorking = status.kind === 'submitting' || status.kind === 'confirming';
  const selectedTokenBalance = selectedToken
    ? formatWithdrawTokenAmount({
        amount: selectedToken.amount,
        decimals: selectedToken.decimals,
      })
    : '';

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const validated = validateWithdrawRequest({
      mode,
      customDestination,
      connectedDestination: props.connectedDestinationAddress,
      sourceAddress: props.sourceAddress,
      amount,
    });

    if (!validated.ok) {
      setStatus({ kind: 'error', message: validated.error });
      return;
    }

    if (!props.walletClient) {
      setStatus({ kind: 'error', message: 'Connect your wallet to submit withdrawals.' });
      return;
    }

    if (!selectedToken) {
      setStatus({ kind: 'error', message: 'Select a token to withdraw.' });
      return;
    }

    const tokenDecimals = selectedToken.decimals ?? 18;

    try {
      setStatus({ kind: 'submitting' });

      let hash: Hex;
      if (isNativeToken(selectedToken)) {
        hash = await props.walletClient.sendTransaction({
          account: props.sourceAddress as Hex,
          to: validated.destinationAddress as Hex,
          value: parseUnits(amount, tokenDecimals),
        });
      } else {
        hash = await props.walletClient.writeContract({
          account: props.sourceAddress as Hex,
          abi: erc20Abi,
          address: selectedToken.tokenUid.address as Hex,
          functionName: 'transfer',
          args: [validated.destinationAddress as Hex, parseUnits(amount, tokenDecimals)],
        });
      }

      setStatus({ kind: 'confirming', hash });
      props.onWithdrawSubmitted?.(hash);

      const chain = props.walletClient.chain ?? defaultEvmChain;
      const rpcUrl = resolveRpcUrl(chain);
      if (!rpcUrl) {
        setStatus({ kind: 'error', message: 'Unable to track confirmation on the current chain.', hash });
        return;
      }

      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        setStatus({ kind: 'error', message: 'Transaction was submitted but did not confirm.', hash });
        return;
      }

      setStatus({ kind: 'confirmed', hash });
      await props.onWithdrawConfirmed?.(hash);
    } catch (error) {
      if (isUserRejectedTransactionError(error)) {
        console.info('[wallet-withdraw] User rejected transaction request.');
        setStatus({ kind: 'idle' });
        return;
      }

      const message = error instanceof Error ? error.message : 'Failed to submit withdraw transaction.';
      setStatus({ kind: 'error', message });
    }
  };

  return (
    <section className="rounded-[28px] border border-[#F0D9C7] bg-[#FFF9F2] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.08)]">
      <h2 className="mb-4 text-lg font-semibold text-[#221A13]">Withdraw</h2>

      {status.kind !== 'idle' && (
        <div className="mb-4 rounded-[18px] border border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2.5">
          {status.kind === 'submitting' && (
            <div className="flex items-center gap-2 text-sm text-[#221A13]">
              <Loader2 className="h-4 w-4 animate-spin text-[#178B5D]" />
              <span>Submitting transaction...</span>
            </div>
          )}
          {status.kind === 'confirming' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-[#221A13]">
                <Loader2 className="h-4 w-4 animate-spin text-[#178B5D]" />
                <span>Transaction submitted. Waiting for confirmation...</span>
              </div>
              <div className="break-all font-mono text-xs text-[#8C7F72]">{status.hash}</div>
            </div>
          )}
          {status.kind === 'confirmed' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-[#0F5A38]">
                <CheckCircle className="h-4 w-4 text-[#178B5D]" />
                <span>Confirmed: {formatHash(status.hash)}</span>
              </div>
              <div className="break-all font-mono text-xs text-[#8C7F72]">{status.hash}</div>
            </div>
          )}
          {status.kind === 'error' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-[#B23A32]">
                <AlertCircle className="h-4 w-4 text-[#B23A32]" />
                <span>{status.message}</span>
              </div>
              {status.hash && <div className="break-all font-mono text-xs text-[#8C7F72]">{status.hash}</div>}
            </div>
          )}
        </div>
      )}

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-[#8C7F72]">Destination</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#221A13]">
              <input
                type="radio"
                name="destination-mode"
                checked={mode === 'connected'}
                onChange={() => setMode('connected')}
                disabled={!props.connectedDestinationAddress}
              />
              <span>
                Connected wallet
                {props.connectedDestinationAddress && (
                  <span className="ml-2 font-mono text-xs text-gray-400">
                    {props.connectedDestinationAddress}
                  </span>
                )}
              </span>
            </label>
            {!props.connectedDestinationAddress && (
              <p className="text-xs text-[#8C7F72]">
                No connected destination wallet detected.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-[#221A13]">
              <input
                type="radio"
                name="destination-mode"
                checked={mode === 'custom'}
                onChange={() => setMode('custom')}
              />
              Custom destination
            </label>
            {mode === 'custom' && (
              <input
                type="text"
                value={customDestination}
                onChange={(event) => setCustomDestination(event.target.value)}
                placeholder="0x..."
                className="w-full rounded-xl border border-[#E7DBD0] bg-[#FFF9F2] px-3 py-2 text-sm text-[#221A13]"
              />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-[#8C7F72]">Token</div>
          <div className="grid gap-2">
            {props.balances.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#E7DBD0] bg-[#FCF5EC] px-3 py-2 text-sm text-[#8C7F72]">
                No tokens available
              </div>
            )}
            {props.balances.map((balance) => {
              const key = balanceKey(balance);
              const label = tokenLabel(balance);
              const formattedBalance = formatWithdrawTokenAmount({
                amount: balance.amount,
                decimals: balance.decimals,
              });
              const isSelected = key === selectedTokenKey;

              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Select ${label}`}
                  aria-pressed={isSelected}
                  onClick={() => setUserSelectedTokenKey(key)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    isSelected
                      ? 'border-[#FD6731]/40 bg-[#FFF0E6] text-[#221A13]'
                      : 'border-[#E7DBD0] bg-[#FFFCF7] text-[#221A13] hover:border-[#E8C9AA]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <DashboardTokenAvatar symbol={balance.symbol} fallbackSymbol={label} small />
                    <span className="truncate text-sm font-medium">{label}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[#8C7F72]">
                    {formattedBalance} {label} available
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs uppercase tracking-wide text-[#8C7F72]" htmlFor="withdraw-amount-input">
              Amount
            </label>
            <button
              type="button"
              onClick={() => setAmount(selectedTokenBalance)}
              disabled={!selectedToken}
              className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FD6731] disabled:text-[#C7B6A4]"
            >
              Max
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#E7DBD0] bg-[#FFF9F2] px-3 py-2">
            <input
              id="withdraw-amount-input"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.0"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#221A13] outline-none"
            />
            {selectedToken ? (
              <span className="shrink-0 text-xs font-medium text-[#8C7F72]">
                {tokenLabel(selectedToken)}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-[#FD6731] px-3 py-2 text-sm font-medium text-white shadow-[0_12px_24px_rgba(253,103,49,0.24)] disabled:opacity-60"
          disabled={!canSubmit || isWorking}
        >
          {status.kind === 'submitting'
            ? 'Submitting...'
            : status.kind === 'confirming'
              ? 'Confirming...'
              : 'Withdraw'}
        </button>
      </form>
    </section>
  );
}

export type { WalletWithdrawPanelProps };
