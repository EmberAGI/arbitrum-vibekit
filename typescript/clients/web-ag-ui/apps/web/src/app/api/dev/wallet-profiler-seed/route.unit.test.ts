import { beforeEach, describe, expect, it } from 'vitest';

import { GET } from './[seedId]/route';
import { POST } from './route';
import { clearWalletProfilerSeedPreviewStore } from './store';
import type { EmberOnboardingSeed } from '@/types/agent';

const walletProfilerSeed: EmberOnboardingSeed = {
  pm_setup: {
    risk_level: 'medium',
    diagnosis_summary: 'Active DeFi user with missing reserve policy.',
    portfolio_intent_summary:
      'Use Portfolio Agent to preserve upside while enforcing reserve discipline.',
    operator_caveats: ['Only the lending mandate is persisted today.'],
  },
  first_managed_mandate: {
    target_agent_id: 'ember-lending',
    target_agent_key: 'ember-lending-primary',
    managed_mandate: {
      lending_policy: {
        collateral_policy: {
          assets: [
            {
              asset: 'USDC',
              max_allocation_pct: 35,
            },
          ],
        },
        borrow_policy: {
          allowed_assets: [],
        },
        risk_policy: {
          max_ltv_bps: 4500,
          min_health_factor: '1.60',
        },
      },
    },
  },
  future_subagent_plan: {
    status: 'exploratory_not_persisted',
    summary: 'Future strategy is not persisted by current onboarding.',
  },
};

describe('/api/dev/wallet-profiler-seed', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_UI_PREVIEW = 'true';
    clearWalletProfilerSeedPreviewStore();
  });

  it('stores a valid preview seed and returns a short seedId URL', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/dev/wallet-profiler-seed', {
        method: 'POST',
        body: JSON.stringify(walletProfilerSeed),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      seedId: string;
      previewUrl: string;
    };

    expect(body.ok).toBe(true);
    expect(body.seedId).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.previewUrl).toContain('/hire-agents/agent-portfolio-manager');
    expect(body.previewUrl).toContain('__fixture=wallet-profiler-seed');
    expect(body.previewUrl).toContain(`seedId=${body.seedId}`);
    expect(body.previewUrl).not.toContain('__walletProfilerSeed');

    const storedResponse = await GET(
      new Request(`http://localhost:3000/api/dev/wallet-profiler-seed/${body.seedId}`),
      { params: Promise.resolve({ seedId: body.seedId }) },
    );

    expect(storedResponse.status).toBe(200);
    await expect(storedResponse.json()).resolves.toEqual({
      ok: true,
      emberOnboardingSeed: walletProfilerSeed,
    });
  });

  it('rejects the dev endpoint when UI preview mode is disabled', async () => {
    delete process.env.NEXT_PUBLIC_UI_PREVIEW;

    const response = await POST(
      new Request('http://localhost:3000/api/dev/wallet-profiler-seed', {
        method: 'POST',
        body: JSON.stringify(walletProfilerSeed),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Wallet profiler seed preview is disabled.',
    });
  });

  it('rejects invalid seed payloads', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/dev/wallet-profiler-seed', {
        method: 'POST',
        body: JSON.stringify({ pm_setup: {} }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid wallet profiler seed.',
    });
  });

  it('returns 404 for unknown seed ids', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/dev/wallet-profiler-seed/missing'),
      { params: Promise.resolve({ seedId: 'missing' }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Wallet profiler seed not found.',
    });
  });
});
