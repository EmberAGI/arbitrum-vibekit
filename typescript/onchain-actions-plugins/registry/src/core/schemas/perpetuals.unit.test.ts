import { describe, expect, it } from 'vitest';

import {
  CreatePerpetualsDecreaseQuoteRequestSchema,
  CreatePerpetualsIncreaseQuoteRequestSchema,
  CreatePerpetualsOrderCancelPlanRequestSchema,
  GetPerpetualLifecycleRequestSchema,
  PerpetualQuoteResponseSchema,
  SubmitPerpetualsTransactionRequestSchema,
  SubmitPerpetualsTransactionResponseSchema,
} from './perpetuals.js';
import * as perpetualSchemas from './perpetuals.js';

describe('CreatePerpetualsDecreaseQuoteRequestSchema', () => {
  it('requires sizeDeltaUsd for nested partial decrease mode', () => {
    const validPartial = CreatePerpetualsDecreaseQuoteRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xcollateral',
      side: 'long',
      decrease: {
        mode: 'partial',
        sizeDeltaUsd: '100000000',
        slippageBps: '100',
      },
    });

    const invalidPartial = CreatePerpetualsDecreaseQuoteRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xcollateral',
      side: 'long',
      decrease: {
        mode: 'partial',
        slippageBps: '100',
      },
    });

    expect(validPartial.success).toBe(true);
    expect(invalidPartial.success).toBe(false);
  });

  it('accepts nested full mode and rejects legacy top-level mode payload', () => {
    const validFull = CreatePerpetualsDecreaseQuoteRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xcollateral',
      side: 'short',
      decrease: {
        mode: 'full',
        slippageBps: '100',
      },
    });

    const legacyTopLevel = CreatePerpetualsDecreaseQuoteRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xcollateral',
      side: 'short',
      mode: 'full',
      full: {
        slippageBps: '100',
      },
    });

    expect(validFull.success).toBe(true);
    expect(legacyTopLevel.success).toBe(false);
  });
});

describe('CreatePerpetualsIncreaseQuoteRequestSchema', () => {
  it('rejects decimal numeric strings for collateralDeltaAmount', () => {
    const valid = CreatePerpetualsIncreaseQuoteRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xcollateral',
      side: 'short',
      collateralDeltaAmount: '1000000',
      sizeDeltaUsd: '250000000',
      slippageBps: '120',
    });

    const invalid = CreatePerpetualsIncreaseQuoteRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xcollateral',
      side: 'short',
      collateralDeltaAmount: '1.2',
      sizeDeltaUsd: '250000000',
      slippageBps: '120',
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});

describe('CreatePerpetualsOrderCancelPlanRequestSchema', () => {
  it('requires orderKey', () => {
    const valid = CreatePerpetualsOrderCancelPlanRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      orderKey: '0xorder',
    });

    const invalid = CreatePerpetualsOrderCancelPlanRequestSchema.safeParse({
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});

describe('GetPerpetualLifecycleRequestSchema', () => {
  it('requires txHash', () => {
    const valid = GetPerpetualLifecycleRequestSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      txHash: '0xhash',
    });

    const invalid = GetPerpetualLifecycleRequestSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});

describe('PerpetualQuoteResponseSchema', () => {
  it('requires integer-string numeric fields and precision metadata', () => {
    const valid = PerpetualQuoteResponseSchema.safeParse({
      asOf: '2026-02-24T00:00:00.000Z',
      ttlMs: 30000,
      precision: {
        tokenDecimals: 6,
        priceDecimals: 30,
        usdDecimals: 30,
      },
      pricing: {
        markPrice: '1234500000000000000000000000000',
        acceptablePrice: '1234000000000000000000000000000',
        slippageBps: '100',
        priceImpactDeltaUsd: '1000000',
      },
      fees: {
        positionFeeUsd: '100000',
        borrowingFeeUsd: '25000',
        fundingFeeUsd: '1000',
      },
      warnings: [],
    });

    const invalid = PerpetualQuoteResponseSchema.safeParse({
      asOf: '2026-02-24T00:00:00.000Z',
      ttlMs: 30000,
      precision: {
        tokenDecimals: 6,
        priceDecimals: 30,
        usdDecimals: 30,
      },
      pricing: {
        markPrice: '1234500000000000000000000000000',
        acceptablePrice: '1.234',
        slippageBps: '100',
        priceImpactDeltaUsd: '1000000',
      },
      fees: {
        positionFeeUsd: '100000',
        borrowingFeeUsd: '25000',
        fundingFeeUsd: '1000',
      },
      warnings: [],
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});

describe('legacy perpetual core schema removal', () => {
  it('does not export close-order request schema', () => {
    expect(perpetualSchemas.ClosePerpetualsOrdersRequestSchema).toBeUndefined();
  });
});

describe('SubmitPerpetualsTransaction schemas', () => {
  it('validates request signed tx shape', () => {
    const valid = SubmitPerpetualsTransactionRequestSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      signedTx: '0xdeadbeef',
    });

    const invalid = SubmitPerpetualsTransactionRequestSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      signedTx: 'deadbeef',
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('requires canonical response fields and allows tracking metadata', () => {
    const valid = SubmitPerpetualsTransactionResponseSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      txHash: '0xtxhash',
      orderKey: '0xorder',
      walletAddress: '0xwallet',
      submittedAtBlock: '123456',
      asOf: '2026-02-25T00:00:00.000Z',
    });

    const invalid = SubmitPerpetualsTransactionResponseSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      asOf: '2026-02-25T00:00:00.000Z',
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
