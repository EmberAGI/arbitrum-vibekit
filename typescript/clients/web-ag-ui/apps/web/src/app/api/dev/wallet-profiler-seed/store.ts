import { randomUUID } from 'node:crypto';

import type { EmberOnboardingSeed } from '@/types/agent';

const walletProfilerSeedPreviewStore = new Map<string, EmberOnboardingSeed>();

export function isWalletProfilerSeedPreviewEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NEXT_PUBLIC_UI_PREVIEW === 'true';
}

export function storeWalletProfilerSeedPreview(args: {
  origin: string;
  seed: EmberOnboardingSeed;
}): { previewUrl: string; seedId: string } {
  const seedId = randomUUID();
  walletProfilerSeedPreviewStore.set(seedId, args.seed);

  const previewUrl = new URL('/hire-agents/agent-portfolio-manager', args.origin);
  previewUrl.searchParams.set('__uiState', 'onboarding');
  previewUrl.searchParams.set('__fixture', 'wallet-profiler-seed');
  previewUrl.searchParams.set('seedId', seedId);

  return {
    previewUrl: previewUrl.toString(),
    seedId,
  };
}

export function getWalletProfilerSeedPreview(seedId: string): EmberOnboardingSeed | null {
  return walletProfilerSeedPreviewStore.get(seedId) ?? null;
}

export function clearWalletProfilerSeedPreviewStore(): void {
  walletProfilerSeedPreviewStore.clear();
}
