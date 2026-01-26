import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseGwei, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { z } from 'zod';

const HexAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const AuthorizationSchema = z.object({
  chainId: z.number(),
  address: HexAddressSchema,
  nonce: z.number(),
  r: z.string(),
  s: z.string(),
  yParity: z.number(),
  v: z.string().optional(),
});

const BodySchema = z.object({
  authorization: AuthorizationSchema,
  address: HexAddressSchema,
});

type Authorization = z.infer<typeof AuthorizationSchema>;

async function broadcast7702Authorization(authorization: Authorization, to: Hex): Promise<string> {
  const privateKey = process.env.FUNDING_WALLET_PRIVATE_KEY as Hex;
  const relayer = privateKeyToAccount(privateKey);

  const client = createWalletClient({
    account: relayer,
    chain: arbitrum,
    transport: http(arbitrum.rpcUrls.default.http[0]),
  });

  return client.sendTransaction({
    type: 'eip7702',
    to,
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
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const fundingPrivateKey = process.env.FUNDING_WALLET_PRIVATE_KEY;
  if (!fundingPrivateKey) {
    return NextResponse.json({ error: 'Relayer wallet not configured' }, { status: 500 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid authorization payload', details: parsed.error.message },
      { status: 400 },
    );
  }

  try {
    const transactionHash = await broadcast7702Authorization(
      parsed.data.authorization,
      parsed.data.address as Hex,
    );

    return NextResponse.json(
      {
        message: 'Wallet upgraded successfully',
        upgraded: true,
        transactionHash,
        chain: 'arbitrum',
      },
      { status: 200 },
    );
  } catch (error) {
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
