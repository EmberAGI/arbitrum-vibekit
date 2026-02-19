import { NextResponse } from 'next/server';

import { fetchOnchainActionsTokensPage } from '@/clients/onchainActionsIcons';

function resolveOnchainActionsBaseUrl(): string {
  return process.env.ONCHAIN_ACTIONS_API_URL ?? process.env.NEXT_PUBLIC_ONCHAIN_ACTIONS_API_URL ?? 'https://api.emberai.xyz';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page');
  const cursor = url.searchParams.get('cursor');
  const chainIds = url.searchParams.getAll('chainIds');

  const result = await fetchOnchainActionsTokensPage({
    baseUrl: resolveOnchainActionsBaseUrl(),
    page: page ? Number(page) : undefined,
    cursor: cursor || undefined,
    chainIds: chainIds.length > 0 ? chainIds : undefined,
  });

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

