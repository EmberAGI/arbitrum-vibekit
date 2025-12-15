import { NextRequest, NextResponse } from 'next/server';

import { PrivyApiClient, PrivyApiClientError, canWalletBeFunded } from '@/lib/privy-api-client';

function createPrivyClient(): PrivyApiClient | null {
  const password = process.env.PRIVY_APP_SECRET;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!password || !appId) {
    return null;
  }

  return new PrivyApiClient(appId, password, appId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ walletId: string }> },
): Promise<NextResponse> {
  const { walletId } = await params;

  // Guard: Check required environment variables
  const privyClient = createPrivyClient();
  if (!privyClient) {
    return NextResponse.json({ error: 'Privy credentials not configured' }, { status: 500 });
  }

  try {
    // Check if wallet has existing transactions on Arbitrum
    const transactionsResponse = await privyClient.getNativeArbitrumTransactions(walletId);
    const canFund = canWalletBeFunded(transactionsResponse);

    return NextResponse.json({ canFund }, { status: 200 });
  } catch (error) {
    console.error('[Wallet Fundable] Error:', error);

    if (error instanceof PrivyApiClientError) {
      return NextResponse.json(
        { error: 'Failed to communicate with Privy API', details: error.message },
        { status: 502 },
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to check wallet fundability', details: errorMessage },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
