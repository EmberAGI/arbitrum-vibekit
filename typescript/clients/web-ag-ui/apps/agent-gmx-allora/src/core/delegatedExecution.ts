import { createExecution, type Delegation, ExecutionMode } from '@metamask/delegation-toolkit';
import { encodeExecutionCalldatas, encodePermissionContexts } from '@metamask/delegation-toolkit/utils';
import { encodeFunctionData } from 'viem';

import type { OnchainClients } from '../clients/clients.js';
import type { TransactionPlan } from '../clients/onchainActions.js';
import type { DelegationBundle } from '../workflow/context.js';

function normalizeHexAddress(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x') || value.length !== 42) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value.toLowerCase() as `0x${string}`;
}

function normalizeHexData(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value as `0x${string}`;
}

function parseTransactionValue(value: string | undefined): bigint {
  if (!value) {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse transaction value "${value}": ${reason}`);
  }
}

function normalizeDelegationSignature(signature: `0x${string}`): `0x${string}` {
  const bytesLength = (signature.length - 2) / 2;
  if (bytesLength === 66) {
    const prefixByte = Number.parseInt(signature.slice(2, 4), 16);
    if (prefixByte === 65) {
      return `0x${signature.slice(4)}`;
    }
  }
  return signature;
}

function normalizeSignedDelegations(bundle: DelegationBundle): Delegation[] {
  return bundle.delegations.map((delegation) => ({
    ...delegation,
    signature: normalizeDelegationSignature(delegation.signature),
  })) as unknown as Delegation[];
}

function resolvePermissionsContext(bundle: DelegationBundle): `0x${string}` {
  const contexts = encodePermissionContexts([normalizeSignedDelegations(bundle)]);
  const permissionsContext = contexts[0];
  if (!permissionsContext) {
    throw new Error('Delegation bundle did not produce a permissions context.');
  }
  return permissionsContext;
}

function formatDelegatedExecutionError(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      typeof (error as { cause?: unknown }).cause === 'object'
        ? (error as { cause?: { message?: unknown } }).cause?.message
        : undefined;
    if (typeof cause === 'string' && cause.length > 0) {
      return `${error.message} (cause: ${cause})`;
    }
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

const delegationManagerAbi = [
  {
    type: 'function',
    name: 'redeemDelegations',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'permissionContexts',
        type: 'bytes[]',
        internalType: 'bytes[]',
      },
      {
        name: 'modes',
        type: 'bytes32[]',
        internalType: 'ModeCode[]',
      },
      {
        name: 'executionCallDatas',
        type: 'bytes[]',
        internalType: 'bytes[]',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes[]',
        internalType: 'bytes[]',
      },
    ],
  },
] as const;

function buildRedeemDelegationsCalldata(params: {
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
  permissionsContext: `0x${string}`;
}): `0x${string}` {
  const execution = createExecution({
    target: params.to,
    value: params.value,
    callData: params.data,
  });
  return encodeFunctionData({
    abi: delegationManagerAbi,
    functionName: 'redeemDelegations',
    args: [
      [params.permissionsContext],
      [ExecutionMode.SingleDefault],
      encodeExecutionCalldatas([[execution]]),
    ],
  });
}

export async function redeemDelegationsAndExecuteTransactions(params: {
  clients: OnchainClients;
  delegationBundle: DelegationBundle;
  transactions: readonly TransactionPlan[];
}): Promise<{ txHashes: `0x${string}`[]; lastTxHash?: `0x${string}` }> {
  if (params.transactions.length === 0) {
    return { txHashes: [] };
  }

  if (params.delegationBundle.delegations.length === 0) {
    throw new Error('Delegation bundle did not include any signed delegations.');
  }

  const permissionsContext = resolvePermissionsContext(params.delegationBundle);
  const delegationManager = normalizeHexAddress(
    params.delegationBundle.delegationManager,
    'delegation manager',
  );
  const delegatorAddress = normalizeHexAddress(
    params.delegationBundle.delegatorAddress,
    'delegator wallet address',
  );
  const requiredNativeValueWei = params.transactions.reduce(
    (sum, tx) => sum + parseTransactionValue(tx.value),
    0n,
  );
  if (requiredNativeValueWei > 0n) {
    const delegatorBalanceWei = await params.clients.public.getBalance({
      address: delegatorAddress,
    });
    if (delegatorBalanceWei < requiredNativeValueWei) {
      const deficitWei = requiredNativeValueWei - delegatorBalanceWei;
      throw new Error(
        `Delegated GMX execution requires at least ${requiredNativeValueWei.toString()} wei on delegator wallet ${delegatorAddress}, but current balance is ${delegatorBalanceWei.toString()} wei (deficit ${deficitWei.toString()} wei). Fund the delegator wallet with native token and retry.`,
      );
    }
  }

  const txHashes: `0x${string}`[] = [];

  for (const [txIndex, tx] of params.transactions.entries()) {
    const to = normalizeHexAddress(tx.to, 'transaction target');
    const data = normalizeHexData(tx.data, 'transaction data');
    const value = parseTransactionValue(tx.value);
    const calldata = buildRedeemDelegationsCalldata({
      to,
      value,
      data,
      permissionsContext,
    });

    let txHash: `0x${string}`;
    try {
      // delegation-toolkit@0.13.0 drops outer tx `value` in sendTransactionWithDelegation.
      // Outer tx value to DelegationManager must stay 0; execution value is encoded in the call.
      txHash = await params.clients.wallet.sendTransaction({
        account: params.clients.wallet.account,
        chain: params.clients.wallet.chain,
        to: delegationManager,
        data: calldata,
        value: 0n,
      });
    } catch (error: unknown) {
      throw new Error(
        `Delegated GMX transaction submission failed for tx ${txIndex + 1}/${params.transactions.length} (to=${to}, valueWei=${value.toString()}): ${formatDelegatedExecutionError(error)}`,
      );
    }

    const receipt = await params.clients.public.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      throw new Error(
        `Delegated GMX transaction reverted for tx ${txIndex + 1}/${params.transactions.length} (txHash=${txHash})`,
      );
    }

    txHashes.push(txHash);
  }

  return {
    txHashes,
    lastTxHash: txHashes.at(-1),
  };
}
