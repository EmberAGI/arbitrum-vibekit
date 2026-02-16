import { NextResponse } from 'next/server';

import { fetchOnchainActionsChainsPage } from '@/clients/onchainActionsIcons';

function resolveOnchainActionsBaseUrl(): string {
  return process.env.ONCHAIN_ACTIONS_API_URL ?? process.env.NEXT_PUBLIC_ONCHAIN_ACTIONS_API_URL ?? 'https://api.emberai.xyz';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page');
  const cursor = url.searchParams.get('cursor');

  const result = await fetchOnchainActionsChainsPage({
    baseUrl: resolveOnchainActionsBaseUrl(),
    page: page ? Number(page) : undefined,
    cursor: cursor || undefined,
  });

  return NextResponse.json(result, {
    headers: {
      // This endpoint is just a CORS-safe proxy for client use.
      'Cache-Control': 'no-store',
    },
  });
}

