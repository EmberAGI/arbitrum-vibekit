import { privateKeyToAccount } from 'viem/accounts';

import { createClients } from '../src/clients/clients.js';
import { ARBITRUM_CHAIN_ID, EMBER_API_BASE_URL } from '../src/constants.js';
import {
  EmberCamelotClient,
  type ClmmWithdrawRequest,
  type TransactionInformation,
} from '../src/emberApi.js';
import { executeTransaction } from '../src/core/transaction.js';
import type { WalletPosition } from '../src/domain/types.js';

type WithdrawContext = {
  account: ReturnType<typeof privateKeyToAccount>;
  walletAddress: `0x${string}`;
  chainId: number;
};

async function main() {
  const context = parseContext();
  const clients = createClients(context.account);
  const client = new EmberCamelotClient(EMBER_API_BASE_URL);

  console.info(
    `[WithdrawScript] Loading Camelot positions for ${context.walletAddress} on chain ${context.chainId}`,
  );
  const positions = await client.getWalletPositions(context.walletAddress, context.chainId);

  if (positions.length === 0) {
    console.info('[WithdrawScript] No Camelot positions available for withdrawal');
    return;
  }

  const target: WalletPosition = positions[0];
  console.info(
    `[WithdrawScript] Selected pool ${target.poolAddress} (ticks ${target.tickLower} → ${target.tickUpper})`,
  );

  const payload: ClmmWithdrawRequest = {
    walletAddress: context.walletAddress,
    poolTokenUid: (
      await client.resolvePoolPositions({
        walletAddress: context.walletAddress,
        chainId: context.chainId,
        poolAddress: target.poolAddress,
      })
    ).poolTokenUid,
  };

  const plan = await client.requestWithdrawal(payload);
  if (plan.transactions.length === 0) {
    console.info('[WithdrawScript] Ember API returned no transactions to execute');
    return;
  }

  console.info(`[WithdrawScript] Received ${plan.transactions.length} withdrawal transaction(s)`);
  const hashes: string[] = [];
  for (const tx of plan.transactions) {
    const outcome = await executePlannedTransaction(tx, clients);
    hashes.push(outcome.hash);
    if (outcome.status === 'success') {
      console.info(`[WithdrawScript] Confirmed withdrawal tx ${outcome.hash}`);
      continue;
    }
    console.error(
      `[WithdrawScript] Withdrawal tx ${outcome.hash} reverted: ${
        outcome.revertReason ?? 'no revert reason returned'
      }`,
    );
    console.error('[WithdrawScript] Aborting remaining withdrawal plan transactions.');
    const currentPositions = await client.getWalletPositions(context.walletAddress, context.chainId);
    logPositions(currentPositions);
    throw new Error(`Withdrawal transaction ${outcome.hash} reverted.`);
  }

  console.info(`[WithdrawScript] Completed withdrawal plan with ${hashes.length} transaction(s).`);

  const refreshedPositions = await client.getWalletPositions(
    context.walletAddress,
    context.chainId,
  );
  logPositions(refreshedPositions);
}

function parseContext(): WithdrawContext {
  const privateKeyRaw = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  if (!privateKeyRaw) {
    throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
  }
  const privateKey = normalizeHex(privateKeyRaw.trim(), 'A2A_TEST_AGENT_NODE_PRIVATE_KEY');
  const account = privateKeyToAccount(privateKey);
  const walletAddress = account.address.toLowerCase() as `0x${string}`;

  const overrideWallet = process.argv[2];
  if (overrideWallet && normalizeHex(overrideWallet, 'wallet address') !== walletAddress) {
    throw new Error(
      `Provided wallet (${overrideWallet}) does not match derived account ${walletAddress}`,
    );
  }

  const chainArg = process.env['CLMM_CHAIN_ID'];
  const chainId = chainArg ? Number(chainArg) : ARBITRUM_CHAIN_ID;
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid CLMM_CHAIN_ID value: ${chainArg}`);
  }

  return { account, walletAddress, chainId };
}

function normalizeHex(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value.toLowerCase() as `0x${string}`;
}

function logPositions(positions: WalletPosition[]) {
  if (positions.length === 0) {
    console.info('[WithdrawScript] Wallet has no reported Camelot positions after withdrawal');
    return;
  }

  console.info(
    `[WithdrawScript] Wallet still reports ${positions.length} Camelot position(s). (Ledger updates are eventually consistent.)`,
  );
  positions.forEach((position, index) => {
    console.info(
      `[WithdrawScript] [${index}] Pool=${position.poolAddress} ticks=${position.tickLower} → ${position.tickUpper}`,
    );
  });
}

type ExecutedTransactionResult =
  | { status: 'success'; hash: string }
  | { status: 'reverted'; hash: string; revertReason?: string };

async function executePlannedTransaction(
  tx: TransactionInformation,
  clients: ReturnType<typeof createClients>,
): Promise<ExecutedTransactionResult> {
  const value = parseTransactionValue(tx.value);
  const receipt = await executeTransaction(clients, {
    to: tx.to,
    data: tx.data,
    ...(value > 0n ? { value } : {}),
  });

  if (receipt.status === 'success') {
    return { status: 'success', hash: receipt.transactionHash };
  }

  const revertReason = await describeRevertReason(tx, value, clients, receipt.blockNumber);
  return { status: 'reverted', hash: receipt.transactionHash, revertReason };
}

function parseTransactionValue(value: string | undefined) {
  if (!value) {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    throw new Error(`Unable to parse transaction value "${value}": ${reason}`);
  }
}

async function describeRevertReason(
  tx: TransactionInformation,
  value: bigint,
  clients: ReturnType<typeof createClients>,
  blockNumber: bigint,
) {
  try {
    await clients.public.call({
      account: clients.wallet.account,
      to: tx.to,
      data: tx.data,
      ...(value > 0n ? { value } : {}),
      blockNumber,
    });
    return 'Call succeeded when replayed; original revert reason unavailable.';
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown revert reason';
  }
}

main().catch((error) => {
  console.error('[WithdrawScript] Failed to execute withdrawal');
  console.error(error);
  process.exitCode = 1;
});
