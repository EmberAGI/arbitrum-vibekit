import { TokenIdentifierSchema } from '@emberai/onchain-actions-contracts/core';
import { createDataResultV1Schema } from '@emberai/onchain-actions-contracts/external-data';
import { describe, expect, it } from 'vitest';

describe('neutral contracts public Interface', () => {
  it('is consumable without the registry runtime', () => {
    expect(
      TokenIdentifierSchema.parse({
        chainId: '42161',
        address: '0x0000000000000000000000000000000000000001',
      }),
    ).toEqual({
      chainId: '42161',
      address: '0x0000000000000000000000000000000000000001',
    });
    expect(createDataResultV1Schema).toBeTypeOf('function');
  });
});
