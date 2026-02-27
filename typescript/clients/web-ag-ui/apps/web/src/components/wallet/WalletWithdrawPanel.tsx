'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  createPublicClient,
  erc20Abi,
  http,
  parseUnits,
  type Account,
  type Chain,
  type Hex,
  type Transport,
  type WalletClient,
} from 'viem';

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
    <section className="rounded-lg border border-[#2a2a2a] bg-[#121212] p-4">
      <h2 className="text-lg font-semibold text-white mb-3">Withdraw</h2>
      <p className="text-sm text-gray-400 mb-4">
        Move funds from your MetaMask smart account to another wallet.
      </p>

      {status.kind !== 'idle' && (
        <div className="mb-4 rounded-xl border border-[#252833] bg-[#111319] px-3 py-2.5">
          {status.kind === 'submitting' && (
            <div className="flex items-center gap-2 text-sm text-[#E7E7EC]">
              <Loader2 className="h-4 w-4 animate-spin text-teal-300" />
              <span>Submitting transaction...</span>
            </div>
          )}
          {status.kind === 'confirming' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-[#E7E7EC]">
                <Loader2 className="h-4 w-4 animate-spin text-teal-300" />
                <span>Transaction submitted. Waiting for confirmation...</span>
              </div>
              <div className="font-mono text-xs text-[#8D8D97] break-all">{status.hash}</div>
            </div>
          )}
          {status.kind === 'confirmed' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-[#D6F5E6]">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span>Confirmed: {formatHash(status.hash)}</span>
              </div>
              <div className="font-mono text-xs text-[#8D8D97] break-all">{status.hash}</div>
            </div>
          )}
          {status.kind === 'error' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-red-300">
                <AlertCircle className="h-4 w-4 text-red-300" />
                <span>{status.message}</span>
              </div>
              {status.hash && <div className="font-mono text-xs text-[#8D8D97] break-all">{status.hash}</div>}
            </div>
          )}
        </div>
      )}

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-gray-400">Destination</label>
          <div className="flex flex-col gap-2 rounded-md border border-[#2a2a2a] bg-[#0f0f0f] p-3">
            <label className="flex items-center gap-2 text-sm text-gray-200">
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
              <p className="text-xs text-gray-500">
                No connected destination wallet detected. You can still withdraw to a custom address.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-200">
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
                className="w-full rounded-md border border-[#2a2a2a] bg-[#151515] px-3 py-2 text-sm text-gray-200"
              />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-gray-400" htmlFor="withdraw-token-select">
            Token
          </label>
          <select
            id="withdraw-token-select"
            value={selectedTokenKey}
            onChange={(event) => setUserSelectedTokenKey(event.target.value)}
            className="w-full rounded-md border border-[#2a2a2a] bg-[#151515] px-3 py-2 text-sm text-gray-200"
          >
            {props.balances.length === 0 && <option value="">No tokens available</option>}
            {props.balances.map((balance) => (
              <option key={balanceKey(balance)} value={balanceKey(balance)}>
                {tokenLabel(balance)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-gray-400" htmlFor="withdraw-amount-input">
            Amount
          </label>
          <input
            id="withdraw-amount-input"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.0"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#151515] px-3 py-2 text-sm text-gray-200"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-[#fd6731] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
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
