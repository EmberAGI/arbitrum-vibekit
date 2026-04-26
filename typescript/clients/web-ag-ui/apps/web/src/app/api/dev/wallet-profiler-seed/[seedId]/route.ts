import { NextResponse } from 'next/server';

import {
  getWalletProfilerSeedPreview,
  isWalletProfilerSeedPreviewEnabled,
} from '../store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ seedId: string }> },
): Promise<NextResponse> {
  if (!isWalletProfilerSeedPreviewEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Wallet profiler seed preview is disabled.',
      },
      { status: 404 },
    );
  }

  const { seedId } = await params;
  const seed = getWalletProfilerSeedPreview(seedId);
  if (!seed) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Wallet profiler seed not found.',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    emberOnboardingSeed: seed,
  });
}
