import { NextResponse } from 'next/server';

import {
  isWalletProfilerSeedPreviewEnabled,
  storeWalletProfilerSeedPreview,
} from './store';
import { isEmberOnboardingSeed } from '@/utils/emberOnboardingSeed';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isWalletProfilerSeedPreviewEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Wallet profiler seed preview is disabled.',
      },
      { status: 404 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid wallet profiler seed.',
      },
      { status: 400 },
    );
  }

  if (!isEmberOnboardingSeed(payload)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid wallet profiler seed.',
      },
      { status: 400 },
    );
  }

  const { previewUrl, seedId } = storeWalletProfilerSeedPreview({
    origin: new URL(request.url).origin,
    seed: payload,
  });

  return NextResponse.json({
    ok: true,
    previewUrl,
    seedId,
  });
}
