import { describe, expect, it } from 'vitest';

import * as perpetualInterfaces from './perpetuals.js';

type SafeParseResult = { success: boolean };
type SafeParseSchema = { safeParse: (input: unknown) => SafeParseResult };

function getSchemaExport(schemaName: string): SafeParseSchema {
  const candidate = (perpetualInterfaces as Record<string, unknown>)[schemaName];

  expect(candidate).toBeDefined();

  if (!candidate || typeof candidate !== 'object' || !('safeParse' in candidate)) {
    throw new Error(`${schemaName} was not exported as a Zod schema`);
  }

  const schema = candidate as { safeParse: unknown };
  if (typeof schema.safeParse !== 'function') {
    throw new Error(`${schemaName} does not provide safeParse`);
  }

  return { safeParse: schema.safeParse as (input: unknown) => SafeParseResult };
}

describe('perpetual endpoint decrease request schemas', () => {
  it('exports decrease quote and plan request schemas with nested decrease mode', () => {
    const quoteSchema = getSchemaExport('CreatePerpetualsDecreaseQuoteRequestSchema');
    const planSchema = getSchemaExport('CreatePerpetualsDecreasePlanRequestSchema');

    const request = {
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
    };

    expect(quoteSchema.safeParse(request).success).toBe(true);
    expect(planSchema.safeParse(request).success).toBe(true);

    const legacyRequest = {
      walletAddress: '0xabc',
      providerName: 'gmx',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xcollateral',
      side: 'long',
      mode: 'partial',
      partial: {
        sizeDeltaUsd: '100000000',
        slippageBps: '100',
      },
    };

    expect(quoteSchema.safeParse(legacyRequest).success).toBe(false);
    expect(planSchema.safeParse(legacyRequest).success).toBe(false);
  });
});

describe('perpetual endpoint submit transaction schemas', () => {
  it('exports submit request/response schemas', () => {
    const submitRequestSchema = getSchemaExport(
      'SubmitPerpetualsTransactionRequestSchema',
    );
    const submitResponseSchema = getSchemaExport(
      'SubmitPerpetualsTransactionResponseSchema',
    );

    const validRequest = submitRequestSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      signedTx: '0xdeadbeef',
    });
    const invalidRequest = submitRequestSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      signedTx: 'deadbeef',
    });

    const validResponse = submitResponseSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      txHash: '0xtxhash',
      asOf: '2026-02-25T00:00:00.000Z',
    });
    const invalidResponse = submitResponseSchema.safeParse({
      providerName: 'gmx',
      chainId: '42161',
      asOf: '2026-02-25T00:00:00.000Z',
    });

    expect(validRequest.success).toBe(true);
    expect(invalidRequest.success).toBe(false);
    expect(validResponse.success).toBe(true);
    expect(invalidResponse.success).toBe(false);
  });
});
