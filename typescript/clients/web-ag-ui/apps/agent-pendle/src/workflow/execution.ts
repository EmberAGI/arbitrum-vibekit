import type { OnchainClients } from '../clients/clients.js';
import type {
  OnchainActionsClient,
  Token,
  TransactionPlan,
  TokenizedYieldMarket,
  TokenizedYieldPosition,
} from '../clients/onchainActions.js';
import { executeTransaction } from '../core/transaction.js';

import { logInfo, normalizeHexAddress } from './context.js';

type ExecutionResult = {
  txHashes: `0x${string}`[];
  lastTxHash?: `0x${string}`;
};

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

function parseTokenAmount(value: string, label: string): bigint {
  try {
    return BigInt(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse ${label} amount "${value}": ${reason}`);
  }
}

function isSameToken(
  left: { chainId: string; address: string },
  right: { chainId: string; address: string },
): boolean {
  return (
    left.chainId === right.chainId &&
    left.address.toLowerCase() === right.address.toLowerCase()
  );
}

async function executePlannedTransaction(params: {
  clients: OnchainClients;
  tx: TransactionPlan;
}): Promise<`0x${string}`> {
  const to = normalizeHexAddress(params.tx.to, 'transaction target');
  const data = normalizeHexData(params.tx.data, 'transaction data');
  const value = parseTransactionValue(params.tx.value);

  logInfo('Submitting Pendle transaction', {
    to,
    chainId: params.tx.chainId,
    value: params.tx.value,
  });

  const receipt = await executeTransaction(params.clients, { to, data, value });

  logInfo('Pendle transaction confirmed', {
    transactionHash: receipt.transactionHash,
  });

  return receipt.transactionHash;
}

async function executePlanTransactions(params: {
  clients: OnchainClients;
  transactions: TransactionPlan[];
}): Promise<ExecutionResult> {
  if (params.transactions.length === 0) {
    throw new Error('No transactions provided for Pendle execution');
  }

  const txHashes: `0x${string}`[] = [];

  for (const tx of params.transactions) {
    const hash = await executePlannedTransaction({ clients: params.clients, tx });
    txHashes.push(hash);
  }

  return {
    txHashes,
    lastTxHash: txHashes.at(-1),
  };
}

export async function executeRebalance(params: {
  onchainActionsClient: Pick<
    OnchainActionsClient,
    'createTokenizedYieldSellPt' | 'createSwap' | 'createTokenizedYieldBuyPt'
  >;
  clients: OnchainClients;
  walletAddress: `0x${string}`;
  position: TokenizedYieldPosition;
  currentMarket: TokenizedYieldMarket;
  targetMarket: TokenizedYieldMarket;
}): Promise<ExecutionResult> {
  const sellPlan = await params.onchainActionsClient.createTokenizedYieldSellPt({
    walletAddress: params.walletAddress,
    ptTokenUid: params.position.pt.token.tokenUid,
    amount: params.position.pt.exactAmount,
    slippage: '0.01',
  });

  let amountForBuy = sellPlan.exactAmountOut;
  const transactions: TransactionPlan[] = [...sellPlan.transactions];

  const currentUnderlying = params.currentMarket.underlyingToken.tokenUid;
  const targetUnderlying = params.targetMarket.underlyingToken.tokenUid;

  if (
    currentUnderlying.chainId !== targetUnderlying.chainId ||
    currentUnderlying.address.toLowerCase() !== targetUnderlying.address.toLowerCase()
  ) {
    const swapPlan = await params.onchainActionsClient.createSwap({
      walletAddress: params.walletAddress,
      amount: sellPlan.exactAmountOut,
      amountType: 'exactIn',
      fromTokenUid: currentUnderlying,
      toTokenUid: targetUnderlying,
      slippageTolerance: '0.01',
    });

    amountForBuy = swapPlan.exactToAmount;
    transactions.push(...swapPlan.transactions);
  }

  const buyPlan = await params.onchainActionsClient.createTokenizedYieldBuyPt({
    walletAddress: params.walletAddress,
    marketAddress: params.targetMarket.marketIdentifier.address,
    inputTokenUid: targetUnderlying,
    amount: amountForBuy,
    slippage: '0.01',
  });

  transactions.push(...buyPlan.transactions);

  logInfo('Pendle rebalance plan assembled', {
    transactionCount: transactions.length,
    fromMarket: params.currentMarket.marketIdentifier.address,
    toMarket: params.targetMarket.marketIdentifier.address,
  });

  return executePlanTransactions({ clients: params.clients, transactions });
}

export async function executeRollover(params: {
  onchainActionsClient: Pick<
    OnchainActionsClient,
    'createTokenizedYieldRedeemPt' | 'createSwap' | 'createTokenizedYieldBuyPt'
  >;
  clients: OnchainClients;
  walletAddress: `0x${string}`;
  position: TokenizedYieldPosition;
  currentMarket: TokenizedYieldMarket;
  targetMarket: TokenizedYieldMarket;
}): Promise<ExecutionResult> {
  const redeemPlan = await params.onchainActionsClient.createTokenizedYieldRedeemPt({
    walletAddress: params.walletAddress,
    ptTokenUid: params.position.pt.token.tokenUid,
    amount: params.position.pt.exactAmount,
  });

  let amountForBuy = redeemPlan.exactAmountOut ?? redeemPlan.exactUnderlyingAmount;
  const redeemedUnderlying =
    redeemPlan.tokenOut?.tokenUid ?? redeemPlan.underlyingTokenIdentifier;
  if (!amountForBuy) {
    throw new Error('Redeem PT plan did not include output amount.');
  }
  if (!redeemedUnderlying) {
    throw new Error('Redeem PT plan did not include output token.');
  }

  const transactions: TransactionPlan[] = [...redeemPlan.transactions];
  const targetUnderlying = params.targetMarket.underlyingToken.tokenUid;

  if (
    redeemedUnderlying.chainId !== targetUnderlying.chainId ||
    redeemedUnderlying.address.toLowerCase() !== targetUnderlying.address.toLowerCase()
  ) {
    const swapPlan = await params.onchainActionsClient.createSwap({
      walletAddress: params.walletAddress,
      amount: amountForBuy,
      amountType: 'exactIn',
      fromTokenUid: redeemedUnderlying,
      toTokenUid: targetUnderlying,
      slippageTolerance: '0.01',
    });

    amountForBuy = swapPlan.exactToAmount;
    transactions.push(...swapPlan.transactions);
  }

  const buyPlan = await params.onchainActionsClient.createTokenizedYieldBuyPt({
    walletAddress: params.walletAddress,
    marketAddress: params.targetMarket.marketIdentifier.address,
    inputTokenUid: targetUnderlying,
    amount: amountForBuy,
    slippage: '0.01',
  });

  transactions.push(...buyPlan.transactions);

  logInfo('Pendle rollover plan assembled', {
    transactionCount: transactions.length,
    fromMarket: params.currentMarket.marketIdentifier.address,
    toMarket: params.targetMarket.marketIdentifier.address,
  });

  return executePlanTransactions({ clients: params.clients, transactions });
}

export async function executeCompound(params: {
  onchainActionsClient: Pick<
    OnchainActionsClient,
    'createTokenizedYieldClaimRewards' | 'createSwap' | 'createTokenizedYieldBuyPt'
  >;
  clients: OnchainClients;
  walletAddress: `0x${string}`;
  position: TokenizedYieldPosition;
  currentMarket: TokenizedYieldMarket;
}): Promise<ExecutionResult> {
  const claimPlan = await params.onchainActionsClient.createTokenizedYieldClaimRewards({
    walletAddress: params.walletAddress,
    ytTokenUid: params.position.yt.token.tokenUid,
  });

  const transactions: TransactionPlan[] = [...claimPlan.transactions];
  const underlyingTokenUid = params.currentMarket.underlyingToken.tokenUid;

  let totalUnderlying = 0n;
  for (const reward of params.position.yt.claimableRewards) {
    if (isSameToken(reward.token.tokenUid, underlyingTokenUid)) {
      totalUnderlying += parseTokenAmount(reward.exactAmount, 'reward');
      continue;
    }

    const swapPlan = await params.onchainActionsClient.createSwap({
      walletAddress: params.walletAddress,
      amount: reward.exactAmount,
      amountType: 'exactIn',
      fromTokenUid: reward.token.tokenUid,
      toTokenUid: underlyingTokenUid,
      slippageTolerance: '0.01',
    });

    totalUnderlying += parseTokenAmount(swapPlan.exactToAmount, 'swap output');
    transactions.push(...swapPlan.transactions);
  }

  if (totalUnderlying <= 0n) {
    throw new Error('No Pendle rewards available to compound');
  }

  const buyPlan = await params.onchainActionsClient.createTokenizedYieldBuyPt({
    walletAddress: params.walletAddress,
    marketAddress: params.currentMarket.marketIdentifier.address,
    inputTokenUid: underlyingTokenUid,
    amount: totalUnderlying.toString(),
    slippage: '0.01',
  });

  transactions.push(...buyPlan.transactions);

  logInfo('Pendle compound plan assembled', {
    transactionCount: transactions.length,
    market: params.currentMarket.marketIdentifier.address,
  });

  return executePlanTransactions({ clients: params.clients, transactions });
}

export async function executeInitialDeposit(params: {
  onchainActionsClient: Pick<OnchainActionsClient, 'createSwap' | 'createTokenizedYieldBuyPt'>;
  clients: OnchainClients;
  walletAddress: `0x${string}`;
  fundingToken: Token;
  targetMarket: TokenizedYieldMarket;
  fundingAmount: string;
}): Promise<ExecutionResult> {
  let amountForBuy = params.fundingAmount;
  const transactions: TransactionPlan[] = [];

  const fundingTokenUid = params.fundingToken.tokenUid;
  const underlyingTokenUid = params.targetMarket.underlyingToken.tokenUid;

  if (
    fundingTokenUid.chainId !== underlyingTokenUid.chainId ||
    fundingTokenUid.address.toLowerCase() !== underlyingTokenUid.address.toLowerCase()
  ) {
    const swapPlan = await params.onchainActionsClient.createSwap({
      walletAddress: params.walletAddress,
      amount: params.fundingAmount,
      amountType: 'exactIn',
      fromTokenUid: fundingTokenUid,
      toTokenUid: underlyingTokenUid,
      slippageTolerance: '0.01',
    });

    amountForBuy = swapPlan.exactToAmount;
    transactions.push(...swapPlan.transactions);
  }

  const buyPlan = await params.onchainActionsClient.createTokenizedYieldBuyPt({
    walletAddress: params.walletAddress,
    marketAddress: params.targetMarket.marketIdentifier.address,
    inputTokenUid: underlyingTokenUid,
    amount: amountForBuy,
    slippage: '0.01',
  });

  transactions.push(...buyPlan.transactions);

  logInfo('Pendle initial deposit plan assembled', {
    transactionCount: transactions.length,
    market: params.targetMarket.marketIdentifier.address,
  });

  return executePlanTransactions({ clients: params.clients, transactions });
}
