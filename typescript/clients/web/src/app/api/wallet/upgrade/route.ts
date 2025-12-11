import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseGwei, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { z } from 'zod';

// Schema for the authorization object from Privy
const AuthorizationSchema = z.object({
  chainId: z.number(),
  address: z.string(),
  nonce: z.number(),
  r: z.string(),
  s: z.string(),
  yParity: z.number(),
  v: z.string().optional(),
});

type Authorization = z.infer<typeof AuthorizationSchema>;

async function broadcast7702Authorization(
  authorization: Authorization,
  address: Hex,
): Promise<string> {
  const privateKey = process.env.FUNDING_WALLET_PRIVATE_KEY as Hex;
  const relayer = privateKeyToAccount(privateKey);

  const client = createWalletClient({
    account: relayer,
    chain: arbitrum,
    transport: http(),
  });

  const hash = await client.sendTransaction({
    type: 'eip7702',
    to: address,
    data: '0x',
    value: BigInt(0),
    authorizationList: [
      {
        chainId: authorization.chainId,
        address: authorization.address as Hex,
        nonce: authorization.nonce,
        r: authorization.r as Hex,
        s: authorization.s as Hex,
        v: authorization.v ? BigInt(authorization.v) : undefined,
        yParity: authorization.yParity,
      },
    ],
    maxFeePerGas: parseGwei('0.1'),
    maxPriorityFeePerGas: parseGwei('0.01'),
  });

  return hash;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const fundingPrivateKey = process.env.FUNDING_WALLET_PRIVATE_KEY;
  if (!fundingPrivateKey) {
    return NextResponse.json({ error: 'Relayer wallet not configured' }, { status: 500 });
  }

  // Parse and validate request body
  let authorization: Authorization;
  let address: Hex;
  try {
    const body = await request.json();
    authorization = AuthorizationSchema.parse(body.authorization);
    address = body.address as Hex;
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid authorization payload', details: String(error) },
      { status: 400 },
    );
  }

  try {
    console.log(`[Wallet Upgrade] Broadcasting 7702 authorization`);
    const txHash = await broadcast7702Authorization(authorization, address);
    console.log(`[Wallet Upgrade] Transaction sent: ${txHash}`);

    return NextResponse.json(
      {
        message: 'Wallet upgraded successfully',
        upgraded: true,
        transactionHash: txHash,
        chain: 'arbitrum',
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[Wallet Upgrade] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to upgrade wallet', details: errorMessage },
      { status: 500 },
    );
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
