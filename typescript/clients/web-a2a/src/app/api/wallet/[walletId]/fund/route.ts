import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

import { PrivyApiClient, PrivyApiClientError, canWalletBeFunded } from '@/lib/privy-api-client';

const FUNDING_AMOUNT = '0.0005'; // ETH

// Simple in-memory lock to prevent concurrent funding for the same wallet
const fundingLocks = new Set<string>();

function createPrivyClient(): PrivyApiClient | null {
  const password = process.env.PRIVY_APP_SECRET;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!password || !appId) {
    return null;
  }

  return new PrivyApiClient(appId, password, appId);
}

async function sendFunding(toAddress: string): Promise<string> {
  const privateKey = process.env.FUNDING_WALLET_PRIVATE_KEY as Hex;
  const account = privateKeyToAccount(privateKey);

  const client = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(),
  });

  const hash = await client.sendTransaction({
    to: toAddress as Hex,
    value: parseEther(FUNDING_AMOUNT),
  });

  return hash;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ walletId: string }> },
): Promise<NextResponse> {
  const { walletId } = await params;

  // Guard: Check required environment variables
  const privyClient = createPrivyClient();
  if (!privyClient) {
    return NextResponse.json({ error: 'Privy credentials not configured' }, { status: 500 });
  }

  const fundingPrivateKey = process.env.FUNDING_WALLET_PRIVATE_KEY;
  if (!fundingPrivateKey) {
    return NextResponse.json({ error: 'Funding wallet not configured' }, { status: 500 });
  }

  // Guard: Check if wallet is already being funded (lock mechanism)
  if (fundingLocks.has(walletId)) {
    return NextResponse.json(
      { error: 'Funding already in progress for this wallet' },
      { status: 409 },
    );
  }

  // Acquire lock
  fundingLocks.add(walletId);

  try {
    // Guard: Check if wallet has existing transactions
    const transactionsResponse = await privyClient.getNativeArbitrumTransactions(walletId);

    if (!canWalletBeFunded(transactionsResponse)) {
      return NextResponse.json(
        { message: 'Wallet already has transactions, no funding needed', funded: false },
        { status: 200 },
      );
    }

    // Guard: Get wallet address
    const wallet = await privyClient.getWallet(walletId);

    // Send funding
    console.log(
      `[Wallet Fund] Sending ${FUNDING_AMOUNT} ETH to ${wallet.address} (wallet: ${walletId})`,
    );
    const txHash = await sendFunding(wallet.address);
    console.log(`[Wallet Fund] Transaction sent: ${txHash}`);

    return NextResponse.json(
      {
        message: 'Wallet funded successfully',
        funded: true,
        transactionHash: txHash,
        amount: FUNDING_AMOUNT,
        chain: 'arbitrum',
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[Wallet Fund] Error:', error);

    if (error instanceof PrivyApiClientError) {
      return NextResponse.json(
        { error: 'Failed to communicate with Privy API', details: error.message },
        { status: 502 },
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fund wallet', details: errorMessage },
      { status: 500 },
    );
  } finally {
    // Release lock
    fundingLocks.delete(walletId);
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
