import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { TokenIdentifierSchema as ContractsTokenIdentifierSchema } from '@emberai/onchain-actions-contracts/core';
import { describe, expect, it } from 'vitest';

import { TokenIdentifierSchema as RegistryTokenIdentifierSchema } from './index.js';

describe('registry contract compatibility', () => {
  it('re-exports the contracts schema instance instead of defining a copy', () => {
    expect(RegistryTokenIdentifierSchema).toBe(ContractsTokenIdentifierSchema);
  });

  it('keeps the built compatibility adapter dependent on contracts', async () => {
    const distPath = path.resolve(import.meta.dirname, '../dist/index.mjs');
    const builtRegistry = await readFile(distPath, 'utf8');

    expect(builtRegistry).toContain('from "@emberai/onchain-actions-contracts/core"');
    expect(builtRegistry).toContain('from "@emberai/onchain-actions-contracts/plugins"');
    expect(builtRegistry).toContain('from "@emberai/onchain-actions-contracts/endpoints"');
    expect(builtRegistry).not.toContain('TokenPriceReadResultV1Schema');
    expect(builtRegistry).not.toContain('TokenMarketSnapshotEnvelopeV1Schema');
  });
});
